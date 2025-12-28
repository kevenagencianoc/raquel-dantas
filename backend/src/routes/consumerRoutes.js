import { Router } from "express";
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
  return !!(esperado && recebido && recebido === esperado);
}

/* =========================
   1) POLLING (Consumer consulta eventos)
   Manual: items[{id, orderId, createdAt ISO, fullCode, code}] + statusCode :contentReference[oaicite:2]{index=2}
========================= */
router.get("/polling", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });
    }

    const db = getDb();

    // Somente pedidos "novos"
    const snap = await db
      .collection("pedidos")
      .where("integracao.status", "==", "pronto_para_enviar_consumer")
      .get();

    const agoraISO = new Date().toISOString();
    const items = [];

    for (const d of snap.docs) {
      const pedidoId = d.id;
      const data = d.data();

      items.push({
        id: pedidoId,
        orderId: pedidoId,
        createdAt: agoraISO,
        fullCode: "PLACED",
        code: "PLC",
      });

      // ✅ ACK: evita o Consumer ficar repetindo o mesmo pedido
      await db.collection("pedidos").doc(pedidoId).set(
        {
          integracao: {
            ...(data.integracao || {}),
            status: "consumer_notificado",
            consumerNotificadoEm: agoraISO,
          },
        },
        { merge: true }
      );
    }

    return res.json({ items, statusCode: 0, reasonPhrase: null });
  } catch (e) {
    console.error("❌ Erro no polling:", e);
    return res.status(500).json({ statusCode: 99, reasonPhrase: "Erro interno no polling" });
  }
});

/* =========================
   2) GET DETALHES DO PEDIDO (Consumer consulta)
   Manual: GET detalhes retorna { item: {...}, statusCode, reasonPhrase } :contentReference[oaicite:3]{index=3}
========================= */
router.get("/orders/:orderId", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({ item: null, statusCode: 1, reasonPhrase: "Token inválido" });
    }

    const { orderId } = req.params;

    const resp = await obterDetalhesPedidoParaConsumer(orderId);

    // Se entregou detalhes corretamente, marca integrado
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
    return res.status(500).json({ item: null, statusCode: 99, reasonPhrase: "Erro interno nos detalhes" });
  }
});

/* =========================
   3) POST ENVIO DE DETALHES DO PEDIDO (Consumer envia para o parceiro)
   Manual diz que o Consumer também pode enviar os detalhes para a API do parceiro :contentReference[oaicite:4]{index=4}
   A gente apenas ACEITA e salva para debug/log.
========================= */
router.post("/orders/:orderId/details", async (req, res) => {
  try {
    if (!authToken(req)) {
      return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });
    }

    const db = getDb();
    const { orderId } = req.params;

    await db.collection("pedidos").doc(String(orderId)).set(
      {
        integracao: {
          consumerDetailsPostEm: new Date().toISOString(),
          consumerDetailsPostPayload: req.body || null,
        },
      },
      { merge: true }
    );

    return res.json({ statusCode: 0, reasonPhrase: null });
  } catch (e) {
    console.error("❌ Erro no POST details:", e);
    return res.status(500).json({ statusCode: 99, reasonPhrase: "Erro interno no details" });
  }
});

/* =========================
   4) POST STATUS DO PEDIDO (Consumer envia atualização de status)
   Manual: Consumer comunica confirmação, cancelamento, etc :contentReference[oaicite:5]{index=5}
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

    return res.json({ statusCode: 0, reasonPhrase: null });
  } catch (e) {
    console.error("❌ Erro ao receber status:", e);
    return res.status(500).json({ statusCode: 99, reasonPhrase: "Erro interno no status" });
  }
});

export default router;
