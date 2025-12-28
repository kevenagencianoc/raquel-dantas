import { getDb } from "../firebaseAdmin.js";
import crypto from "crypto";

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
}

function isoAgora() {
  return new Date().toISOString();
}

function gerarLocalizer() {
  return String(Math.floor(10000000 + Math.random() * 90000000)); // 8 dígitos
}

function normalizarMetodoPagamento(pedido) {
  const raw =
    (pedido?.pagamento?.tipo ||
      pedido?.pagamento?.metodo ||
      pedido?.payment?.method ||
      "PIX")
      .toString()
      .toUpperCase();

  // o manual usa exemplos com "CREDIT" e "PIX"
  if (raw.includes("CART") || raw.includes("CARD") || raw.includes("CRED")) return "CREDIT";
  if (raw.includes("DIN") || raw.includes("CASH")) return "CASH";
  return "PIX";
}

function montarItens(pedidoId, pedido) {
  const itens = Array.isArray(pedido?.itens) ? pedido.itens : [];

  return itens.map((i, idx) => {
    const qtd = Number(i.quantidade ?? i.qtd ?? 1);
    const unitPrice = Number(i.preco ?? 0);
    const totalPrice = Number(i.subtotal ?? unitPrice * qtd);

    return {
      id: uuid(),
      index: idx + 1,
      name: i.nome ?? i.name ?? "Produto",
      externalCode: String(i.externalCode ?? i.id ?? "0"),
      quantity: qtd,
      unitPrice,       // ✅ NUMBER (manual)
      totalPrice,      // ✅ NUMBER (manual)
      unit: "UN",
      ean: null,
      price: totalPrice,
      observations: i.observacoes ?? null,
      imageUrl: i.imageUrl ?? i.imagemUrl ?? i.urlImagem ?? null,
      options: null,
      uniqueId: uuid(),
      optionsPrice: 0,
      addition: 0,
      scalePrices: null,
    };
  });
}

function montarTotal(pedido) {
  // tenta respeitar seu resumo caso exista
  const deliveryFee = Number(pedido?.resumo?.taxaEntrega ?? pedido?.entrega?.taxaEntrega ?? 0);
  const subTotal =
    Number(pedido?.resumo?.totalProdutos ?? 0) ||
    (Array.isArray(pedido?.itens)
      ? pedido.itens.reduce((acc, i) => acc + Number(i.preco ?? 0) * Number(i.quantidade ?? i.qtd ?? 1), 0)
      : 0);

  const orderAmount =
    Number(pedido?.resumo?.totalFinal ?? 0) ||
    (subTotal + deliveryFee);

  return {
    subTotal,
    deliveryFee,
    orderAmount,
    benefits: Number(pedido?.resumo?.benefits ?? 0),
    additionalFees: Number(pedido?.resumo?.additionalFees ?? 0),
  };
}

function montarDelivery(pedido) {
  const tipo = (pedido?.entrega?.tipo || "entrega").toLowerCase();

  if (tipo !== "entrega") return null;

  const rua = pedido?.entrega?.rua || "Rua";
  const numero = pedido?.entrega?.numero || "S/N";
  const bairro = pedido?.entrega?.bairro || "Centro";

  return {
    mode: "DEFAULT",
    deliveredBy: "Partner",
    pickupCode: pedido?.entrega?.codigoRetirada ?? "0000",
    deliveryDateTime: pedido?.entrega?.dataHoraEntrega ?? null,
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
  const createdAt = pedido?.criadoEm ?? pedido?.createdAt ?? isoAgora();

  const items = montarItens(orderId, pedido);
  const total = montarTotal(pedido);
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
          method,                // ✅ "PIX" | "CREDIT" | "CASH" (exemplo do manual)
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
    createdAt,
    preparationStartDateTime: createdAt,
    id: String(orderId),
    displayId: String(pedido?.numero ?? String(orderId).slice(0, 6).toUpperCase()),
    items,
    customer: {
      id: pedido?.cliente?.id ?? uuid(),
      name: pedido?.cliente?.nome || "Cliente",
      phone: {
        number: String(phoneNumber),
        localizer: gerarLocalizer(), // ✅ importante
        localizerExpiration: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // ✅ importante
      },
      documentNumber: null,
      ordersCountOnMerchant: null,
      segmentation: "Cliente",
    },
    extraInfo: pedido?.observacoes ?? null,
    additionalFees: null,
    delivery: montarDelivery(pedido),
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

  // marca como enviado (pra não repetir polling)
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
