import { Router } from "express";
import crypto from "crypto";
import { getDb } from "../firebaseAdmin.js";
import { obterDetalhesPedidoParaConsumer } from "../services/consumerService.js";

const router = Router();

/* =========================
   TOKEN
========================= */
function getToken(req) {
  let t =
    req.query.token ||
    req.headers["token"] ||
    req.headers["x-access-token"] ||
    req.headers["x-partner-token"] ||
    req.headers["x-api-key"] ||
    req.headers["apikey"] ||
    req.headers["authorization"];

  if (typeof t === "string" && t.toLowerCase().startsWith("bearer ")) {
    t = t.slice(7).trim();
  }
  if (Array.isArray(t)) t = t[0];
  return t;
}

function authToken(req) {
  const recebido = getToken(req);
  const esperado = process.env.PARTNER_TOKEN;
  return !!(esperado && recebido && recebido === esperado);
}

function isoAgora() {
  return new Date().toISOString();
}

function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/* =========================
   1) POLLING (GET)
   ✅ Agora pega pedidos recentes mesmo sem integracao.status
========================= */
router.get("/polling", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });
    }

    const db = getDb();

    // Vamos buscar pedidos recentes. Tentamos por "criadoEm", se não existir usamos "createdAt".
    let docs = [];

    try {
      const snap = await db
        .collection("pedidos")
        .orderBy("criadoEm", "desc")
        .limit(30)
        .get();
      docs = snap.docs;
    } catch (e1) {
      try {
        const snap = await db
          .collection("pedidos")
          .orderBy("createdAt", "desc")
          .limit(30)
          .get();
        docs = snap.docs;
      } catch (e2) {
        // fallback final: sem orderBy (não ideal, mas não para o sistema)
        const snap = await db.collection("pedidos").limit(30).get();
        docs = snap.docs;
      }
    }

    const items = [];

    for (const d of docs) {
      const pedidoId = d.id;
      const pedido = d.data() || {};
      const integracao = pedido.integracao || {};

      // Se já marcou como integrado/consumido, ignora
      if (integracao.eventoPendente === false || integracao.status === "integrado_consumer") {
        continue;
      }

      // Cria evento se não existir ainda
      let eventoId = integracao.eventoId;
      let eventoCreatedAt = integracao.eventoCreatedAt;

      if (!eventoId) {
        eventoId = uuid();
        eventoCreatedAt = isoAgora();

        await db.collection("pedidos").doc(pedidoId).set(
          {
            integracao: {
              ...(integracao || {}),
              eventoId,
              eventoCreatedAt,
              eventoPendente: true,
              status: integracao.status || "pronto_para_enviar_consumer",
            },
          },
          { merge: true }
        );
      } else {
        // garante que fique pendente se não estiver marcado como false
        if (integracao.eventoPendente !== true) {
          await db.collection("pedidos").doc(pedidoId).set(
            {
              integracao: {
                ...(integracao || {}),
                eventoPendente: true,
              },
            },
            { merge: true }
          );
        }
      }

      // Devolve o evento no polling
      items.push({
        id: String(eventoId),
        orderId: String(pedidoId),
        createdAt: String(eventoCreatedAt || isoAgora()),
        fullCode: "PLACED",
        code: "PLC",
      });

      // opcional: marca que notificou (não remove do polling)
      await db.collection("pedidos").doc(pedidoId).set(
        {
          integracao: {
            ...(integracao || {}),
            consumerNotificadoEm: isoAgora(),
            status: "consumer_notificado",
            eventoId,
            eventoCreatedAt,
            eventoPendente: true,
          },
        },
        { merge: true }
      );
    }

    return res.status(200).json({ items, statusCode: 0, reasonPhrase: null });
  } catch (e) {
    console.error("❌ Erro no polling:", e);
    return res.status(200).json({ items: [], statusCode: 0, reasonPhrase: null });
  }
});

/* =========================
   2) DETALHES DO PEDIDO (GET)
   ✅ Quando o consumer pega detalhes OK, consome o evento (eventoPendente=false)
========================= */
router.get("/orders/:orderId", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({ item: null, statusCode: 1, reasonPhrase: "Token inválido" });
    }

    const { orderId } = req.params;
    const resp = await obterDetalhesPedidoParaConsumer(orderId);

    // se entregou detalhes corretamente, consome evento
    if (resp?.statusCode === 0 && resp?.item) {
      const db = getDb();
      await db.collection("pedidos").doc(String(orderId)).set(
        {
          integracao: {
            status: "integrado_consumer",
            integradoEm: isoAgora(),
            eventoPendente: false,
          },
        },
        { merge: true }
      );
    }

    return res.status(200).json(resp);
  } catch (e) {
    console.error("❌ Erro ao retornar detalhes:", e);
    return res.status(500).json({ item: null, statusCode: 99, reasonPhrase: "Erro interno nos detalhes" });
  }
});

/* =========================
   3) STATUS (POST)
========================= */
router.post("/orders/:orderId/status", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });
    }

    const db = getDb();
    const { orderId } = req.params;
    const body = req.body || {};

    await db.collection("pedidos").doc(String(orderId)).set(
      {
        integracao: {
          statusConsumer: body.status || null,
          justification: body.justification || null,
          statusPayload: body,
          statusAtualizadoEm: isoAgora(),
        },
      },
      { merge: true }
    );

    return res.status(200).json({ statusCode: 0, reasonPhrase: null });
  } catch (e) {
    console.error("❌ Erro ao receber status:", e);
    return res.status(500).json({ statusCode: 99, reasonPhrase: "Erro interno no status" });
  }
});

export default router;
