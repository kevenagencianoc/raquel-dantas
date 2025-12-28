import { Router } from "express";
import { getDb } from "../firebaseAdmin.js";
import { obterDetalhesPedidoParaConsumer } from "../services/consumerService.js";
import crypto from "crypto";
import admin from "firebase-admin";

const router = Router();

function getToken(req) {
  let t =
    req.query.token ||
    req.headers["token"] ||
    req.headers["x-access-token"] ||
    req.headers["x-partner-token"] ||
    req.headers["authorization"];

  // Se veio como "Bearer xxx"
  if (typeof t === "string" && t.toLowerCase().startsWith("bearer ")) {
    t = t.slice(7).trim();
  }

  // Se veio duplicado na query (?token=a&token=b)
  if (Array.isArray(t)) t = t[0];

  return t;
}

function authToken(req) {
  const token = getToken(req);
  return token && token === process.env.PARTNER_TOKEN;
}

/**
 * 🔎 DEBUG (temporário)
 * GET /api/consumer/debug
 * Mostra qual projectId o backend está usando + 5 primeiros IDs de pedidos.
 */
router.get("/debug", async (req, res) => {
  try {
    // Se você quiser proteger com token, descomente:
    // if (!authToken(req)) {
    //   return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });
    // }

    const db = getDb();
    const snap = await db.collection("pedidos").limit(5).get();
    const ids = snap.docs.map((d) => d.id);

    return res.json({
      projectId: admin.app().options.projectId,
      primeirosPedidos: ids,
      statusCode: 0,
      reasonPhrase: null,
    });
  } catch (e) {
    console.error("❌ Erro no debug:", e);
    return res.status(500).json({
      statusCode: 99,
      reasonPhrase: "Erro interno no debug",
      erro: e.message,
    });
  }
});

/**
 * ✅ POLLING
 * GET /api/consumer/polling
 * Retorna eventos somente para pedidos "pronto_para_enviar_consumer"
 *
 * ⚠️ IMPORTANTE:
 * - id = ID DO EVENTO (use UUID)
 * - orderId = ID DO PEDIDO (ID do documento Firestore)
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
      id: crypto.randomUUID(),  // ✅ evento (não pode confundir com pedido)
      orderId: d.id,            // ✅ pedido (TEM que ser o ID do Firestore)
      createdAt: new Date().toISOString(),
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
 * ✅ DETALHES DO PEDIDO (FORMATO DO MANUAL)
 * GET /api/consumer/orders/:orderId
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
    return res.status(500).json({
      item: null,
      statusCode: 99,
      reasonPhrase: "Erro interno nos detalhes",
    });
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
 * Vamos aceitar e salvar no Firestore para debug.
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
