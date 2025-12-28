import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useCarrinho } from "../context/CarrinhoContext";

export default function Cardapio() {
  const { adicionarItem } = useCarrinho();
  const [produtos, setProdutos] = useState([]);

  useEffect(() => {
    async function carregar() {
      const snap = await getDocs(collection(db, "produtos"));
      setProdutos(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(p => p.ativo)
      );
    }
    carregar();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>Cardápio</h2>

      {produtos.map(p => (
        <div key={p.id} style={{ marginBottom: 10 }}>
          <b>{p.nome}</b>
          <div>R$ {p.preco}</div>

          <button
            onClick={() =>
              adicionarItem({
                id: p.id,
                nome: p.nome,
                preco: p.preco,
                qtd: 1,
                externalCode: p.externalCode, // 🔥 ESSENCIAL
              })
            }
          >
            Adicionar
          </button>
        </div>
      ))}
    </div>
  );
}
