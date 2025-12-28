import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./Cardapio.css";
import logo from "../assets/logo.png";
import { useCarrinho } from "../context/CarrinhoContext.jsx";

import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function Cardapio() {
  const { adicionarItem, resumo } = useCarrinho();

  const [produtos, setProdutos] = useState([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState("");
  const [busca, setBusca] = useState("");

  // 🔥 CARREGA PRODUTOS DO FIRESTORE
  useEffect(() => {
    async function carregar() {
      const snap = await getDocs(collection(db, "produtos"));
      const lista = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.ativo);

      setProdutos(lista);

      if (lista.length > 0) {
        setCategoriaAtiva(lista[0].categoria);
      }
    }

    carregar();
  }, []);

  // 🔹 categorias dinâmicas
  const categorias = useMemo(() => {
    return [...new Set(produtos.map((p) => p.categoria))];
  }, [produtos]);

  const produtosFiltrados = useMemo(() => {
    const texto = busca.trim().toLowerCase();

    return produtos.filter((p) => {
      const okCat = p.categoria === categoriaAtiva;
      const okBusca =
        texto.length === 0 ||
        p.nome.toLowerCase().includes(texto) ||
        (p.desc || "").toLowerCase().includes(texto);

      return okCat && okBusca;
    });
  }, [produtos, categoriaAtiva, busca]);

  return (
    <div className="pagina">
      <header className="topo">
        <div className="topo-inner">
          <div className="brand">
            <img className="logo" src={logo} alt="Raquel Dantas Confeitaria" />
          </div>

          <div className="icones-topo">
            <button className="icone-botao">🔎</button>
            <Link to="/carrinho">
              <button className="icone-botao">🛒</button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <div className="hero-card">
            <h2>Peça agora e receba rapidinho ✨</h2>
            <p>Escolha no cardápio e finalize com Pix ou cartão.</p>

            <div className="hero-acoes">
              {categorias.slice(0, 2).map((cat) => (
                <button
                  key={cat}
                  className="botao-primario"
                  onClick={() => setCategoriaAtiva(cat)}
                >
                  Ver {cat}
                </button>
              ))}
            </div>

            <div className="busca">
              <span>🔎</span>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar no cardápio…"
              />
            </div>

            <div className="categorias">
              {categorias.map((cat) => (
                <button
                  key={cat}
                  className={`chip ${cat === categoriaAtiva ? "ativo" : ""}`}
                  onClick={() => setCategoriaAtiva(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </section>

        <h3 className="titulo-secao">{categoriaAtiva}</h3>

        <section className="lista">
          {produtosFiltrados.map((p) => (
            <article key={p.id} className="card">
              <div className="foto">
                <span>{p.emoji || "🍽️"}</span>
              </div>

              <div className="info">
                <h4 className="nome">{p.nome}</h4>
                <p className="desc">{p.desc}</p>

                <div className="rodape-card">
                  <div className="preco">
                    {p.preco > 0 ? formatarPreco(p.preco) : "Sob consulta"}
                  </div>

                  <button
                    className="btn-add"
                    onClick={() =>
                      adicionarItem({
                        id: p.id,
                        nome: p.nome,
                        preco: p.preco,
                        qtd: 1,
                        externalCode: p.externalCode, // 🔥 ESSENCIAL PRO CONSUMER
                      })
                    }
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      </main>

      {resumo.quantidadeItens > 0 && (
        <div className="carrinho-fixo">
          <div>
            <strong>{resumo.quantidadeItens} itens no carrinho</strong>
            <small>Total: {formatarPreco(resumo.total)}</small>
          </div>

          <Link to="/carrinho">
            <button className="btn-ver-carrinho">Ver carrinho</button>
          </Link>
        </div>
      )}
    </div>
  );
}
