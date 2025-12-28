import { getDb } from "../firebaseAdmin.js";
import crypto from "crypto";

/* =========================
   HELPERS
========================= */
function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function isoAgora() {
  return new Date().toISOString();
}

function normalizarDataParaISO(valor) {
  if (!valor) return isoAgora();

  if (typeof valor === "object" && valor._seconds) {
    const ms = valor._seconds * 1000 + Math.floor((valor._nanoseconds || 0) / 1e6);
    return new Date(ms).toISOString();
  }

  if (typeof valor?.toDate === "function") return valor.toDate().toISOString();
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "number") return new Date(valor).toISOString();

  if (typeof valor === "string") {
    const d = new Date(valor);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  return isoAgora();
}

function gerarLocalizer() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

/* =========================
   ITENS
========================= */
function obterItens(pedido) {
  if (Array.isArray(pedido?.itens)) return pedido.itens;
  if (Array.isArray(pedido?.items)) return pedido.items;
  return [];
}

function obterExternalCodeItem(i) {
  const candidatos = [
    i?.externalCode,
    i?.codigoPdv,
    i?.codPdv,
    i?.pdv,
    i?.codigo,
    i?.idProduto,
  ];

  for (const c of candidatos) {
    if (c !== undefined && c !== null && String(c).trim() !== "") {
      return String(c).trim();
    }
  }

  return "1"; // ⚠️ nunca vazio
}

function montarItens(pedido) {
  const lista = obterItens(pedido);

  return lista.map((i, idx) => {
    const qtd = Number(i.qtd ?? i.quantidade ?? 1);
    const unitPrice = Number(i.preco ?? i.unitPrice ?? 0);
    const totalPrice = unitPrice * qtd;

    return {
      id: uuid(),
      index: idx + 1,
      name: i.nome ?? i.name ?? "Produto",
      externalCode: obterExternalCodeItem(i),
      quantity: qtd,
      unitPrice,
      totalPrice,
      unit: "UN",
      ean: null,
      price: totalPrice,
      observations: i.observacoes ?? null,
      imageUrl: null,
      options: null,
      uniqueId: uuid(),
      optionsPrice: 0,
      addition: 0,
      scalePrices: null,
    };
  });
}

/* =========================
   TOTAL
========================= */
function montarTotal(items) {
  const subTotal = items.reduce((s, i) => s + Number(i.totalPrice || 0), 0);

  return {
    subTotal,
    deliveryFee: 0,
    orderAmount: subTotal,
    benefits: 0,
    additionalFees: 0,
  };
}

/* =========================
   DELIVERY
========================= */
function montarDelivery(pedido, createdAtISO) {
  return {
    mode: "DEFAULT",
    deliveredBy: "MERCHANT", // ⚠️ obrigatório para aparecer
    pickupCode: "",          // ⚠️ não pode ser null
    deliveryDateTime: createdAtISO,
    deliveryAddress: {
      country: "BR",
      state: pedido?.entrega?.estado || "BA",
      city: pedido?.entrega?.cidade || "Banzaê",
      postalCode: pedido?.entrega?.cep || "00000000",
      streetName: pedido?.entrega?.rua || "Rua",
      streetNumber: pedido?.entrega?.numero || "S/N",
      neighborhood: pedido?.entrega?.bairro || "Centro",
      complement: null,
      reference: null,
      formattedAddress: "Entrega",
      coordinates: { latitude: 0, longitude: 0 },
    },
    observations: null,
  };
}

/* =========================
   PEDIDO CONSUMER (FINAL)
========================= */
function montarPedidoConsumer(orderId, pedido) {
  const createdAtISO = normalizarDataParaISO(pedido?.criadoEm ?? pedido?.createdAt);
  const items = montarItens(pedido);
  const total = montarTotal(items);

  // 🔥 DISPLAY ID OBRIGATORIAMENTE NUMÉRICO
  const displayId =
    String(pedido?.numero ?? "").replace(/\D/g, "") ||
    String(Math.floor(1000 + Math.random() * 9000));

  return {
    orderType: "DELIVERY",
    salesChannel: "PARTNER",
    orderTiming: "IMMEDIATE",

    createdAt: createdAtISO,
    preparationStartDateTime: createdAtISO,

    merchant: {
      id: "raquel-dantas",
      name: "Raquel Dantas Confeitaria",
    },

    total,

    // ⚠️ PAGAMENTO DUMMY (OBRIGATÓRIO)
    payments: {
      methods: [
        {
          method: "OTHER",
          type: "PENDING",
          currency: "BRL",
          value: 0,
        },
      ],
      pending: 0,
      prepaid: 0,
    },

    id: String(orderId),
    displayId, // ⚠️ se não for número, NÃO APARECE NA FILA

    customer: {
      id: uuid(),
      name: pedido?.cliente?.nome || "Cliente",
      phone: {
        number: "000000000",
        localizer: gerarLocalizer(),
        localizerExpiration: isoAgora(),
      },
      documentNumber: null,
      ordersCountOnMerchant: 0,
    },

    delivery: montarDelivery(pedido, createdAtISO),

    picking: null,
    schedule: null,
    indoor: null,
    takeout: null,

    items,

    extraInfo: null,
    additionalFees: null,
    additionalInfometadata: null,
  };
}

/* =========================
   EXPORT
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
    return { item: null, statusCode: 99, reasonPhrase: "Pedido sem itens" };
  }

  await ref.set(
    {
      integracao: {
        integradoEm: isoAgora(),
        status: "integrado_consumer",
      },
    },
    { merge: true }
  );

  return { item, statusCode: 0, reasonPhrase: null };
}
