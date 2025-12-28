import { Router } from "express";
import { getDb } from "../firebaseAdmin.js";
import { obterDetalhesPedidoParaConsumer } from "../services/consumerService.js";

const router = Router();

/* =========================
   TOKEN (compatível com Consumer)
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
  if (!esperado) return false;
  return recebido && recebido === esperado;
}

/* =========================
   GET /api/consumer/polling
   ✅ Retorna eventos e faz ACK:
   - muda status para consumer_notificado
   (evita loop infinito no Consumer)
========================= */
router.get("/polling", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({
        statusCode: 1,
        reasonPhrase: "Token inválido (polling)",
      });
    }

    const db = getDb();

    // Pega somente pedidos "novos"
    const snap = await db
      .collection("pedidos")
      .where("integracao.status", "==", "pronto_para_enviar_consumer")
      .get();

    const agora = new Date().toISOString();
    const items = [];

    // ✅ MONTA EVENTOS + FAZ ACK
    for (const d of snap.docs) {
      const pedidoId = d.id;
      const data = d.data();

      items.push({
        id: pedidoId,
        orderId: pedidoId,
        createdAt: agora,
        fullCode: "PLACED",
        code: "PLC",
      });

      // 🔥 ACK: marca que o Consumer já foi notificado
      await db.collection("pedidos").doc(pedidoId).set(
        {
          integracao: {
            ...(data.integracao || {}),
            status: "consumer_notificado",
            consumerNotificadoEm: agora,
          },
        },
        { merge: true }
      );
    }

    return res.json({ items, statusCode: 0, reasonPhrase: null });
  } catch (e) {
    console.error("❌ Erro no polling:", e);
    return res.status(500).json({
      statusCode: 99,
      reasonPhrase: "Erro interno no polling",
    });
  }
});

/* =========================
   GET /api/consumer/orders/:id
   ✅ Retorna detalhes e marca integrado_consumer
========================= */
router.get("/orders/:id", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({
        item: null,
        statusCode: 1,
        reasonPhrase: "Token inválido (orders)",
      });
    }

    const orderId = req.params.id;

    // pega detalhes no formato correto do consumerService
    const resp = await obterDetalhesPedidoParaConsumer(orderId);

    // se achou, marca como integrado
    if (resp?.statusCode === 0 && resp?.item) {
      const db = getDb();

      await db.collection("pedidos").doc(String(orderId)).set(
        {
          integracao: {
            status: "integrado_consumer",
            integradoEm: new Date().toISOString(),
          },
        },
        { merge: true }
      );
    }

    return res.status(200).json(resp);
  } catch (e) {
    console.error("❌ Erro ao retornar detalhes:", e);
    return res.status(500).json({
      item: null,
      statusCode: 99,
      reasonPhrase: "Erro interno nos detalhes",
    });
  }
});

/* =========================
   POST /api/consumer/orders/:id/status
   Consumer manda status (aceito, cancelado, etc)
========================= */
router.post("/orders/:id/status", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({
        statusCode: 1,
        reasonPhrase: "Token inválido (status)",
      });
    }

    const db = getDb();
    const { id } = req.params;
    const body = req.body || {};

    await db.collection("pedidos").doc(id).set(
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

    return res.json({ statusCode: 0, reasonPhrase: "OK" });
  } catch (e) {
    console.error("❌ Erro ao receber status:", e);
    return res.status(500).json({
      statusCode: 99,
      reasonPhrase: "Erro interno no status",
    });
  }
});

/* =========================
   POST /api/consumer/orders/:id/details
   Alguns Consumers chamam este endpoint
========================= */
router.post("/orders/:id/details", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({
        statusCode: 1,
        reasonPhrase: "Token inválido (details)",
      });
    }

    const db = getDb();
    const { id } = req.params;

    await db.collection("pedidos").doc(id).set(
      {
        integracao: {
          detalhesPostRecebidoEm: new Date().toISOString(),
          detalhesPostPayload: req.body || null,
        },
      },
      { merge: true }
    );

    return res.json({ statusCode: 0, reasonPhrase: "OK" });
  } catch (e) {
    console.error("❌ Erro no POST details:", e);
    return res.status(500).json({
      statusCode: 99,
      reasonPhrase: "Erro interno no details",
    });
  }
});

export default router;
