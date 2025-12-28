import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Checkout.css";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useCarrinho } from "../context/CarrinhoContext.jsx";

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function Checkout() {
  const navigate = useNavigate();
  const { itens, resumo, limparCarrinho } = useCarrinho();

  // dados do cliente
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  // entrega
  const [tipoEntrega, setTipoEntrega] = useState("entrega"); // entrega | retirada
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");

  // pagamento
  const [pagamento, setPagamento] = useState("pix"); // pix | cartao | dinheiro
  const [observacoes, setObservacoes] = useState("");

  const totalFinal = useMemo(() => Number(resumo?.total || 0), [resumo]);

  const validar = () => {
    if (!itens || itens.length === 0) return "Seu carrinho está vazio.";
    if (!nome.trim()) return "Preencha seu nome.";
    if (!whatsapp.trim()) return "Preencha seu WhatsApp.";

    if (tipoEntrega === "entrega") {
      if (!rua.trim()) return "Preencha a rua.";
      if (!numero.trim()) return "Preencha o número.";
      if (!bairro.trim()) return "Preencha o bairro.";
    }

    // 🔥 externalCode é obrigatório pro Consumer reconhecer produto
    const semExternal = itens.find((i) => !i.externalCode);
    if (semExternal) {
      return `O produto "${semExternal.nome}" está sem externalCode. Cadastre/edite no painel admin e tente de novo.`;
    }

    return null;
  };

  const enviarPedido = async () => {
    const erro = validar();
    if (erro) {
      alert(erro);
      return;
    }

    // monta itens no padrão que seu backend/consumerService já entende
    const itensPedido = itens.map((i) => {
      const qtd = Number(i.qtd || 1);
      const preco = Number(i.preco || 0);
      return {
        id: i.id, // id do produto no firestore
        nome: i.nome,
        preco,
        qtd,
        subtotal: preco * qtd,
        externalCode: String(i.externalCode), // 🔥 ESSENCIAL
        imageUrl: i.imageUrl || null, // se tiver
      };
    });

    const payload = {
      criadoEm: serverTimestamp(), // melhor que string
      integracao: {
        origem: "site",
        status: "pronto_para_enviar_consumer", // 🔥 Consumer pega no polling
        prontoEm: new Date().toISOString(),
      },

      cliente: {
        nome: nome.trim(),
        whatsapp: whatsapp.trim(),
      },

      entrega: {
        tipo: tipoEntrega,
        rua: tipoEntrega === "entrega" ? rua.trim() : "",
        numero: tipoEntrega === "entrega" ? numero.trim() : "",
        bairro: tipoEntrega === "entrega" ? bairro.trim() : "",
      },

      pagamento: {
        tipo: pagamento,
      },

      observacoes: observacoes || "",

      itens: itensPedido,

      resumo: {
        totalProdutos: itensPedido.reduce((acc, it) => acc + Number(it.subtotal || 0), 0),
        taxaEntrega: 0,
        totalFinal: totalFinal,
      },
    };

    try {
      await addDoc(collection(db, "pedidos"), payload);

      limparCarrinho();
      alert("✅ Pedido enviado! Agora ele deve aparecer no Consumer.");
      navigate("/");
    } catch (e) {
      console.error("Erro ao enviar pedido:", e);
      alert("❌ Erro ao enviar pedido. Verifique o Firestore / permissões.");
    }
  };

  return (
    <div className="checkout-pagina">
      <header className="checkout-topo">
        <Link className="checkout-voltar" to="/carrinho">← Voltar</Link>
        <h1>Finalizar pedido</h1>
      </header>

      <main className="checkout-container">
        <section className="checkout-card">
          <h2>Seus dados</h2>

          <label className="checkout-label">Nome</label>
          <input
            className="checkout-input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Seu nome"
          />

          <label className="checkout-label">WhatsApp</label>
          <input
            className="checkout-input"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="DDD + número (ex: 75999999999)"
          />
        </section>

        <section className="checkout-card">
          <h2>Entrega</h2>

          <div className="checkout-opcoes">
            <button
              className={`checkout-chip ${tipoEntrega === "entrega" ? "ativo" : ""}`}
              onClick={() => setTipoEntrega("entrega")}
              type="button"
            >
              Entrega
            </button>

            <button
              className={`checkout-chip ${tipoEntrega === "retirada" ? "ativo" : ""}`}
              onClick={() => setTipoEntrega("retirada")}
              type="button"
            >
              Retirada
            </button>
          </div>

          {tipoEntrega === "entrega" && (
            <>
              <label className="checkout-label">Rua</label>
              <input
                className="checkout-input"
                value={rua}
                onChange={(e) => setRua(e.target.value)}
                placeholder="Rua"
              />

              <label className="checkout-label">Número</label>
              <input
                className="checkout-input"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="Número"
              />

              <label className="checkout-label">Bairro</label>
              <input
                className="checkout-input"
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                placeholder="Bairro"
              />
            </>
          )}
        </section>

        <section className="checkout-card">
          <h2>Pagamento</h2>

          <div className="checkout-opcoes">
            <button
              className={`checkout-chip ${pagamento === "pix" ? "ativo" : ""}`}
              onClick={() => setPagamento("pix")}
              type="button"
            >
              Pix
            </button>

            <button
              className={`checkout-chip ${pagamento === "cartao" ? "ativo" : ""}`}
              onClick={() => setPagamento("cartao")}
              type="button"
            >
              Cartão
            </button>

            <button
              className={`checkout-chip ${pagamento === "dinheiro" ? "ativo" : ""}`}
              onClick={() => setPagamento("dinheiro")}
              type="button"
            >
              Dinheiro
            </button>
          </div>

          <label className="checkout-label">Observações</label>
          <textarea
            className="checkout-textarea"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Ex: sem cebola, ponto do bolo, troco para..."
            rows={3}
          />
        </section>

        <section className="checkout-card">
          <h2>Resumo</h2>

          <div className="checkout-resumo">
            <span>Itens</span>
            <strong>{resumo?.quantidadeItens || 0}</strong>
          </div>

          <div className="checkout-resumo">
            <span>Total</span>
            <strong>{formatarPreco(totalFinal)}</strong>
          </div>

          <button className="checkout-btn" onClick={enviarPedido}>
            Confirmar pedido
          </button>
        </section>
      </main>
    </div>
  );
}
