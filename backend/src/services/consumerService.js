import { getDb } from "../firebaseAdmin.js";
import crypto from "crypto";

/**
 * Gera UUID (Node 18+ tem crypto.randomUUID)
 */
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // fallback simples
  return (
    Date.now().toString(16) +
    Math.random().toString(16).slice(2) +
    Math.random().toString(16).slice(2)
  ).slice(0, 32);
}

/**
 * Localizer (código curto) exigido no customer.phone.localizer
 */
function gerarLocalizer() {
  return String(Math.floor(10000000 + Math.random() * 90000000)); // 8 dígitos
}

/**
 * ISO string UTC
 */
function isoAgora() {
  return new Date().toISOString();
}

/**
 * Soma total do pedido
 */
function calcularTotais(pedido) {
  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
  const subTotal = itens.reduce((acc, it) => {
    const qtd = Number(it.quantidade ?? it.qtd ?? 1);
    const preco = Number(it.preco ?? 0);
    return acc + preco * qtd;
  }, 0);

  const deliveryFee = Number(pedido?.entrega?.taxaEntrega ?? pedido?.taxaEntrega ?? 0);
  const benefits = Number(pedido?.desconto ?? pedido?.benefits ?? 0);
  const additionalFees = Number(pedido?.taxasExtras ?? 0);

  const orderAmount = Math.max(0, subTotal + deliveryFee + additionalFees - benefits);

  return { subTotal, deliveryFee, additionalFees, benefits, orderAmount };
}

/**
 * Monta o OBJETO COMPLETO do pedido conforme manual do Consumer (API Parceiro).
 * O Consumer quer muitos campos obrigatórios, então aqui garantimos fallback.
 * Referência de campos obrigatórios: manual Consumer (API Parceiro). :contentReference[oaicite:2]{index=2}
 */
