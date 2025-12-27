import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "../../firebase";
import "./adminLogin.css";

export default function LoginAdmin() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [logado, setLogado] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setLogado(!!u));
    return () => unsub();
  }, []);

  async function entrar(e) {
    e.preventDefault();
    setErro("");
    try {
      await signInWithEmailAndPassword(auth, email, senha);
    } catch {
      setErro("Não foi possível entrar. Verifique e-mail e senha.");
    }
  }

  async function sair() {
    await signOut(auth);
  }

  return (
    <div className="admin-pagina">
      <header className="admin-topo">
        <div className="admin-topo-inner">
          <div className="admin-brand">
            <h1>Painel Admin</h1>
            <span className="admin-badge">Login</span>
          </div>
        </div>
      </header>

      <div className="admin-container">
        <section className="admin-hero">
          <div className="admin-hero-card">
            <h2>Acesso restrito</h2>
            <p>Entre com seu e-mail e senha para gerenciar produtos e estoque.</p>
          </div>
        </section>

        <section className="admin-login-card">
          {logado ? (
            <>
              <h3 className="admin-titulo">Você está logado ✅</h3>
              <p className="admin-login-sub">Agora você pode acessar o painel de produtos.</p>

              <div className="admin-acoes">
                <a className="admin-botao-verde admin-linkbtn" href="/admin/produtos">
                  Ir para Produtos
                </a>
                <button className="admin-botao-branco" onClick={sair}>
                  Sair
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="admin-titulo">Entrar</h3>

              <form onSubmit={entrar} className="admin-form">
                <input
                  className="admin-input"
                  placeholder="E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />

                <input
                  className="admin-input"
                  placeholder="Senha"
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete="current-password"
                />

                <div className="admin-acoes">
                  <button className="admin-botao-verde" type="submit">
                    Entrar
                  </button>
                  <a className="admin-botao-branco admin-linkbtn" href="/">
                    Voltar ao Cardápio
                  </a>
                </div>

                {erro && <div className="admin-erro">{erro}</div>}
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
