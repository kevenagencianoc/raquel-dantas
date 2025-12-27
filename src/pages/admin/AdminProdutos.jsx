import { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import "./adminProdutos.css";

export default function AdminProdutos() {
  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Form (criar/editar)
  const [modoEdicao, setModoEdicao] = useState(false);
  const [editId, setEditId] = useState(null);

  const [externalCode, setExternalCode] = useState("");
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descricao, setDescricao] = useState("");
  const [preco, setPreco] = useState("");
  const [estoque, setEstoque] = useState("");
  const [ativo, setAtivo] = useState(true);

  // ✅ Imagem por URL
  const [imagemUrl, setImagemUrl] = useState("");

  const colRef = useMemo(() => collection(db, "produtos"), []);

  async function carregarProdutos() {
    setCarregando(true);
    setErro("");
    try {
      const q = query(colRef, orderBy("criadoEm", "desc"));
      const snap = await getDocs(q);
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProdutos(lista);
    } catch (e) {
      console.error("ERRO carregarProdutos:", e);
      setErro(e?.message || "Erro ao carregar produtos.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarProdutos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function limparForm() {
    setModoEdicao(false);
    setEditId(null);

    setExternalCode("");
    setNome("");
    setCategoria("");
    setDescricao("");
    setPreco("");
    setEstoque("");
    setAtivo(true);
    setImagemUrl("");

    setErro("");
  }

  function preencherParaEditar(p) {
    setModoEdicao(true);
    setEditId(p.id);

    setExternalCode(p.externalCode || "");
    setNome(p.nome || "");
    setCategoria(p.categoria || "");
    setDescricao(p.descricao || "");
    setPreco(p.preco ?? "");
    setEstoque(p.estoque ?? "");
    setAtivo(p.ativo ?? true);

    setImagemUrl(p.imagemUrl || "");

    setErro("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validarUrlImagem(url) {
    const u = (url || "").trim();
    if (!u) return true; // opcional
    // validação simples: começa com http/https
    if (!/^https?:\/\/.+/i.test(u)) return false;
    return true;
  }

  async function salvar(e) {
    e.preventDefault();
    setErro("");

    if (!externalCode.trim()) return setErro("Informe o código externo (externalCode). Ex: 3");
    if (!nome.trim()) return setErro("Informe o nome do produto.");

    const precoNum = Number(String(preco).replace(",", "."));
    if (Number.isNaN(precoNum) || precoNum < 0) return setErro("Preço inválido. Ex: 6.50");

    const estoqueNum = Number(estoque);
    if (!Number.isInteger(estoqueNum) || estoqueNum < 0)
      return setErro("Estoque inválido (use número inteiro). Ex: 10");

    if (!validarUrlImagem(imagemUrl)) {
      return setErro("URL da imagem inválida. Precisa começar com http:// ou https://");
    }

    setSalvando(true);

    try {
      const payload = {
        externalCode: String(externalCode).trim(),
        nome: nome.trim(),
        categoria: categoria.trim(),
        descricao: descricao.trim(),
        preco: precoNum,
        estoque: estoqueNum,
        ativo: !!ativo,
        imagemUrl: (imagemUrl || "").trim(), // ✅ salva a URL
        atualizadoEm: serverTimestamp(),
      };

      if (modoEdicao && editId) {
        await updateDoc(doc(db, "produtos", editId), payload);
      } else {
        await addDoc(colRef, { ...payload, criadoEm: serverTimestamp() });
      }

      await carregarProdutos();
      limparForm();
    } catch (e2) {
      console.error("ERRO salvar produto:", e2);
      setErro(e2?.message || "Erro ao salvar produto.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id) {
    const ok = confirm("Tem certeza que deseja excluir este produto?");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "produtos", id));
      await carregarProdutos();
    } catch (e) {
      console.error("ERRO excluir:", e);
      setErro(e?.message || "Erro ao excluir produto.");
    }
  }

  async function toggleAtivo(p) {
    try {
      await updateDoc(doc(db, "produtos", p.id), {
        ativo: !(p.ativo ?? true),
        atualizadoEm: serverTimestamp(),
      });
      await carregarProdutos();
    } catch (e) {
      console.error("ERRO toggleAtivo:", e);
      setErro(e?.message || "Erro ao alterar status do produto.");
    }
  }

  async function ajustarEstoque(p, delta) {
    const atual = Number(p.estoque ?? 0);
    const novo = atual + delta;
    if (novo < 0) return;

    try {
      await updateDoc(doc(db, "produtos", p.id), {
        estoque: novo,
        atualizadoEm: serverTimestamp(),
      });
      await carregarProdutos();
    } catch (e) {
      console.error("ERRO ajustarEstoque:", e);
      setErro(e?.message || "Erro ao ajustar estoque.");
    }
  }

  return (
    <div className="admin-pagina">
      <header className="admin-topo">
        <div className="admin-topo-inner">
          <div className="admin-brand">
            <h1>Painel Admin</h1>
            <span className="admin-badge">Produtos</span>
          </div>

          <div className="admin-icones">
            <a className="admin-icone-botao admin-linkbtn" href="/admin">
              Login
            </a>
            <button className="admin-icone-botao" onClick={carregarProdutos}>
              Recarregar
            </button>
            <button className="admin-icone-botao" onClick={limparForm}>
              Novo
            </button>
          </div>
        </div>
      </header>

      <div className="admin-container">
        <section className="admin-hero">
          <div className="admin-hero-card">
            <h2>Gerencie seu cardápio</h2>
            <p>Crie, edite, controle estoque e ative/desative produtos no delivery.</p>
          </div>
        </section>

        <section className="admin-painel">
          <h3 className="admin-titulo">{modoEdicao ? "Editar produto" : "Novo produto"}</h3>

          <form onSubmit={salvar} className="admin-form">
            <div className="admin-grid2">
              <input
                className="admin-input"
                placeholder="Código externo (externalCode) - ex: 3"
                value={externalCode}
                onChange={(e) => setExternalCode(e.target.value)}
              />
              <input
                className="admin-input"
                placeholder="Nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div className="admin-grid2">
              <input
                className="admin-input"
                placeholder="Categoria (ex: Salgados)"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              />
              <div />
            </div>

            <textarea
              className="admin-textarea"
              placeholder="Descrição"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
            />

            <div className="admin-grid3">
              <input
                className="admin-input"
                placeholder="Preço (ex: 6.50)"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
              />
              <input
                className="admin-input"
                placeholder="Estoque (inteiro) ex: 10"
                value={estoque}
                onChange={(e) => setEstoque(e.target.value)}
              />

              <label className="admin-toggle">
                <input
                  type="checkbox"
                  checked={ativo}
                  onChange={(e) => setAtivo(e.target.checked)}
                />
                Ativo no delivery
              </label>
            </div>

            {/* ✅ URL da imagem */}
            <div style={{ display: "grid", gap: 10 }}>
              <div className="admin-titulo" style={{ margin: "10px 0 0" }}>
                Imagem do produto (URL) — opcional
              </div>

              <input
                className="admin-input"
                placeholder="Cole aqui a URL da imagem (https://...)"
                value={imagemUrl}
                onChange={(e) => setImagemUrl(e.target.value)}
              />

              {imagemUrl?.trim() ? (
                <div
                  style={{
                    width: 140,
                    height: 140,
                    borderRadius: 16,
                    overflow: "hidden",
                    border: "1px solid rgba(157,62,61,0.2)",
                    background: "rgba(227,120,156,0.15)",
                  }}
                >
                  <img
                    src={imagemUrl.trim()}
                    alt="Preview"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={() =>
                      setErro("Não consegui carregar a imagem dessa URL. Verifique se o link é público.")
                    }
                  />
                </div>
              ) : null}

              {imagemUrl?.trim() ? (
                <button
                  type="button"
                  className="admin-botao-branco"
                  onClick={() => setImagemUrl("")}
                >
                  Remover URL da imagem
                </button>
              ) : null}
            </div>

            <div className="admin-acoes">
              <button className="admin-botao-verde" type="submit" disabled={salvando}>
                {salvando ? "Salvando..." : modoEdicao ? "Salvar alterações" : "Adicionar produto"}
              </button>

              {modoEdicao && (
                <button className="admin-botao-branco" type="button" onClick={limparForm}>
                  Cancelar edição
                </button>
              )}
            </div>

            {erro && <div className="admin-erro">{erro}</div>}
          </form>
        </section>

        <section className="admin-secao">
          <h3>Produtos cadastrados</h3>

          {carregando ? (
            <p className="admin-loading">Carregando...</p>
          ) : produtos.length === 0 ? (
            <p className="admin-loading">Nenhum produto cadastrado.</p>
          ) : (
            <div className="admin-lista">
              {produtos.map((p) => (
                <div className="admin-card" key={p.id}>
                  <div className="admin-card-topo">
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      {/* Thumb da imagem (URL) */}
                      <div
                        style={{
                          width: 58,
                          height: 58,
                          borderRadius: 14,
                          overflow: "hidden",
                          background: "rgba(227,120,156,0.25)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                        aria-hidden="true"
                      >
                        {p.imagemUrl ? (
                          <img
                            src={p.imagemUrl}
                            alt={p.nome || "Produto"}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <span style={{ fontSize: 20 }}>🧁</span>
                        )}
                      </div>

                      <div>
                        <div className="admin-card-titulo">
                          {p.nome} {p.categoria ? <span>• {p.categoria}</span> : null}
                        </div>
                        <div className="admin-card-sub">
                          <b>Código:</b> {p.externalCode || "-"} • R$ {Number(p.preco ?? 0).toFixed(2)} •
                          Estoque: {p.estoque ?? 0} • <b>{(p.ativo ?? true) ? "Ativo" : "Inativo"}</b>
                        </div>
                      </div>
                    </div>

                    <div className="admin-card-botoes">
                      <button className="admin-mini" onClick={() => preencherParaEditar(p)}>
                        Editar
                      </button>
                      <button
                        className={`admin-mini ${(p.ativo ?? true) ? "" : "verde"}`}
                        onClick={() => toggleAtivo(p)}
                      >
                        {(p.ativo ?? true) ? "Desativar" : "Ativar"}
                      </button>
                      <button className="admin-mini" onClick={() => remover(p.id)}>
                        Excluir
                      </button>
                    </div>
                  </div>

                  {p.descricao ? <div className="admin-card-desc">{p.descricao}</div> : null}

                  <div className="admin-estoque">
                    <button className="admin-mini" onClick={() => ajustarEstoque(p, -1)}>-1</button>
                    <button className="admin-mini verde" onClick={() => ajustarEstoque(p, +1)}>+1</button>
                    <button className="admin-mini" onClick={() => ajustarEstoque(p, -5)}>-5</button>
                    <button className="admin-mini verde" onClick={() => ajustarEstoque(p, +5)}>+5</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