function montarPedidoConsumer(pedidoId, pedido) {
  const agora = isoAgora();

  // ===== Merchant (obrigatório) =====
  const merchantId = pedido?.loja?.id ?? pedido?.merchant?.id ?? "merchant-raquel-dantas";
  const merchantName = pedido?.loja?.nome ?? pedido?.merchant?.name ?? "Raquel Dantas Confeitaria";

  // ===== Customer (obrigatório) =====
  const clienteNome =
    pedido?.cliente?.nome ??
    pedido?.customer?.name ??
    "Cliente Delivery";

  const clienteTelefone =
    pedido?.cliente?.telefone ??
    pedido?.customer?.phone?.number ??
    "00000000000";

  const localizer = gerarLocalizer();
  const localizerExpiration = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1h

  // ===== Delivery (obrigatório no modelo DELIVERY) =====
  // Se seu app ainda não coleta endereço, preenche com fallback (não vazio) para não dar ERRO.
  const endereco = pedido?.entrega?.endereco ?? pedido?.delivery?.deliveryAddress ?? {};

  const delivery = {
    mode: "DEFAULT",
    deliveredBy: "Partner",
    pickupCode: pedido?.entrega?.codigoRetirada ?? pedido?.delivery?.pickupCode ?? "0000",
    deliveryDateTime: pedido?.entrega?.dataHoraEntrega ?? pedido?.delivery?.deliveryDateTime ?? agora,
    deliveryAddress: {
      country: endereco.country ?? "BR",
      state: endereco.state ?? "BA",
      city: endereco.city ?? "Banzaê",
      postalCode: endereco.postalCode ?? "00000000",
      streetName: endereco.streetName ?? "Rua",
      streetNumber: endereco.streetNumber ?? "S/N",
      neighborhood: endereco.neighborhood ?? "Centro",
      complement: endereco.complement ?? null,
      reference: endereco.reference ?? null,
      formattedAddress:
        endereco.formattedAddress ??
        `${endereco.streetName ?? "Rua"} ${endereco.streetNumber ?? "S/N"}`,
      coordinates: {
        latitude: Number(endereco?.coordinates?.latitude ?? 0),
        longitude: Number(endereco?.coordinates?.longitude ?? 0),
      },
    },
    observations: pedido?.entrega?.observacoes ?? null,
  };

  // ===== Itens (obrigatório) =====
  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
  const items = itens.map((it, idx) => {
    const qtd = Number(it.quantidade ?? it.qtd ?? 1);
    const unitPrice = Number(it.preco ?? 0);
    const totalPrice = unitPrice * qtd;

    // O Consumer exige items.id (obrigatório no manual)
    const itemId = uuid();

    return {
      id: itemId,
      index: idx + 1,
      unitPrice,
      quantity: qtd,
      externalCode: String(it.externalCode ?? it.codigoExterno ?? it.code ?? "0"),
      totalPrice,
      unit: "UN",
      ean: null,
      price: totalPrice,
      observations: it.observacoes ?? it.obs ?? null,
      imageUrl: it.imageUrl ?? it.imagemUrl ?? it.urlImagem ?? null,
      name: it.nome ?? it.name ?? "Produto",
      options: null,
      uniqueId: uuid(),
      optionsPrice: 0,
      addition: 0,
      scalePrices: null,
    };
  });

  // ===== Totais (obrigatório) =====
  const totalCalc = calcularTotais(pedido);
  const total = {
    subTotal: totalCalc.subTotal,
    deliveryFee: totalCalc.deliveryFee,
    additionalFees: totalCalc.additionalFees,
    benefits: totalCalc.benefits,
    orderAmount: totalCalc.orderAmount,
  };

  // ===== Payments (obrigatório) =====
  // O Consumer exige payments.methods + pending/prepaid
  // Vamos mapear do seu checkout: pedido.pagamento.metodo (pix/cartao/dinheiro)
  const metodoRaw = (pedido?.pagamento?.metodo ?? pedido?.payment?.method ?? "CASH").toString().toUpperCase();

  // Ajuste de mapeamento simples
  let method = "CASH";
  if (metodoRaw.includes("PIX")) method = "PIX";
  else if (metodoRaw.includes("CREDIT") || metodoRaw.includes("CARTAO") || metodoRaw.includes("CARD")) method = "CREDIT";

  const payments = {
    methods: [
      {
        method,               // "CREDIT" | "PIX" | "CASH" etc.
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
  };

  // ===== Objeto final do pedido (item) =====
  const orderType = "DELIVERY"; // para cair na fila de pedidos online
  const createdAt = pedido?.criadoEm ?? pedido?.createdAt ?? agora;

  return {
    benefits: total.benefits ?? 0,
    orderType, // obrigatório
    payments,  // obrigatório
    merchant: { name: merchantName, id: merchantId }, // obrigatório
    salesChannel: "PARTNER",
    picking: null,
    orderTiming: "IMMEDIATE",
    createdAt,
    preparationStartDateTime: createdAt,
    id: String(pedidoId),              // obrigatório
    displayId: String(pedido?.numero ?? pedido?.displayId ?? pedidoId), // obrigatório
    items,                              // obrigatório
    customer: {
      id: pedido?.cliente?.id ?? pedido?.customer?.id ?? uuid(),
      name: clienteNome,
      phone: {
        number: String(clienteTelefone),
        localizer,
        localizerExpiration,
      },
      documentNumber: pedido?.cliente?.documento ?? null,
      ordersCountOnMerchant: null,
      segmentation: "Cliente",
    },
    extraInfo: pedido?.observacoes ?? pedido?.extraInfo ?? null,
    additionalFees: null,
    delivery, // obrigatório no delivery
    schedule: null,
    indoor: null,
    takeout: null,
    additionalInfometadata: null,
    total, // obrigatório
  };
}

/**
 * ✅ FUNÇÃO PRINCIPAL QUE O SEU ENDPOINT DE "DETALHES DO PEDIDO" DEVE USAR
 * Retorna o formato que o Consumer espera:
 * {
 *   item: { ...pedidoCompleto },
 *   statusCode: 0,
 *   reasonPhrase: null
 * }
 */
export async function obterDetalhesPedidoParaConsumer(pedidoId) {
  const db = getDb();

  const ref = db.collection("pedidos").doc(String(pedidoId));
  const snap = await ref.get();

  if (!snap.exists) {
    return {
      item: null,
      statusCode: 404,
      reasonPhrase: "Pedido não encontrado",
    };
  }

  const pedido = snap.data();

  // marca debug no firestore
  try {
    await ref.update({
      integracao: {
        ...(pedido.integracao || {}),
        consumerDetalhesSolicitadosEm: isoAgora(),
        status: "consumer_solicitou_detalhes",
      },
    });
  } catch (_) {}

  const item = montarPedidoConsumer(pedidoId, pedido);

  return {
    item,
    statusCode: 0,
    reasonPhrase: null,
  };
}
