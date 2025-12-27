import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles/global.css";
import { CarrinhoProvider } from "./context/CarrinhoContext.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <CarrinhoProvider>
        <App />
      </CarrinhoProvider>
    </BrowserRouter>
  </React.StrictMode>
);
