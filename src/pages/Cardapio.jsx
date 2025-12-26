import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./Cardapio.css";
import logo from "../assets/logo.png";
import { useCarrinho } from "../context/CarrinhoContext.jsx";

function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Cardapio() {
  const { adicionarItem, resumo } = useCarrinho();

  const categorias = useMemo(
    () => ["Bolos", "Salgados", "Açaí", "Doces", "Encomendas"],
    []
  );

  // Produtos temporários (depois vem do Firebase)
  const produtos = useMemo(
    () => [
      {
        id: "p1",
        categoria: "Bolos",
        nome: "Bolo de Chocolate (fatia)",
        desc: "Massa fofinha + cobertura cremosa.",
        preco: 9.9,
        emoji: "🍰",
      },
      {
        id: "p2",
        categoria: "Bolos",
        nome: "Bolo de Cenoura (fatia)",
        desc: "Com cobertura de chocolate.",
        preco: 9.5,
        emoji: "🍫",
      },
      {
        id: "p3",
        categoria: "Salgados",
        nome: "Coxinha",
        desc: "Frango temperado, crocante por fora.",
        preco: 6.5,
        emoji: "🥟",
      },
      {
        id: "p4",
        categoria: "Salgados",
        nome: "Pastel",
        desc: "Recheio caprichado, bem sequinho.",
        preco: 8.0,
        emoji: "🥠",
      },
      {
        id: "p5",
        categoria: "Açaí",
        nome: "Açaí 500ml",
        desc: "Monte do seu jeito (adicionais no próximo passo).",
        preco: 18.0,
        emoji: "🫐",
      },
      {
        id: "p6",
        categoria: "Doces",
        nome: "Brigadeiro Gourmet",
        desc: "Chocolate intenso e textura perfeita.",
        preco: 3.5,
        emoji: "🍬",
      },
      {
        id: "p7",
        categoria: "Encomendas",
        nome: "Bolo por encomenda",
        desc: "Agende data, tema e mensagem.",
        preco: 0,
        emoji: "🎂",
      },
    ],
    []
  );

  const [categoriaAtiva, setCategoriaAtiva] = useState(categorias[0]);
  const [busca, setBusca] = useState("");

  const produtosFiltrados = useMemo(() => {
    const texto = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      const okCat = p.categoria === categoriaAtiva;
      const okBusca =
        texto.length === 0 ||
        p.nome.toLowerCase().includes(texto) ||
        p.desc.toLowerCase().includes(texto);
      return okCat && okBusca;
    });
  }, [produtos, categoriaAtiva, busca]);

  return (
    <div className="pagina">
      <header className="topo">
        <div className="topo-inner">
          <div className="brand">
            <img className="logo" src={logo} alt="Raquel Dantas Confeitaria" />
            <div className="brand-txt">
              <h1>Raquel Dantas</h1>
              <p>Bolos • Salgados • Açaí • Doces</p>
            </div>
          </div>

          <div className="icones-topo">
            <button className="icone-botao" title="Buscar" aria-label="Buscar">
              🔎
            </button>
            <Link to="/carrinho" aria-label="Ir para o carrinho">
              <button className="icone-botao" title="Carrinho">
                🛒
              </button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <div className="hero-card">
            <h2>Peça agora e receba rapidinho ✨</h2>
            <p>
              Escolha no cardápio e finalize com Pix ou cartão. Experiência
              perfeita para celular.
            </p>

            <div className="hero-acoes">
              <button
                className="botao-primario"
                onClick={() => setCategoriaAtiva("Açaí")}
              >
                Ver Açaí
              </button>
              <button
                className="botao-secundario"
                onClick={() => setCategoriaAtiva("Bolos")}
              >
                Ver Bolos
              </button>
            </div>

            <div className="busca" style={{ marginTop: 14 }}>
              <span aria-hidden="true">🔎</span>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar no cardápio… (ex: coxinha, açaí, brigadeiro)"
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
              <div className="foto" aria-hidden="true">
                <span>{p.emoji}</span>
              </div>

              <div className="info">
                <h4 className="nome">{p.nome}</h4>
                <p className="desc">{p.desc}</p>

                <div className="rodape-card">
                  <div className="preco">
                    {p.preco > 0 ? formatarPreco(p.preco) : "Sob consulta"}
                  </div>

                  <button className="btn-add" onClick={() => adicionarItem(p)}>
                    Adicionar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      </main>

      {resumo.quantidadeItens > 0 && (
        <div
          className="carrinho-fixo"
          role="region"
          aria-label="Resumo do carrinho"
        >
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
