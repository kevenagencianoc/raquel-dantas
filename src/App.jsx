import { Routes, Route, Navigate } from "react-router-dom";
import Cardapio from "./pages/Cardapio.jsx";
import Carrinho from "./pages/Carrinho.jsx";
import Checkout from "./pages/Checkout.jsx";
import LoginAdmin from "./pages/admin/LoginAdmin.jsx";
import AdminProdutos from "./pages/admin/AdminProdutos.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Cardapio />} />
      <Route path="/carrinho" element={<Carrinho />} />
      <Route path="/checkout" element={<Checkout />} />

      {/* ✅ Admin */}
      <Route path="/admin" element={<LoginAdmin />} />
      <Route path="/admin/produtos" element={<AdminProdutos />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
