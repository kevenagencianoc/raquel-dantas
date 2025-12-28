import { addDoc, collection } from "firebase/firestore";
import { db } from "../firebase";
import { useCarrinho } from "../context/CarrinhoContext";

export default function Checkout() {
  const { itens, limparCarrinho } = useCarrinho();

  async function finalizarPedido() {
    if (itens.length === 0) {
      alert("Carrinho vazio");
      return;
    }

    await addDoc(collection(db, "pedidos"), {
      criadoEm: new Date().toISOString(),

      integracao: {
        origem: "site",
        status: "pronto_para_enviar_consumer", // 🔥
      },

      itens: itens.map(i => ({
        nome: i.nome,
        preco: i.preco,
        qtd: i.qtd,
        subtotal: i.preco * i.qtd,
        externalCode: String(i.externalCode), // 🔥 ESSENCIAL
      })),

      cliente: {
        nome: "Cliente Teste",
        whatsapp: "76999999999",
      },

      entrega: {
        tipo: "entrega",
        rua: "Rua Teste",
        numero: "66",
        bairro: "Centro",
      },
    });

    limparCarrinho();
    alert("Pedido enviado com sucesso!");
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Checkout</h2>
      <button onClick={finalizarPedido}>Finalizar Pedido</button>
    </div>
  );
}
