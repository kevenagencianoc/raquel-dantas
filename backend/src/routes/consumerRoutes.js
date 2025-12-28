import { Router } from "express";
import { getDb } from "../firebaseAdmin.js";
import { obterDetalhesPedidoParaConsumer } from "../services/consumerService.js";

const router = Router();

function getToken(req) {
  let t =
    req.query.token ||
    req.headers["token"] ||
    req.headers["x-access-token"] ||
    req.headers["x-partner-token"] ||
    req.headers["authorization"];

  if (typeof t === "string" && t.toLowerCase().startsWith("bearer ")) {
    t = t.slice(7).trim();
  }

  if (Array.isArray(t)) t = t[0];
  return t;
}

function authToken(req) {
  const token = getToken(req);
  return token && token === process.env.PARTNER_TOKEN;
}

/**
 * GET /api/consumer/polling
 * Retorna eventos somente para pedidos "pronto_para_enviar_consumer"
 */
router.get("/polling", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });
    }

    const db = getDb();

    const snap = await db
      .collection("pedidos")
      .where("integracao.status", "==", "pronto_para_enviar_consumer")
      .get();

    const items = snap.docs.map((d) => ({
      id: d.id,
      orderId: d.id,
      createdAt: new Date().toISOString(), // UTC ISO
      fullCode: "PLACED",
      code: "PLC",
    }));

    return res.json({ items, statusCode: 0, reasonPhrase: null });
  } catch (e) {
    console.error("❌ Erro no polling:", e);
    return res.status(500).json({ statusCode: 99, reasonPhrase: "Erro interno no polling" });
  }
});

/**
 * GET /api/consumer/orders/:orderId
 * Retorna detalhes do pedido (FORMATO DO MANUAL)
 */
router.get("/orders/:orderId", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });
    }

    const response = await obterDetalhesPedidoParaConsumer(req.params.orderId);
    return res.status(200).json(response);
  } catch (e) {
    console.error("❌ Erro ao retornar detalhes:", e);
    return res.status(500).json({ item: null, statusCode: 99, reasonPhrase: "Erro interno nos detalhes" });
  }
});

/**
 * POST /api/consumer/orders/:orderId/status
 * Consumer envia mudanças de status
 */
router.post("/orders/:orderId/status", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });
    }

    const db = getDb();
    const { orderId } = req.params;
    const body = req.body || {};

    await db.collection("pedidos").doc(orderId).set(
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

    return res.json({ statusCode: 0, reasonPhrase: `${orderId} atualizado.` });
  } catch (e) {
    console.error("❌ Erro ao receber status:", e);
    return res.status(500).json({ statusCode: 99, reasonPhrase: "Erro interno no status" });
  }
});

/**
 * POST /api/consumer/orders/:orderId/details
 * Alguns Consumers chamam esse endpoint.
 */
router.post("/orders/:orderId/details", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });
    }

    const db = getDb();
    const { orderId } = req.params;

    await db.collection("pedidos").doc(orderId).set(
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
    return res.status(500).json({ statusCode: 99, reasonPhrase: "Erro interno no details" });
  }
});

export default router;
