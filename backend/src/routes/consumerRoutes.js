import { Router } from "express";
import { getDb } from "../firebaseAdmin.js";
import { obterDetalhesPedidoParaConsumer } from "../services/consumerService.js";
import crypto from "crypto";

const router = Router();

function getToken(req) {
  let t =
    req.query.token ||
    req.headers["token"] ||
    req.headers["x-access-token"] ||
    req.headers["authorization"];

  if (typeof t === "string" && t.toLowerCase().startsWith("bearer ")) {
    t = t.slice(7).trim();
  }

  return t;
}

function authToken(req) {
  return getToken(req) === process.env.PARTNER_TOKEN;
}

/* ===================== POLLING ===================== */
router.get("/polling", async (req, res) => {
  if (!authToken(req)) {
    return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });
  }

  const db = getDb();
  const snap = await db
    .collection("pedidos")
    .where("integracao.status", "==", "pronto_para_enviar_consumer")
    .get();

  const items = snap.docs.map((d) => ({
    id: crypto.randomUUID(), // ID DO EVENTO
    orderId: d.id,           // ID DO PEDIDO (Firestore)
    createdAt: new Date().toISOString(),
    fullCode: "PLACED",
    code: "PLC",
  }));

  return res.json({ items, statusCode: 0, reasonPhrase: null });
});

/* ===================== DETALHES ===================== */
router.get("/orders/:orderId", async (req, res) => {
  if (!authToken(req)) {
    return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });
  }

  const response = await obterDetalhesPedidoParaConsumer(req.params.orderId);
  return res.json(response);
});

export default router;
