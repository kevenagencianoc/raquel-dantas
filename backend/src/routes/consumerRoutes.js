import { Router } from "express";
import { getDb } from "../firebaseAdmin.js";
import { obterDetalhesPedidoParaConsumer } from "../services/consumerService.js";

const router = Router();

/**
 * ✅ Pega token de várias formas (Consumer varia muito):
 * - query ?token=
 * - header token / x-access-token / authorization
 */
function getToken(req) {
  let t =
    req.query.token ||
    req.headers["token"] ||
    req.headers["x-access-token"] ||
    req.headers["x-partner-token"] ||
    req.headers["authorization"];

  // "Bearer xxx"
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
 * ✅ POLLING
 * GET /api/consumer/polling
 *
 * 🔥 Importante:
 * Muitos Consumers substituem {id} e IGNORAM {orderId}
 * Outros usam orderId.
 *
 * Então aqui mandamos:
 * - id = ID REAL do pedido (Firestore doc id)
 * - orderId = ID REAL do pedido (Firestore doc id)
 *
 * Assim qualquer um dos dois funciona.
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
      id: d.id,       // ✅ alguns Consumers usam {id}
      orderId: d.id,  // ✅ outros usam {orderId}
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
 * ✅ DETALHES DO PEDIDO
 * GET /api/consumer/orders/:id
 *
 * (o :id aqui pode ser tanto {id} quanto {orderId}, pois ambos são iguais)
 */
router.get("/orders/:id", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });
    }

    const response = await obterDetalhesPedidoParaConsumer(req.params.id);
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
 * ✅ STATUS
 * POST /api/consumer/orders/:id/status
 */
router.post("/orders/:id/status", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });
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

    return res.json({ statusCode: 0, reasonPhrase: `${id} atualizado.` });
  } catch (e) {
    console.error("❌ Erro ao receber status:", e);
    return res.status(500).json({ statusCode: 99, reasonPhrase: "Erro interno no status" });
  }
});

/**
 * ✅ DETAILS (POST) - alguns PDVs chamam
 * POST /api/consumer/orders/:id/details
 */
router.post("/orders/:id/details", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });
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
    return res.status(500).json({ statusCode: 99, reasonPhrase: "Erro interno no details" });
  }
});

export default router;
