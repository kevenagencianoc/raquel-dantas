import { Router } from "express";
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
  return getToken(req) === process.env.PARTNER_TOKEN;
}

/**
 * 🔥 POLLING
 */
router.get("/polling", async (req, res) => {
  if (!authToken(req))
    return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });

  return res.json({
    items: [],
    statusCode: 0,
    reasonPhrase: null,
  });
});

/**
 * 🔥 DETALHES DO PEDIDO (CRÍTICO)
 */
router.get("/orders/:orderId", async (req, res) => {
  if (!authToken(req))
    return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });

  const response = await obterDetalhesPedidoParaConsumer(req.params.orderId);
  return res.json(response);
});

export default router;
