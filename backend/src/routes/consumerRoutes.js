import { Router } from "express";
import { getDb } from "../firebaseAdmin.js";

const router = Router();

function authToken(req) {
  const token = req.query.token;
  return token && token === process.env.PARTNER_TOKEN;
}

/**
 * GET /api/consumer/polling?token=SEU_TOKEN
 * Retorna eventos somente para pedidos "pronto_para_enviar_consumer"
 * (quando o Consumer buscar os detalhes, o pedido vira "enviado_para_consumer" e some daqui).
 */
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
    id: d.id,
    orderId: d.id,
    createdAt: new Date().toISOString(),
    fullCode: "PLACED",
    code: "PLC",
  }));

  return res.json({
    items,
    statusCode: 0,
    reasonPhrase: null,
  });
});

/**
 * GET /api/consumer/orders/:orderId?token=SEU_TOKEN
 * O Consumer pede o pedido completo pelo ID.
 * ✅ Aqui marcamos o pedido como "enviado_para_consumer" para não voltar no polling.
 */
router.get("/orders/:orderId", async (req, res) => {
  if (!authToken(req)) {
    return res.status(401).json({ statusCode: 1, reasonPhrase: "Token inválido" });
  }

  const db = getDb();
  const { orderId } = req.params;

  const ref = db.collection("pedidos").doc(orderId);
  const snap = await ref.get();

  if (!snap.exists) {
    return res.status(404).json({ statusCode: 2, reasonPhrase: "Pedido não encontrado" });
  }

  const p = snap.data();

  const itens = (p.itens || []).map((i, idx) => ({
    id: `${orderId}_${idx}`,
    index: idx + 1,
    name: i.nome,
    externalCode: String(i.externalCode || i.id || ""), // ⚠️ depois vamos mapear pro código do PDV
    quantity: Number(i.qtd || 1),
    unitPrice: { value: Number(i.preco || 0), currency: "BRL" },
    totalPrice: {
      value: Number(i.subtotal ?? (i.preco || 0) * (i.qtd || 1)),
      currency: "BRL",
    },
    specialInstructions: null,
    options: null,
  }));

  const deliveryFee = Number(p?.resumo?.taxaEntrega || 0);
  const subTotal = Number(p?.resumo?.totalProdutos || 0);
  const orderAmount = Number(p?.resumo?.totalFinal || subTotal + deliveryFee);

  const payload = {
    item: {
      id: orderId,
      displayId: orderId.slice(0, 6).toUpperCase(),
      orderType: p?.entrega?.tipo === "retirada" ? "TAKEOUT" : "DELIVERY",
      salesChannel: "PARTNER",
      orderTiming: "IMMEDIATE",
      createdAt: new Date().toISOString(),
      preparationStartDateTime: new Date().toISOString(),

      merchant: {
        id: process.env.MERCHANT_ID || "raquel-dantas",
        name: process.env.MERCHANT_NAME || "Raquel Dantas Confeitaria",
      },

      total: {
        subTotal,
        deliveryFee,
        orderAmount,
        benefits: 0,
        additionalFees: 0,
      },

      payments: {
        methods: [
          {
            method: p?.pagamento?.tipo === "cartao" ? "CREDIT" : "PIX",
            type: "OFFLINE",
            currency: "BRL",
            value: orderAmount,
            prepaid: false,
            cash: null,
            card: null,
            wallet: null,
          },
        ],
        pending: orderAmount,
        prepaid: 0,
      },

      customer: {
        name: p?.cliente?.nome || "Cliente",
        documentNumber: null,
        phone: { number: p?.cliente?.whatsapp ? String(p.cliente.whatsapp) : null },
      },

      delivery:
        p?.entrega?.tipo === "entrega"
          ? {
              deliveredBy: "Partner",
              deliveryAddress: {
                streetName: p?.entrega?.rua || "",
                streetNumber: p?.entrega?.numero || "",
                neighborhood: p?.entrega?.bairro || "",
                city: "Banzaê",
                state: "BA",
                country: "BR",
                postalCode: "",
                formattedAddress: `${p?.entrega?.rua || ""}, ${p?.entrega?.numero || ""} - ${
                  p?.entrega?.bairro || ""
                }`,
                coordinates: { latitude: 0, longitude: 0 },
                reference: null,
                complement: null,
              },
              deliveryDateTime: null,
              observations: p?.observacoes || null,
            }
          : null,

      items: itens,
      extraInfo: p?.observacoes || null,
    },
    statusCode: 0,
    reasonPhrase: null,
  };

  // ✅ Marca que o Consumer consultou os detalhes + remove do polling
  await ref.set(
    {
      integracao: {
        ...(p.integracao || {}),
        detalhesConsultadosEm: new Date().toISOString(),
        status: "enviado_para_consumer",
        enviadoEm: new Date().toISOString(),
      },
    },
    { merge: true }
  );

  return res.json(payload);
});

/**
 * POST /api/consumer/orders/:orderId/status?token=SEU_TOKEN
 * Consumer avisa mudanças de status.
 */
router.post("/orders/:orderId/status", async (req, res) => {
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

  return res.json({
    statusCode: 0,
    reasonPhrase: `${orderId} atualizado.`,
  });
});

export default router;
