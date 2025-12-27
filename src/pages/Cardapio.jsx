import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./Cardapio.css";
import logo from "../assets/logo.png";
import { useCarrinho } from "../context/CarrinhoContext.jsx";

import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";

function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Cardapio() {
  const { adicionarItem, resumo } = useCarrinho();

  // Produtos vindos do Firebase
  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  // Categorias dinâmicas
  const [categoriaAtiva, setCategoriaAtiva] = useState("Todas");
  const [busca, setBusca] = useState("");

  async function carregarProdutos() {
    setCarregando(true);
    setErro("");

    try {
      const colRef = collection(db, "produtos");
      const q = query(colRef, orderBy("criadoEm", "desc"));
      const snap = await getDocs(q);

      const lista = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          externalCode: data.externalCode || "",
          categoria: data.categoria || "Outros",
          nome: data.nome || "",
          desc: data.descricao || "",
          preco: Number(data.preco ?? 0),
          estoque: Number(data.estoque ?? 0),
          ativo: data.ativo ?? true,
          imagemUrl: data.imagemUrl || "",
          emoji: data.emoji || "🍰", // fallback
        };
      });

      // ✅ Só ativos
      const ativos = lista.filter((p) => p.ativo === true);

      setProdutos(ativos);

      // Se ainda está "Todas", beleza. Se quiser forçar primeira categoria quando tiver produtos:
      // (mantive "Todas" porque fica mais fácil pro usuário)
    } catch (e) {
      setErro("Não foi possível carregar o cardápio do servidor.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarProdutos();
  }, []);

  // Categorias a partir do que veio do Firestore
  const categorias = useMemo(() => {
    const set = new Set();
    produtos.forEach((p) => {
      if (p.categoria) set.add(p.categoria);
    });
    return ["Todas", ...Array.from(set)];
  }, [produtos]);

  const produtosFiltrados = useMemo(() => {
    const texto = busca.trim().toLowerCase();

    return produtos.filter((p) => {
      const okCat = categoriaAtiva === "Todas" ? true : p.categoria === categoriaAtiva;

      const okBusca =
        texto.length === 0 ||
        (p.nome || "").toLowerCase().includes(texto) ||
        (p.desc || "").toLowerCase().includes(texto) ||
        (p.externalCode || "").toLowerCase().includes(texto);

      return okCat && okBusca;
    });
  }, [produtos, categoriaAtiva, busca]);

  function adicionarAoCarrinho(p) {
    // Se o consumer depende do externalCode, a gente garante aqui:
    if (!p.externalCode) {
      alert("Este produto está sem código externo (externalCode). Cadastre no painel admin.");
      return;
    }

    // Respeita estoque
    if ((p.estoque ?? 0) <= 0) {
      alert("Produto esgotado.");
      return;
    }

    // Mantém o formato compatível com seu carrinho atual
    // (e adiciona externalCode/imagemUrl sem atrapalhar)
    adicionarItem({
      id: p.id,
      externalCode: p.externalCode,
      categoria: p.categoria,
      nome: p.nome,
      desc: p.desc,
      preco: p.preco,
      emoji: p.emoji,
      imagemUrl: p.imagemUrl,
      estoque: p.estoque,
    });
  }

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
            <button
              className="icone-botao"
              title="Atualizar"
              aria-label="Atualizar"
              onClick={carregarProdutos}
            >
              ↻
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
              Escolha no cardápio e finalize com Pix ou cartão. Experiência perfeita para celular.
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
                placeholder="Buscar no cardápio… (nome, descrição ou código)"
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

        {erro && <p style={{ color: "#9D3E3D", fontWeight: 900 }}>{erro}</p>}

        {carregando ? (
          <p style={{ color: "#9D3E3D", fontWeight: 900 }}>Carregando...</p>
        ) : (
          <section className="lista">
            {produtosFiltrados.map((p) => {
              const esgotado = (p.estoque ?? 0) <= 0;

              return (
                <article key={p.id} className="card">
                  <div className="foto" aria-hidden="true">
                    {p.imagemUrl ? (
                      <img
                        src={p.imagemUrl}
                        alt={p.nome}
                        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 20 }}
                      />
                    ) : (
                      <span>{p.emoji || "🍰"}</span>
                    )}
                  </div>

                  <div className="info">
                    <h4 className="nome">
                      {p.nome}{" "}
                      {p.externalCode ? (
                        <small style={{ fontWeight: 1000, opacity: 0.7 }}>• {p.externalCode}</small>
                      ) : null}
                    </h4>

                    <p className="desc">{p.desc}</p>

                    <div className="rodape-card">
                      <div className="preco">
                        {p.preco > 0 ? formatarPreco(p.preco) : "Sob consulta"}
                        <small style={{ marginLeft: 8, fontWeight: 1000, opacity: 0.7 }}>
                          • Estoque: {p.estoque}
                        </small>
                      </div>

                      <button
                        className="btn-add"
                        onClick={() => adicionarAoCarrinho(p)}
                        disabled={esgotado}
                        style={esgotado ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
                      >
                        {esgotado ? "Esgotado" : "Adicionar"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      {resumo.quantidadeItens > 0 && (
        <div className="carrinho-fixo" role="region" aria-label="Resumo do carrinho">
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
