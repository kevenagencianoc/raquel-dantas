import { getDb } from "../firebaseAdmin.js";
import crypto from "crypto";

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

  // Timestamp serializado
  if (typeof valor === "object" && valor._seconds) {
    const ms = valor._seconds * 1000 + Math.floor((valor._nanoseconds || 0) / 1e6);
    return new Date(ms).toISOString();
  }

  // Timestamp real (Admin SDK)
  if (typeof valor?.toDate === "function") return valor.toDate().toISOString();

  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "number") return new Date(valor).toISOString();

  if (typeof valor === "string") {
    const d = new Date(valor);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  return isoAgora();
}

function gerarLocalizer() {
  return String(Math.floor(10000000 + Math.random() * 90000000)); // 8 dígitos
}

function normalizarMetodoPagamento(pedido) {
  const raw = (
    pedido?.pagamento?.tipo ||
    pedido?.pagamento?.metodo ||
    pedido?.payment?.method ||
    "PIX"
  )
    .toString()
    .toUpperCase();

  if (raw.includes("CART") || raw.includes("CARD") || raw.includes("CRED")) return "CREDIT";
  if (raw.includes("DIN") || raw.includes("CASH")) return "CASH";
  return "PIX";
}

function obterItens(pedido) {
  if (Array.isArray(pedido?.itens)) return pedido.itens;
  if (Array.isArray(pedido?.items)) return pedido.items;
  return [];
}

/**
 * ✅ GARANTE externalCode SEMPRE STRING (Consumer exige string)
 * - tenta achar em vários campos comuns
 * - se não achar, retorna "N/A" (evita quebrar por tipo number/undefined)
 */
function normalizarExternalCode(valorPossivel) {
  if (valorPossivel === undefined || valorPossivel === null) return "";
  const s = String(valorPossivel).trim();
  return s;
}

function obterExternalCodeItem(i) {
  const candidatos = [
    i?.externalCode,
    i?.codigoPdv,
    i?.codPdv,
    i?.pdv,
    i?.codigo,
    i?.idProduto,
    i?.productCode,
  ];

  for (const c of candidatos) {
    const s = normalizarExternalCode(c);
    if (s) return s;
  }

  return "N/A";
}

function montarItens(pedido) {
  const lista = obterItens(pedido);

  return lista.map((i, idx) => {
    const qtd = Number(i.qtd ?? i.quantidade ?? i.quantity ?? 1);
    const unitPrice = Number(i.preco ?? i.unitPrice ?? 0);
    const totalPrice = Number(i.subtotal ?? i.totalPrice ?? (unitPrice * qtd));

    // ✅ externalCode como STRING (ex: "3")
    const externalCode = obterExternalCodeItem(i);

    return {
      id: uuid(),
      index: idx + 1,
      name: i.nome ?? i.name ?? "Produto",
      externalCode, // ✅ string
      quantity: qtd,
      unitPrice,
      totalPrice,
      unit: i.unit ?? "UN",
      ean: i.ean ?? null,
      price: totalPrice,
      observations: i.observacoes ?? i.observations ?? null,
      imageUrl: i.imageUrl ?? null,
      options: null,
      uniqueId: uuid(),
      optionsPrice: Number(i.optionsPrice ?? 0),
      addition: Number(i.addition ?? 0),
      scalePrices: i.scalePrices ?? null,
    };
  });
}

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
    (subTotal + deliveryFee);

  return {
    subTotal,
    deliveryFee,
    orderAmount,
    benefits: Number(pedido?.resumo?.benefits ?? 0),
    additionalFees: Number(pedido?.resumo?.additionalFees ?? 0),
  };
}

function montarDelivery(pedido, createdAtISO) {
  const tipo = (pedido?.entrega?.tipo || "entrega").toLowerCase();
  if (tipo === "retirada") return null;

  const rua = pedido?.entrega?.rua || "Rua";
  const numero = pedido?.entrega?.numero || "S/N";
  const bairro = pedido?.entrega?.bairro || "Centro";

  return {
    mode: "DEFAULT",
    deliveredBy: "Partner",
    pickupCode: pedido?.entrega?.codigoRetirada ?? "0000",
    deliveryDateTime: normalizarDataParaISO(pedido?.entrega?.dataHoraEntrega || createdAtISO),
    deliveryAddress: {
      country: "BR",
      state: pedido?.entrega?.estado || "BA",
      city: pedido?.entrega?.cidade || "Banzaê",
      postalCode: pedido?.entrega?.cep || "00000000",
      streetName: rua,
      streetNumber: numero,
      neighborhood: bairro,
      complement: pedido?.entrega?.complemento ?? null,
      reference: pedido?.entrega?.referencia ?? null,
      formattedAddress: `${rua}, ${numero} - ${bairro}`,
      coordinates: {
        latitude: Number(pedido?.entrega?.latitude ?? 0),
        longitude: Number(pedido?.entrega?.longitude ?? 0),
      },
    },
    observations: pedido?.observacoes ?? null,
  };
}

function montarPedidoConsumer(orderId, pedido) {
  const createdAtISO = normalizarDataParaISO(pedido?.criadoEm ?? pedido?.createdAt);
  const prepISO = normalizarDataParaISO(pedido?.preparationStartDateTime ?? createdAtISO);

  const items = montarItens(pedido);
  const total = montarTotal(pedido, items);
  const method = normalizarMetodoPagamento(pedido);

  const phoneNumber =
    pedido?.cliente?.whatsapp ??
    pedido?.cliente?.telefone ??
    pedido?.customer?.phone?.number ??
    "00000000000";

  return {
    benefits: total.benefits ?? 0,
    orderType: pedido?.entrega?.tipo === "retirada" ? "TAKEOUT" : "DELIVERY",
    salesChannel: "PARTNER",
    orderTiming: "IMMEDIATE",

    createdAt: createdAtISO,
    preparationStartDateTime: prepISO,

    merchant: {
      id: process.env.MERCHANT_ID || "raquel-dantas",
      name: process.env.MERCHANT_NAME || "Raquel Dantas Confeitaria",
    },

    total,

    payments: {
      methods: [
        {
          method,
          type: "OFFLINE",
          currency: "BRL",
          value: total.orderAmount,
          prepaid: false,
          cash: method === "CASH" ? { changeFor: Number(pedido?.pagamento?.trocoPara ?? 0) } : null,
          card: method === "CREDIT" ? { brand: pedido?.pagamento?.bandeira ?? null } : null,
          wallet: null,
        },
      ],
      pending: total.orderAmount,
      prepaid: 0,
    },

    id: String(orderId),
    displayId: String(pedido?.numero ?? String(orderId).slice(0, 6).toUpperCase()),

    customer: {
      id: pedido?.cliente?.id ?? uuid(),
      name: pedido?.cliente?.nome || "Cliente",
      phone: {
        number: String(phoneNumber),
        localizer: gerarLocalizer(),
        localizerExpiration: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      documentNumber: pedido?.cliente?.documento ?? null,
      ordersCountOnMerchant: null,
      segmentation: "Cliente",
    },

    delivery: montarDelivery(pedido, createdAtISO),
    picking: null,
    schedule: null,
    indoor: null,
    takeout: null,

    items,
    extraInfo: pedido?.observacoes ?? null,

    additionalFees: null,
    additionalInfometadata: null,
  };
}

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

  // marca auditoria
  await ref.set(
    {
      integracao: {
        ...(pedido.integracao || {}),
        detalhesConsultadosEm: isoAgora(),
        enviadoEm: isoAgora(),
      },
    },
    { merge: true }
  );

  return { item, statusCode: 0, reasonPhrase: null };
}
