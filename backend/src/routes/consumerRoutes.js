import { Router } from "express";
import crypto from "crypto";
import { getDb } from "../firebaseAdmin.js";
import { obterDetalhesPedidoParaConsumer } from "../services/consumerService.js";

const router = Router();

/* =========================
   TOKEN (Consumer aceita query e headers)
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
  // Se não tiver PARTNER_TOKEN no .env, bloqueia (mais seguro).
  return !!(esperado && recebido && recebido === esperado);
}

/* =========================
   1) POLLING (Consumer consulta eventos)
   Manual: items[{id, orderId, createdAt ISO, fullCode, code}] + statusCode
   REGRA CRÍTICA: NÃO "ACK" cedo demais.
   O evento deve continuar aparecendo até o Consumer pegar os detalhes com sucesso.
========================= */
router.get("/polling", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });
    }

    const db = getDb();

    // ✅ Buscamos pedidos que ainda precisam gerar/emitir evento
    // - status "pronto_para_enviar_consumer"
    // - OU status "consumer_notificado" (caso já tenha marcado antes, mas sem concluir)
    // Obs: usamos 'in' em um único campo (geralmente não exige índice composto)
    let snap;
    try {
      snap = await db
        .collection("pedidos")
        .where("integracao.status", "in", ["pronto_para_enviar_consumer", "consumer_notificado"])
        .get();
    } catch (e) {
      // fallback: se "in" não estiver habilitado no seu projeto
      const s1 = await db
        .collection("pedidos")
        .where("integracao.status", "==", "pronto_para_enviar_consumer")
        .get();
      const s2 = await db
        .collection("pedidos")
        .where("integracao.status", "==", "consumer_notificado")
        .get();

      const map = new Map();
      for (const d of s1.docs) map.set(d.id, d);
      for (const d of s2.docs) map.set(d.id, d);
      snap = { docs: Array.from(map.values()) };
    }

    const items = [];

    for (const d of snap.docs) {
      const pedidoId = d.id;
      const data = d.data() || {};
      const integracao = data.integracao || {};

      /**
       * ✅ REGRA:
       * Se o evento estiver pendente, ele DEVE aparecer no polling SEMPRE.
       * Se ainda não existir evento, criamos agora com ID fixo.
       */
      let eventoId = integracao.eventoId;
      let eventoCreatedAt = integracao.eventoCreatedAt;
      let eventoPendente = integracao.eventoPendente;

      // Se nunca criamos evento, criamos e marcamos como pendente
      if (!eventoId) {
        eventoId = crypto.randomUUID();
        eventoCreatedAt = new Date().toISOString();
        eventoPendente = true;

        await db.collection("pedidos").doc(pedidoId).set(
          {
            integracao: {
              ...(integracao || {}),
              eventoId,
              eventoCreatedAt,
              eventoPendente: true,

              // Mantemos um status rastreável, mas NÃO tiramos do polling.
              // Se você quiser, pode manter o "pronto_para_enviar_consumer" aqui mesmo.
              status: integracao.status || "pronto_para_enviar_consumer",
            },
          },
          { merge: true }
        );
      }

      // Se evento está pendente, devolve no polling
      if (eventoPendente === true) {
        items.push({
          id: String(eventoId),         // ✅ id do evento (fixo)
          orderId: String(pedidoId),     // ✅ id do pedido
          createdAt: String(eventoCreatedAt || new Date().toISOString()),
          fullCode: "PLACED",
          code: "PLC",
        });

        // ✅ IMPORTANTE:
        // NÃO mude status para tirar do polling aqui.
        // No máximo, registre que o consumer foi notificado, mas mantendo eventoPendente true.
        await db.collection("pedidos").doc(pedidoId).set(
          {
            integracao: {
              ...(integracao || {}),
              consumerNotificadoEm: new Date().toISOString(),
              // status: "consumer_notificado" // <- você PODE setar, mas o evento continua pendente!
              status: "consumer_notificado",
              eventoId,
              eventoCreatedAt,
              eventoPendente: true,
            },
          },
          { merge: true }
        );
      }
    }

    return res.status(200).json({ items, statusCode: 0, reasonPhrase: null });
  } catch (e) {
    console.error("❌ Erro no polling:", e);
    return res.status(500).json({ statusCode: 99, reasonPhrase: "Erro interno no polling" });
  }
});

/* =========================
   2) GET DETALHES DO PEDIDO (Consumer consulta)
   Manual: retorna { item: {...}, statusCode: 0, reasonPhrase: null }
   REGRA CRÍTICA: quando deu sucesso, "fecha" o evento (eventoPendente=false).
========================= */
router.get("/orders/:orderId", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({ item: null, statusCode: 1, reasonPhrase: "Token inválido" });
    }

    const { orderId } = req.params;

    const resp = await obterDetalhesPedidoParaConsumer(orderId);

    // ✅ Se entregou detalhes corretamente, marca integrado e "consome" o evento
    if (resp?.statusCode === 0 && resp?.item) {
      const db = getDb();
      await db.collection("pedidos").doc(String(orderId)).set(
        {
          integracao: {
            status: "integrado_consumer",
            integradoEm: new Date().toISOString(),

            // ✅ ESSA É A CHAVE PRA NÃO SUMIR:
            // enquanto isso não for false, o polling continua devolvendo o evento.
            eventoPendente: false,
          },
        },
        { merge: true }
      );
    }

    return res.status(200).json(resp);
  } catch (e) {
    console.error("❌ Erro ao retornar detalhes:", e);
    return res
      .status(500)
      .json({ item: null, statusCode: 99, reasonPhrase: "Erro interno nos detalhes" });
  }
});

/* =========================
   3) STATUS (Consumer envia alterações do pedido)
   POST /orders/:orderId/status
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
          statusAtualizadoEm: new Date().toISOString(),
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
