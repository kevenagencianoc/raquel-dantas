import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { initFirebaseAdmin } from "./src/firebaseAdmin.js";
import consumerRoutes from "./src/routes/consumerRoutes.js";

dotenv.config();

const app = express();

/**
 * ✅ CORS:
 * - No desenvolvimento, pode ficar aberto.
 * - Em produção, a integração do Consumer geralmente não precisa de CORS,
 *   mas isso não atrapalha.
 */
app.use(cors());

/**
 * ✅ Body JSON:
 * Consumer pode enviar payload no POST de status.
 */
app.use(express.json({ limit: "2mb" }));

/**
 * ✅ Inicializa Firebase Admin (servidor)
 */
initFirebaseAdmin();

/**
 * ✅ Health check
 */
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "backend-raquel-delivery",
    time: new Date().toISOString(),
  });
});

/**
 * ✅ Rotas do Consumer (API do parceiro)
 * Aqui dentro ficam:
 * - GET  /api/consumer/polling
 * - GET  /api/consumer/orders/:orderId
 * - POST /api/consumer/orders/:orderId/status
 */
app.use("/api/consumer", consumerRoutes);

/**
 * ✅ Fallback: rota não encontrada
 */
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Rota não encontrada",
    path: req.originalUrl,
  });
});

/**
 * ✅ Inicialização do servidor
 */
const port = Number(process.env.PORT || 3333);
app.listen(port, () => {
  console.log(`✅ Backend rodando em http://localhost:${port}`);
});
