import { getDb } from "../firebaseAdmin.js";
import crypto from "crypto";

/* ===================== HELPERS ===================== */

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

function isoAgora() {
  return new Date().toISOString();
}

/**
 * 🔥 Converte QUALQUER coisa em ISO
 */
function normalizarDataParaISO(valor) {
  if (!valor) return isoAgora();

  // Timestamp serializado
  if (typeof valor === "object" && valor._seconds) {
    const ms = valor._seconds * 1000 + Math.floor((valor._nanoseconds || 0) / 1e6);
    return new Date(ms).toISOString();
  }

  // Timestamp Admin SDK
  if (typeof valor === "object" && typeof valor.toDate === "function") {
    return valor.toDate().toISOString();
  }

  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "number") return new Date(valor).toISOString();

  if (typeof valor === "string") {
    const d = new Date(valor);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  return isoAgora();
}

function gerarLocalizer() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

function normalizarMetodoPagamento(pedido) {
  const raw = (
    pedido?.pagamento?.tipo ||
    pedido?.pagamento?.metodo ||
    "PIX"
  ).toUpperCase();

  if (raw.includes("CART") || raw.includes("CARD")) return "CREDIT";
  if (raw.includes("DIN") || raw.includes("CASH")) return "CASH";
  return "PIX";
}

/* ===================== MONTAGEM ===================== */

function montarItens(pedido) {
  return (pedido.itens || []).map((i, idx) => {
    const qtd = Number(i.qtd ?? 1);
    const preco = Number(i.preco ?? 0);

    return {
      id: uuid(),
      index: idx + 1,
      name: i.nome,
      externalCode: String(i.externalCode || i.id || "0"),
      quantity: qtd,
      unitPrice: preco,
      totalPrice: preco * qtd,
      unit: "UN",
      ean: null,
      price: preco * qtd,
      observations: null,
      imageUrl: null,
      options: null,
      uniqueId: uuid(),
      optionsPrice: 0,
      addition: 0,
      scalePrices: null,
    };
  });
}

function montarDelivery(pedido, createdAtISO) {
  if (pedido?.entrega?.tipo !== "entrega") return null;

  return {
    mode: "DEFAULT",
    deliveredBy: "Partner",
    pickupCode: "0000",
    deliveryDateTime: createdAtISO, // 🔥 NUNCA NULL
    deliveryAddress: {
      country: "BR",
      state: "BA",
      city: "Banzaê",
      postalCode: "00000000",
      streetName: pedido.entrega.rua || "Rua",
      streetNumber: pedido.entrega.numero || "S/N",
      neighborhood: pedido.entrega.bairro || "Centro",
      complement: null,
      reference: null,
      formattedAddress: `${pedido.entrega.rua}, ${pedido.entrega.numero}`,
      coordinates: { latitude: 0, longitude: 0 },
    },
    observations: pedido.observacoes || null,
  };
}

/* ===================== PRINCIPAL ===================== */

export async function obterDetalhesPedidoParaConsumer(orderId) {
  const db = getDb();
  const ref = db.collection("pedidos").doc(orderId);
  const snap = await ref.get();

  if (!snap.exists) {
    return { item: null, statusCode: 2, reasonPhrase: "Pedido não encontrado" };
  }

  const pedido = snap.data();

  const createdAtISO = normalizarDataParaISO(
    pedido.createdAt || pedido.criadoEm || snap.createTime
  );

  const itens = montarItens(pedido);

  const totalProdutos = itens.reduce((s, i) => s + i.totalPrice, 0);

  const item = {
    benefits: 0,
    orderType: "DELIVERY",
    payments: {
      methods: [
        {
          method: normalizarMetodoPagamento(pedido),
          prepaid: false,
          currency: "BRL",
          type: "OFFLINE",
          value: totalProdutos,
          cash: null,
          card: null,
          wallet: null,
        },
      ],
      pending: totalProdutos,
      prepaid: 0,
    },
    merchant: {
      id: "raquel-dantas",
      name: "Raquel Dantas Confeitaria",
    },
    salesChannel: "PARTNER",
    picking: null,
    orderTiming: "IMMEDIATE",
    createdAt: createdAtISO,
    preparationStartDateTime: createdAtISO,
    id: orderId,
    displayId: orderId.slice(0, 6).toUpperCase(),
    items: itens,
    customer: {
      id: uuid(),
      name: pedido.cliente.nome,
      phone: {
        number: String(pedido.cliente.whatsapp),
        localizer: gerarLocalizer(),
        localizerExpiration: new Date(Date.now() + 3600000).toISOString(),
      },
      documentNumber: null,
      ordersCountOnMerchant: null,
      segmentation: "Cliente",
    },
    extraInfo: pedido.observacoes || null,
    additionalFees: null,
    delivery: montarDelivery(pedido, createdAtISO),
    schedule: null,
    indoor: null,
    takeout: null,
    additionalInfometadata: null,
    total: {
      subTotal: totalProdutos,
      deliveryFee: 0,
      orderAmount: totalProdutos,
      benefits: 0,
      additionalFees: 0,
    },
  };

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
