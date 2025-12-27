import axios from "axios";
import { getDb } from "../firebaseAdmin.js";

/**
 * Integração com o Consumer
 * Fluxo:
 * 1. Lê o pedido no Firestore
 * 2. Monta o payload NO FORMATO EXATO do Consumer
 * 3. Envia para a API do Consumer
 * 4. Salva a resposta no Firestore
 */
export async function enviarPedidoParaConsumer(pedidoId) {
  const db = getDb();

  // 🔹 Busca o pedido
  const ref = db.collection("pedidos").doc(pedidoId);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new Error("Pedido não encontrado no Firestore");
  }

  const pedido = snap.data();

  // 🔹 Marca que o backend recebeu
  await ref.update({
    integracao: {
      ...(pedido.integracao || {}),
      backendRecebeuEm: new Date().toISOString(),
      status: "montando_payload_consumer",
    },
  });

  // 🔹 Configuração da API do Consumer
  const apiKey = process.env.CONSUMER_API_KEY;
  const baseUrl = process.env.CONSUMER_BASE_URL;

  if (!apiKey || !baseUrl) {
    return {
      pedidoId,
      enviado: false,
      motivo: "API KEY ou BASE URL do Consumer não configuradas",
    };
  }

  /**
   * 🔥 PAYLOAD NO FORMATO EXATO DO MANUAL DO CONSUMER
   * https://ajuda.programaconsumer.com.br/integracao-api-do-parceiro/
   */
  const payload = {
    externalCode: String(pedidoId),

    items: (pedido.itens || []).map((item) => {
      const quantidade = Number(item.quantidade || item.qtd || 1);
      const precoUnitario = Number(item.preco);

      return {
        externalCode: String(item.externalCode), // 🔥 obrigatório e STRING
        name: item.nome,
        quantity: quantidade,
        unitPrice: precoUnitario,
        totalPrice: precoUnitario * quantidade,
      };
    }),

    observations: pedido.observacoes || "",
  };

  // 🔎 Log para debug (pode remover depois)
  console.log("PAYLOAD ENVIADO AO CONSUMER:", JSON.stringify(payload, null, 2));

  try {
    // 🔹 Envio para o Consumer
    const resp = await axios.post(`${baseUrl}/orders`, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    // 🔹 Salva sucesso no Firestore
    await ref.update({
      integracao: {
        ...(pedido.integracao || {}),
        status: "enviado_consumer",
        enviadoEm: new Date().toISOString(),
        consumerResposta: resp.data || null,
      },
    });

    return {
      pedidoId,
      enviado: true,
      consumer: resp.data,
    };
  } catch (error) {
    // 🔴 Em caso de erro do Consumer
    const erroConsumer = error.response?.data || error.message;

    console.error("ERRO AO ENVIAR PARA CONSUMER:", erroConsumer);

    await ref.update({
      integracao: {
        ...(pedido.integracao || {}),
        status: "erro_consumer",
        erro: erroConsumer,
        erroEm: new Date().toISOString(),
      },
    });

    throw new Error(
      typeof erroConsumer === "string"
        ? erroConsumer
        : JSON.stringify(erroConsumer)
    );
  }
}
