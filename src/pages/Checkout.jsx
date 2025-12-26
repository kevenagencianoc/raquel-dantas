import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCarrinho } from "../context/CarrinhoContext.jsx";
import "./Checkout.css";
import logo from "../assets/logo.png";

import { db } from "../firebase.js";
import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  setDoc,
} from "firebase/firestore";

function dinheiro(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function soNumeros(txt) {
  return (txt || "").replace(/\D/g, "");
}

export default function Checkout() {
  const navigate = useNavigate();
  const { itens, resumo, limparCarrinho } = useCarrinho();

  if (!itens || itens.length === 0) {
    return (
      <div className="checkout-pagina">
        <div className="checkout-topo">
          <img src={logo} alt="Raquel Dantas" className="checkout-logo" />
          <button className="topo-voltar" onClick={() => navigate("/")}>
            Voltar
          </button>
        </div>

        <div className="container">
          <div className="bloco">
            <h2>Seu carrinho está vazio</h2>
            <button className="btn-principal" onClick={() => navigate("/")}>
              Voltar ao cardápio
            </button>
          </div>
        </div>
      </div>
    );
  }

  const bairrosSugestao = useMemo(
    () => ["Centro", "Bairro A", "Bairro B", "Bairro C", "Outro / Mais longe"],
    []
  );

  const [tipoEntrega, setTipoEntrega] = useState("entrega");
  const [nome, setNome] = useState("");
  const [whats, setWhats] = useState("");

  const [bairro, setBairro] = useState(bairrosSugestao[0]);
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");

  const [pagamento, setPagamento] = useState("pix");
  const [taxaLonge, setTaxaLonge] = useState(0);
  const [observacoes, setObservacoes] = useState("");

  const [enviando, setEnviando] = useState(false);

  const entregaTaxa = useMemo(() => {
    if (tipoEntrega === "retirada") return 0;
    if (bairro !== "Outro / Mais longe") return 0;
    return Number(taxaLonge) || 0;
  }, [tipoEntrega, bairro, taxaLonge]);

  const totalFinal = resumo.total + entregaTaxa;

  function validar() {
    if (!nome.trim()) return "Informe o nome.";
    if (soNumeros(whats).length < 10) return "Informe um WhatsApp válido.";
    if (tipoEntrega === "entrega") {
      if (!rua.trim()) return "Informe a rua.";
      if (!numero.trim()) return "Informe o número.";
    }
    return null;
  }

  async function confirmarPedido() {
    const erro = validar();
    if (erro) {
      alert(erro);
      return;
    }

    setEnviando(true);

    const pedido = {
      criadoEm: serverTimestamp(),
      status: "novo",
      cliente: {
        nome: nome.trim(),
        whatsapp: soNumeros(whats),
      },
      entrega: {
        tipo: tipoEntrega,
        bairro: tipoEntrega === "entrega" ? bairro : null,
        rua: tipoEntrega === "entrega" ? rua.trim() : null,
        numero: tipoEntrega === "entrega" ? numero.trim() : null,
        taxa: entregaTaxa,
      },
      pagamento: { tipo: pagamento },
      observacoes: observacoes.trim(),
      itens: itens.map((i) => ({
        id: i.id,
        nome: i.nome,
        qtd: i.qtd,
        preco: i.preco || 0,
        subtotal: (i.preco || 0) * i.qtd,
      })),
      resumo: {
        itens: resumo.quantidadeItens,
        totalProdutos: resumo.total,
        taxaEntrega: entregaTaxa,
        totalFinal,
      },
      origem: "site",
    };

    try {
      // 1) Salva no Firestore
      const docRef = await addDoc(collection(db, "pedidos"), pedido);
      const pedidoId = docRef.id;

      // 2) Marca como pronto para o Consumer puxar via backend (polling)
      await setDoc(
        doc(db, "pedidos", pedidoId),
        {
          integracao: {
            status: "pronto_para_enviar_consumer",
            prontoEm: new Date().toISOString(),
            origem: "site",
          },
        },
        { merge: true }
      );

      // 3) Limpa carrinho e finaliza
      limparCarrinho();
      alert(`Pedido enviado! ✅\nNúmero do pedido: ${pedidoId}`);
      navigate("/");
    } catch (e) {
      console.error("Erro ao enviar pedido:", e);
      alert("Erro ao enviar pedido. Verifique Firestore e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="checkout-pagina">
      <div className="checkout-topo">
        <img src={logo} alt="Raquel Dantas" className="checkout-logo" />
        <button className="topo-voltar" onClick={() => navigate("/carrinho")}>
          Voltar
        </button>
      </div>

      <div className="container">
        <div className="bloco">
          <h2>Entrega ou retirada</h2>
          <div className="linha-radio">
            <label className="radio-botao">
              <input
                type="radio"
                checked={tipoEntrega === "entrega"}
                onChange={() => setTipoEntrega("entrega")}
              />
              Entrega
            </label>

            <label className="radio-botao">
              <input
                type="radio"
                checked={tipoEntrega === "retirada"}
                onChange={() => setTipoEntrega("retirada")}
              />
              Retirada
            </label>
          </div>
        </div>

        <div className="bloco">
          <h2>Seus dados</h2>
          <div className="linha-2">
            <div className="campo">
              <label>Nome</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>

            <div className="campo">
              <label>WhatsApp</label>
              <input value={whats} onChange={(e) => setWhats(e.target.value)} />
            </div>
          </div>
        </div>

        {tipoEntrega === "entrega" && (
          <div className="bloco">
            <h2>Endereço</h2>

            <div className="campo">
              <label>Bairro</label>
              <select value={bairro} onChange={(e) => setBairro(e.target.value)}>
                {bairrosSugestao.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {bairro === "Outro / Mais longe" && (
              <div className="campo">
                <label>Taxa de entrega (se for longe)</label>
                <input
                  type="number"
                  value={taxaLonge}
                  onChange={(e) => setTaxaLonge(e.target.value)}
                  placeholder="Ex: 5"
                />
              </div>
            )}

            <div className="linha-2">
              <div className="campo">
                <label>Rua</label>
                <input value={rua} onChange={(e) => setRua(e.target.value)} />
              </div>

              <div className="campo">
                <label>Número</label>
                <input value={numero} onChange={(e) => setNumero(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <div className="bloco">
          <h2>Pagamento</h2>
          <div className="linha-radio">
            <label className="radio-botao">
              <input
                type="radio"
                checked={pagamento === "pix"}
                onChange={() => setPagamento("pix")}
              />
              Pix
            </label>

            <label className="radio-botao">
              <input
                type="radio"
                checked={pagamento === "cartao"}
                onChange={() => setPagamento("cartao")}
              />
              Cartão
            </label>
          </div>
        </div>

        <div className="bloco">
          <h2>Observações do pedido</h2>
          <div className="campo">
            <label>Ex: sem cebola, caprichar no leite ninho…</label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Digite aqui…"
            />
          </div>
        </div>

        <div className="resumo">
          <strong>Resumo</strong>

          <div className="linha">
            <span>Produtos</span>
            <span>{dinheiro(resumo.total)}</span>
          </div>

          <div className="linha">
            <span>Entrega</span>
            <span>{dinheiro(entregaTaxa)}</span>
          </div>

          <div className="linha total">
            <span>Total</span>
            <span>{dinheiro(totalFinal)}</span>
          </div>

          <button className="btn-principal" onClick={confirmarPedido} disabled={enviando}>
            {enviando ? "Enviando..." : "Confirmar pedido"}
          </button>

          <button className="btn-sec" onClick={() => navigate("/carrinho")} disabled={enviando}>
            Voltar ao carrinho
          </button>
        </div>
      </div>
    </div>
  );
}
