import axios from "axios";
import { getDb } from "../firebaseAdmin.js";

/**
 * Aqui está o “esqueleto” da integração.
 * Sem API Key, vamos só:
 * - Ler o pedido
 * - Marcar no Firestore que está pronto para envio
 *
 * Quando você tiver a API Key do Consumer, a gente liga o envio real.
 */
export async function enviarPedidoParaConsumer(pedidoId) {
  const db = getDb();

  const ref = db.collection("pedidos").doc(pedidoId);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new Error("Pedido não encontrado no Firestore");
  }

  const pedido = snap.data();

  // ✅ Marca que chegou no backend (ajuda no debug)
  await ref.update({
    integracao: {
      ...(pedido.integracao || {}),
      backendRecebeuEm: new Date().toISOString(),
      status: "pronto_para_enviar_consumer",
    },
  });

  // 🚧 ENVIO REAL PRO CONSUMER (depois)
  const apiKey = process.env.CONSUMER_API_KEY;
  const baseUrl = process.env.CONSUMER_BASE_URL;

  if (!apiKey || apiKey === "COLOQUE_AQUI_DEPOIS") {
    return {
      pedidoId,
      enviado: false,
      motivo: "Sem API KEY do Consumer ainda. Pedido marcado como pronto_para_enviar_consumer.",
    };
  }

  // Quando você tiver a doc completa + API KEY, vamos ajustar o payload corretamente.
  // Abaixo é só um template (NÃO FINAL):
  const payload = {
    // TODO: montar conforme documentação do Consumer
    pedidoId,
    cliente: pedido.cliente,
    entrega: pedido.entrega,
    pagamento: pedido.pagamento,
    observacoes: pedido.observacoes,
    itens: pedido.itens,
    resumo: pedido.resumo,
  };

  const resp = await axios.post(`${baseUrl}/pedidos`, payload, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });

  await ref.update({
    integracao: {
      ...(pedido.integracao || {}),
      status: "enviado_consumer",
      consumerResposta: resp.data || null,
      enviadoEm: new Date().toISOString(),
    },
  });

  return { pedidoId, enviado: true, consumer: resp.data };
}
