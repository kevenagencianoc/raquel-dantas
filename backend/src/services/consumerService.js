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

  if (raw.includes("CART") || raw.includes("CARD") || raw.includes("CRED")) return "CREDIT";
  if (raw.includes("DIN") || raw.includes("CASH")) return "CASH";
  return "PIX";
}

/**
 * ✅ CORREÇÃO CRÍTICA:
 * Seu Firestore está salvando "items" (EN) e não "itens" (PT).
 * Aqui aceitamos os dois.
 */
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

      // externalCode é obrigatório pro Consumer; se não tiver, usa id do seu item
      externalCode: String(i.externalCode ?? i.codigoExterno ?? i.id ?? "0"),

      quantity: qtd,

      // ✅ NUMBER (não objeto)
      unitPrice,
      totalPrice,

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
  // se tiver resumo usa, senão calcula
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
        localizer: gerarLocalizer(),
        localizerExpiration: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
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

  // 🔥 Se não tiver itens, o Consumer vai rejeitar
  if (!item.items || item.items.length === 0) {
    return {
      item: null,
      statusCode: 99,
      reasonPhrase: "Pedido sem itens (verifique se o Firestore usa campo 'items' ou 'itens')",
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
