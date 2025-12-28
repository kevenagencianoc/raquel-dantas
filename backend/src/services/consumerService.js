import { getDb } from "../firebaseAdmin.js";
import crypto from "crypto";

/* =========================
   Helpers
========================= */

function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function isoAgora() {
  return new Date().toISOString();
}

/**
 * Normaliza datas vindas do Firestore
 */
function normalizarDataParaISO(valor) {
  if (!valor) return isoAgora();

  // Timestamp serializado
  if (typeof valor === "object" && valor._seconds) {
    const ms = valor._seconds * 1000 + Math.floor((valor._nanoseconds || 0) / 1e6);
    return new Date(ms).toISOString();
  }

  // Timestamp real
  if (typeof valor?.toDate === "function") {
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

/* =========================
   Normalizações
========================= */

function normalizarMetodoPagamento(pedido) {
  const raw = (
    pedido?.pagamento?.tipo ||
    pedido?.pagamento?.metodo ||
    pedido?.payment?.method ||
    "PIX"
  )
    .toString()
    .toUpperCase();

  if (raw.includes("CART") || raw.includes("CARD") || raw.includes("CRED")) {
    return "CREDIT";
  }
  if (raw.includes("DIN") || raw.includes("CASH")) {
    return "CASH";
  }
  return "PIX";
}

function obterItens(pedido) {
  if (Array.isArray(pedido?.itens)) return pedido.itens;
  if (Array.isArray(pedido?.items)) return pedido.items;
  return [];
}

/* =========================
   Montagem dos itens
   🔥 externalCode = NUMBER
========================= */

function montarItens(pedido) {
  const lista = obterItens(pedido);

  return lista.map((i, idx) => {
    const qtd = Number(i.qtd ?? i.quantidade ?? 1);
    const unitPrice = Number(i.preco ?? i.unitPrice ?? 0);
    const totalPrice = Number(i.subtotal ?? unitPrice * qtd);

    return {
      id: uuid(),
      index: idx + 1,
      name: i.nome ?? i.name ?? "Produto",
      externalCode: Number(i.externalCode), // ✅ CORREÇÃO DEFINITIVA
      quantity: qtd,
      unitPrice,
      totalPrice,
      unit: "UN",
      ean: null,
      price: totalPrice,
      observations: i.observacoes ?? null,
      imageUrl: i.imageUrl ?? null,
      options: null,
      uniqueId: uuid(),
      optionsPrice: 0,
      addition: 0,
      scalePrices: null,
    };
  });
}

/* =========================
   Totais
========================= */

function montarTotal(pedido, items) {
  const deliveryFee = Number(
    pedido?.resumo?.taxaEntrega ??
      pedido?.entrega?.taxaEntrega ??
      0
  );

  const subTotal =
    Number(pedido?.resumo?.totalProdutos) ||
    items.reduce((acc, it) => acc + Number(it.totalPrice || 0), 0);

  const orderAmount =
    Number(pedido?.resumo?.totalFinal) ||
    subTotal + deliveryFee;

  return {
    subTotal,
    deliveryFee,
    orderAmount,
    benefits: 0,
    additionalFees: 0,
  };
}

/* =========================
   Delivery
========================= */

function montarDelivery(pedido, createdAtISO) {
  if (pedido?.entrega?.tipo === "retirada") return null;

  const rua = pedido?.entrega?.rua || "Rua";
  const numero = pedido?.entrega?.numero || "S/N";
  const bairro = pedido?.entrega?.bairro || "Centro";

  return {
    mode: "DEFAULT",
    deliveredBy: "Partner",
    pickupCode: "0000",
    deliveryDateTime: normalizarDataParaISO(
      pedido?.entrega?.dataHoraEntrega || createdAtISO
    ),
    deliveryAddress: {
      country: "BR",
      state: "BA",
      city: "Banzaê",
      postalCode: "00000000",
      streetName: rua,
      streetNumber: numero,
      neighborhood: bairro,
      complement: null,
      reference: null,
      formattedAddress: `${rua}, ${numero} - ${bairro}`,
      coordinates: {
        latitude: 0,
        longitude: 0,
      },
    },
    observations: pedido?.observacoes ?? null,
  };
}

/* =========================
   Pedido FINAL Consumer
========================= */

function montarPedidoConsumer(orderId, pedido) {
  const createdAtISO = normalizarDataParaISO(
    pedido?.criadoEm ?? pedido?.createdAt
  );

  const items = montarItens(pedido);
  const total = montarTotal(pedido, items);
  const method = normalizarMetodoPagamento(pedido);

  return {
    benefits: 0,
    orderType:
      pedido?.entrega?.tipo === "retirada" ? "TAKEOUT" : "DELIVERY",

    payments: {
      methods: [
        {
          method,
          prepaid: false,
          currency: "BRL",
          type: "OFFLINE",
          value: total.orderAmount,
          cash: method === "CASH" ? { changeFor: 0 } : null,
          card: method === "CREDIT" ? { brand: null } : null,
          wallet: null,
        },
      ],
      pending: total.orderAmount,
      prepaid: 0,
    },

    merchant: {
      id: process.env.MERCHANT_ID || "raquel-dantas",
      name: process.env.MERCHANT_NAME || "Raquel Dantas Confeitaria",
    },

    salesChannel: "PARTNER",
    orderTiming: "IMMEDIATE",
    createdAt: createdAtISO,
    preparationStartDateTime: createdAtISO,

    id: String(orderId),
    displayId: String(orderId).slice(0, 6).toUpperCase(),

    items,

    customer: {
      id: uuid(),
      name: pedido?.cliente?.nome || "Cliente",
      phone: {
        number: String(
          pedido?.cliente?.whatsapp || pedido?.cliente?.telefone || "00000000000"
        ),
        localizer: gerarLocalizer(),
        localizerExpiration: new Date(
          Date.now() + 60 * 60 * 1000
        ).toISOString(),
      },
      documentNumber: null,
      ordersCountOnMerchant: null,
      segmentation: "Cliente",
    },

    extraInfo: pedido?.observacoes ?? null,
    additionalFees: null,
    delivery: montarDelivery(pedido, createdAtISO),
    schedule: null,
    indoor: null,
    takeout: null,
    additionalInfometadata: null,

    total,
  };
}

/* =========================
   EXPORT PRINCIPAL
========================= */

export async function obterDetalhesPedidoParaConsumer(orderId) {
  const db = getDb();
  const ref = db.collection("pedidos").doc(String(orderId));
  const snap = await ref.get();

  if (!snap.exists) {
    return { item: null, statusCode: 2, reasonPhrase: "Pedido não encontrado" };
  }

  const pedido = snap.data();
  const item = montarPedidoConsumer(orderId, pedido);

  if (!item.items || item.items.length === 0) {
    return {
      item: null,
      statusCode: 99,
      reasonPhrase: "Pedido sem itens",
    };
  }

  await ref.set(
    {
      integracao: {
        ...(pedido.integracao || {}),
        status: "enviado_para_consumer",
        enviadoEm: isoAgora(),
      },
    },
    { merge: true }
  );

  return { item, statusCode: 0, reasonPhrase: null };
}
