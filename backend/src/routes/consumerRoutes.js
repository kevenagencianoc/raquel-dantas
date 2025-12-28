import { Router } from "express";
import { getDb } from "../firebaseAdmin.js";
import { obterDetalhesPedidoParaConsumer } from "../services/consumerService.js";

const router = Router();

/**
 * ✅ Lê token de TUDO quanto é lugar:
 * - query ?token=
 * - headers comuns do Consumer
 * - authorization Bearer
 */
function getToken(req) {
  let t =
    req.query.token ||
    req.headers["token"] ||
    req.headers["x-access-token"] ||
    req.headers["x-partner-token"] ||
    req.headers["x-api-key"] ||
    req.headers["apikey"] ||
    req.headers["authorization"];

  // "Bearer xxx"
  if (typeof t === "string" && t.toLowerCase().startsWith("bearer ")) {
    t = t.slice(7).trim();
  }

  // Se veio duplicado (?token=a&token=b), pega o primeiro
  if (Array.isArray(t)) t = t[0];

  return t;
}

function authToken(req) {
  const tokenRecebido = getToken(req);
  const tokenEsperado = process.env.PARTNER_TOKEN;

  // Se você estiver sem env no Render, evita explodir e mostra erro claro
  if (!tokenEsperado) return false;

  return tokenRecebido && tokenRecebido === tokenEsperado;
}

/**
 * GET /api/consumer/polling
 */
router.get("/polling", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({
        statusCode: 1,
        reasonPhrase: "Token inválido (polling)",
      });
    }

    const db = getDb();

    const snap = await db
      .collection("pedidos")
      .where("integracao.status", "==", "pronto_para_enviar_consumer")
      .get();

    const agora = new Date().toISOString();

    // ✅ id e orderId iguais (compatibilidade total)
    const items = snap.docs.map((d) => ({
      id: d.id,
      orderId: d.id,
      createdAt: agora,
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
 * GET /api/consumer/orders/:id
 */
router.get("/orders/:id", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({
        item: null,
        statusCode: 1,
        reasonPhrase: "Token inválido (orders)",
      });
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
 * POST /api/consumer/orders/:id/status
 */
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
    return res.status(500).json({ statusCode: 99, reasonPhrase: "Erro interno no status" });
  }
});

/**
 * POST /api/consumer/orders/:id/details
 */
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
    return res.status(500).json({ statusCode: 99, reasonPhrase: "Erro interno no details" });
  }
});

export default router;
