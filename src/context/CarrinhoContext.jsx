import React, { createContext, useContext, useMemo, useState } from "react";

const CarrinhoContext = createContext(null);

export function CarrinhoProvider({ children }) {
  const [itens, setItens] = useState([]);

  function adicionarItem(produto) {
    // produto: { id, nome, preco, desc, emoji }
    setItens((atual) => {
      const existente = atual.find((i) => i.id === produto.id);
      if (existente) {
        return atual.map((i) =>
          i.id === produto.id ? { ...i, qtd: i.qtd + 1 } : i
        );
      }
      return [...atual, { ...produto, qtd: 1 }];
    });
  }

  function removerItem(id) {
    setItens((atual) => atual.filter((i) => i.id !== id));
  }

  function aumentarQtd(id) {
    setItens((atual) =>
      atual.map((i) => (i.id === id ? { ...i, qtd: i.qtd + 1 } : i))
    );
  }

  function diminuirQtd(id) {
    setItens((atual) =>
      atual
        .map((i) => (i.id === id ? { ...i, qtd: i.qtd - 1 } : i))
        .filter((i) => i.qtd > 0)
    );
  }

  function limparCarrinho() {
    setItens([]);
  }

  const resumo = useMemo(() => {
    const quantidadeItens = itens.reduce((acc, i) => acc + i.qtd, 0);
    const total = itens.reduce((acc, i) => acc + i.qtd * (i.preco || 0), 0);
    return { quantidadeItens, total };
  }, [itens]);

  const value = useMemo(
    () => ({
      itens,
      resumo,
      adicionarItem,
      removerItem,
      aumentarQtd,
      diminuirQtd,
      limparCarrinho,
    }),
    [itens, resumo]
  );

  return (
    <CarrinhoContext.Provider value={value}>
      {children}
    </CarrinhoContext.Provider>
  );
}

export function useCarrinho() {
  const ctx = useContext(CarrinhoContext);
  if (!ctx) {
    throw new Error("useCarrinho precisa ser usado dentro de CarrinhoProvider");
  }
  return ctx;
}
