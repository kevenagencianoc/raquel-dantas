import { Link, useNavigate } from "react-router-dom";
import { useCarrinho } from "../context/CarrinhoContext.jsx";
import "./Carrinho.css";
import logo from "../assets/logo.png";

function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Carrinho() {
  const navigate = useNavigate();
  const { itens, resumo, aumentarQtd, diminuirQtd, removerItem } = useCarrinho();

  return (
    <div className="carrinho-pagina">
      {/* TOPO */}
      <div className="carrinho-topo">
        <img src={logo} alt="Raquel Dantas" className="carrinho-logo" />

        <button className="topo-acao" onClick={() => navigate("/")}>
          Voltar
        </button>
      </div>

      <div className="container">
        {itens.length === 0 ? (
          <div className="carrinho-vazio">
            <p>Seu carrinho está vazio.</p>
            <button className="acao-verde" onClick={() => navigate("/")}>
              Voltar ao cardápio
            </button>
          </div>
        ) : (
          <>
            <div className="carrinho-lista">
              {itens.map((i) => (
                <div key={i.id} className="carrinho-card">
                  <div className="carrinho-foto">
                    <span>{i.emoji || "🍽️"}</span>
                  </div>

                  <div className="carrinho-info">
                    <p className="carrinho-nome">{i.nome}</p>
                    <p className="carrinho-desc">{i.desc}</p>

                    <div className="carrinho-linha">
                      <span className="carrinho-preco">
                        {formatarPreco((i.preco || 0) * i.qtd)}
                      </span>

                      <div className="qtd">
                        <button
                          className="qtd-btn"
                          onClick={() => diminuirQtd(i.id)}
                        >
                          –
                        </button>
                        <span className="qtd-num">{i.qtd}</span>
                        <button
                          className="qtd-btn"
                          onClick={() => aumentarQtd(i.id)}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <button
                      className="remover"
                      onClick={() => removerItem(i.id)}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* RESUMO */}
            <div className="resumo">
              <strong>Resumo</strong>

              <p>
                Itens: {resumo.quantidadeItens}
                <br />
                Total: {formatarPreco(resumo.total)}
              </p>

              <button
                className="acao-verde"
                onClick={() => navigate("/checkout")}
              >
                Continuar para checkout
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
