import { getDb } from "../firebaseAdmin.js";
import crypto from "crypto";

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

function isoAgora() {
  return new Date().toISOString();
}

/**
 * ✅ Normaliza datas vindas do Firestore:
 * - Timestamp (obj com _seconds/_nanoseconds)
 * - Date
 * - number (ms)
 * - string
 * Retorna ISO string
 */
function normalizarDataParaISO(valor) {
  if (!valor) return isoAgora();

  // Firestore Timestamp "serializado" (como no seu JSON)
  if (typeof valor === "object" && valor._seconds) {
    const ms = valor._seconds * 1000 + Math.floor((valor._nanoseconds || 0) / 1e6);
    return new Date(ms).toISOString();
  }

  // Firestore Timestamp real (tem toDate)
  if (typeof valor === "object" && typeof valor.toDate === "function") {
    return valor.toDate().toISOString();
  }

  // Date
  if (valor instanceof Date) {
    return valor.toISOString();
  }

  // number (ms)
  if (typeof valor === "number") {
    return new Date(valor).toISOString();
  }

  // string
  if (typeof valor === "string") {
    const d = new Date(valor);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return isoAgora();
  }

  return isoAgora();
}

function gerarLocalizer() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

function normalizarMetodoPagamento(pedido) {
  const raw =
    (pedido?.pagamento?.tipo ||
      pedido?.pagamento?.metodo ||
      pedido?.payment?.method ||
      "PIX")
      .toString()
      .toUpperCase();

  if (raw.includes("CART") || raw.includes("CARD") || raw.includes("CRED")) return "CREDIT";
  if (raw.includes("DIN") || raw.includes("CASH")) return "CASH";
  return "PIX";
}

function getListaItens(pedido) {
  if (Array.isArray(pedido?.itens)) return pedido.itens;
  if (Array.isArray(pedido?.items)) return pedido.items;
  return [];
}

function montarItens(orderId, pedido) {
  const lista = getListaItens(pedido);

  return lista.map((i, idx) => {
    const qtd = Number(i.quantidade ?? i.qtd ?? 1);
    const unitPrice = Number(i.preco ?? i.unitPrice ?? 0);
    const totalPrice = Number(i.subtotal ?? i.totalPrice ?? unitPrice * qtd);

    return {
      id: uuid(),
      index: idx + 1,
      name: i.nome ?? i.name ?? "Produto",
      externalCode: String(i.externalCode ?? i.codigoExterno ?? i.id ?? "0"),
      quantity: qtd,
      unitPrice,     // ✅ NUMBER
      totalPrice,    // ✅ NUMBER
      unit: "UN",
      ean: null,
      price: totalPrice,
      observations: i.observacoes ?? i.obs ?? null,
      imageUrl: i.imageUrl ?? i.imagemUrl ?? i.urlImagem ?? null,
      options: null,
      uniqueId: uuid(),
      optionsPrice: 0,
      addition: 0,
      scalePrices: null,
    };
  });
}

function montarTotal(pedido, items) {
  const deliveryFee = Number(
    pedido?.resumo?.taxaEntrega ??
      pedido?.entrega?.taxaEntrega ??
      pedido?.taxaEntrega ??
      0
  );

  const subTotalFromResumo = Number(pedido?.resumo?.totalProdutos ?? 0);

  const subTotal =
    subTotalFromResumo > 0
      ? subTotalFromResumo
      : items.reduce((acc, it) => acc + Number(it.totalPrice ?? 0), 0);

  const orderAmountFromResumo = Number(pedido?.resumo?.totalFinal ?? 0);
  const orderAmount =
    orderAmountFromResumo > 0 ? orderAmountFromResumo : subTotal + deliveryFee;

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
  if (tipo !== "entrega") return null;

  const rua = pedido?.entrega?.rua || "Rua";
  const numero = pedido?.entrega?.numero || "S/N";
  const bairro = pedido?.entrega?.bairro || "Centro";

  // ✅ garante um deliveryDateTime válido
  const deliveryDateTimeISO = normalizarDataParaISO(
    pedido?.entrega?.dataHoraEntrega || createdAtISO
  );

  return {
    mode: "DEFAULT",
    deliveredBy: "Partner",
    pickupCode: pedido?.entrega?.codigoRetirada ?? "0000",
    deliveryDateTime: deliveryDateTimeISO,
    deliveryAddress: {
      country: "BR",
      state: "BA",
      city: "Banzaê",
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
  const prepStartISO = normalizarDataParaISO(pedido?.preparationStartDateTime ?? createdAtISO);

  const items = montarItens(orderId, pedido);
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
    payments: {
      methods: [
        {
          method,
          prepaid: false,
          currency: "BRL",
          type: "OFFLINE",
          value: total.orderAmount,
          cash: method === "CASH" ? { changeFor: Number(pedido?.pagamento?.trocoPara ?? 0) } : null,
          card: method === "CREDIT" ? { brand: pedido?.pagamento?.bandeira ?? null } : null,
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
    picking: null,
    orderTiming: "IMMEDIATE",
    createdAt: createdAtISO,                 // ✅ ISO
    preparationStartDateTime: prepStartISO,  // ✅ ISO
    id: String(orderId),
    displayId: String(pedido?.numero ?? String(orderId).slice(0, 6).toUpperCase()),
    items,
    customer: {
      id: pedido?.cliente?.id ?? uuid(),
      name: pedido?.cliente?.nome || "Cliente",
      phone: {
        number: String(phoneNumber),
        localizer: gerarLocalizer(),
        localizerExpiration: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      documentNumber: null,
      ordersCountOnMerchant: null,
      segmentation: "Cliente",
    },
    extraInfo: pedido?.observacoes ?? null,
    additionalFees: null,
    delivery: montarDelivery(pedido, createdAtISO), // ✅ deliveryDateTime preenchido
    schedule: null,
    indoor: null,
    takeout: null,
    additionalInfometadata: null,
    total,
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
    return {
      item: null,
      statusCode: 99,
      reasonPhrase: "Pedido sem itens (verifique campo items/itens no Firestore)",
    };
  }

  await ref.set(
    {
      integracao: {
        ...(pedido.integracao || {}),
        detalhesConsultadosEm: isoAgora(),
        status: "enviado_para_consumer",
        enviadoEm: isoAgora(),
      },
    },
    { merge: true }
  );

  return { item, statusCode: 0, reasonPhrase: null };
}
