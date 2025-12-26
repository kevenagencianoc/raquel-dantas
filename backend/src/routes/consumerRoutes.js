import { Router } from "express";
import { getDb } from "../firebaseAdmin.js";

const router = Router();

function getToken(req) {
  // Pode vir de várias formas dependendo do PDV
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

  // Se veio duplicado na query (?token=a&token=b), o Express pode entregar como array
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
 * GET /api/consumer/orders/:orderId
 * Retorna detalhes do pedido
 * ✅ Marca como "enviado_para_consumer" para não repetir no polling
 */
router.get("/orders/:orderId", async (req, res) => {
  try {
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
      externalCode: String(i.externalCode || i.id || ""),
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
  } catch (e) {
    console.error("❌ Erro ao retornar detalhes:", e);
    return res.status(500).json({ statusCode: 99, reasonPhrase: "Erro interno nos detalhes" });
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
 * Alguns Consumers chamam esse endpoint (campo 4).
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
