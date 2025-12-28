import { getDb } from "../firebaseAdmin.js";
import crypto from "crypto";

function uuid() {
  return crypto.randomUUID();
}

function isoAgora() {
  return new Date().toISOString();
}

export function montarPedidoConsumer(pedidoId, pedido) {
  const itens = pedido.itens || [];

  const items = itens.map((i, idx) => {
    const qtd = Number(i.quantidade || i.qtd || 1);
    const unitPrice = Number(i.preco || 0);

    return {
      id: uuid(),
      index: idx + 1,
      name: i.nome,
      externalCode: String(i.externalCode),
      quantity: qtd,
      unitPrice,
      totalPrice: unitPrice * qtd,
      unit: "UN",
      price: unitPrice * qtd,
      observations: null,
      options: null,
    };
  });

  const orderAmount = items.reduce((s, i) => s + i.totalPrice, 0);

  return {
    id: String(pedidoId),
    displayId: String(pedidoId),
    orderType: pedido?.entrega?.tipo === "retirada" ? "TAKEOUT" : "DELIVERY",
    salesChannel: "PARTNER",
    orderTiming: "IMMEDIATE",
    createdAt: isoAgora(),
    preparationStartDateTime: isoAgora(),

    merchant: {
      id: process.env.MERCHANT_ID || "raquel-dantas",
      name: process.env.MERCHANT_NAME || "Raquel Dantas Confeitaria",
    },

    customer: {
      id: uuid(),
      name: pedido?.cliente?.nome || "Cliente",
      phone: {
        number: String(pedido?.cliente?.whatsapp || "0000000000"),
        localizer: "12345678",
        localizerExpiration: new Date(Date.now() + 3600000).toISOString(),
      },
    },

    items,

    payments: {
      methods: [
        {
          method: pedido?.pagamento?.tipo === "cartao" ? "CREDIT" : "PIX",
          type: "OFFLINE",
          currency: "BRL",
          value: orderAmount,
          prepaid: false,
        },
      ],
      pending: orderAmount,
      prepaid: 0,
    },

    total: {
      subTotal: orderAmount,
      deliveryFee: 0,
      orderAmount,
      benefits: 0,
      additionalFees: 0,
    },

    delivery:
      pedido?.entrega?.tipo === "entrega"
        ? {
            deliveredBy: "Partner",
            deliveryAddress: {
              streetName: pedido?.entrega?.rua || "Rua",
              streetNumber: pedido?.entrega?.numero || "S/N",
              neighborhood: pedido?.entrega?.bairro || "Centro",
              city: "Banzaê",
              state: "BA",
              country: "BR",
              postalCode: "00000000",
              formattedAddress: `${pedido?.entrega?.rua || "Rua"}, ${
                pedido?.entrega?.numero || "S/N"
              }`,
              coordinates: { latitude: 0, longitude: 0 },
            },
          }
        : null,

    extraInfo: pedido?.observacoes || null,
  };
}

export async function obterDetalhesPedidoParaConsumer(orderId) {
  const db = getDb();
  const ref = db.collection("pedidos").doc(orderId);
  const snap = await ref.get();

  if (!snap.exists) {
    return { item: null, statusCode: 404, reasonPhrase: "Pedido não encontrado" };
  }

  const pedido = snap.data();
  const item = montarPedidoConsumer(orderId, pedido);

  await ref.set(
    {
      integracao: {
        status: "enviado_para_consumer",
        enviadoEm: isoAgora(),
      },
    },
    { merge: true }
  );

  return { item, statusCode: 0, reasonPhrase: null };
}
