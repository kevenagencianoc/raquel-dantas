import { useEffect, useState } from "react";
import { db } from "../../firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";

export default function AdminProdutos() {
  const [produtos, setProdutos] = useState([]);

  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [categoria, setCategoria] = useState("");
  const [externalCode, setExternalCode] = useState("");

  async function carregarProdutos() {
    const snap = await getDocs(collection(db, "produtos"));
    setProdutos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  useEffect(() => {
    carregarProdutos();
  }, []);

  async function adicionarProduto() {
    if (!nome || !preco || !externalCode) {
      alert("Preencha nome, preço e externalCode");
      return;
    }

    await addDoc(collection(db, "produtos"), {
      nome,
      preco: Number(preco),
      categoria,
      externalCode: String(externalCode), // 🔥 ESSENCIAL
      ativo: true,
      criadoEm: new Date().toISOString(),
    });

    setNome("");
    setPreco("");
    setCategoria("");
    setExternalCode("");
    carregarProdutos();
  }

  async function toggleAtivo(id, ativo) {
    await updateDoc(doc(db, "produtos", id), { ativo: !ativo });
    carregarProdutos();
  }

  async function excluirProduto(id) {
    if (!window.confirm("Excluir produto?")) return;
    await deleteDoc(doc(db, "produtos", id));
    carregarProdutos();
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Painel Admin – Produtos</h2>

      <input placeholder="Nome" value={nome} onChange={e => setNome(e.target.value)} />
      <input placeholder="Preço" value={preco} onChange={e => setPreco(e.target.value)} />
      <input placeholder="Categoria" value={categoria} onChange={e => setCategoria(e.target.value)} />
      <input
        placeholder="External Code (PDV / Consumer)"
        value={externalCode}
        onChange={e => setExternalCode(e.target.value)}
      />

      <button onClick={adicionarProduto}>Adicionar Produto</button>

      <hr />

      {produtos.map(p => (
        <div key={p.id} style={{ marginBottom: 8 }}>
          <b>{p.nome}</b> – R$ {p.preco} – externalCode: {p.externalCode}
          <button onClick={() => toggleAtivo(p.id, p.ativo)}>
            {p.ativo ? "Desativar" : "Ativar"}
          </button>
          <button onClick={() => excluirProduto(p.id)}>Excluir</button>
        </div>
      ))}
    </div>
  );
}
