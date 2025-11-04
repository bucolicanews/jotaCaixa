import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { SessionProvider } from "./contexts/SessionContext";

// Páginas
import Login from "./pages/Login";
import AtualizarSenha from "./pages/AtualizarSenha";
import Dashboard from "./pages/Dashboard";
import Configuracoes from "./pages/Configuracoes";
import ContasReceber from "./pages/ContasReceber";
import Bancos from "./pages/Bancos";
import Conciliacao from "./pages/Conciliacao";
import Importar from "./pages/Importar";
import PlanoContas from "./pages/PlanoContas";
import Contratos from "./pages/Contratos";
import GerenciarTags from "./pages/GerenciarTags";
import GerenciarModelos from "./pages/GerenciarModelos";
import PreencherContrato from "./pages/PreencherContrato";
import MinhaAssinatura from "./pages/MinhaAssinatura";
import PaymentSuccessHandler from "./components/PaymentSuccessHandler";

function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/login" element={<Login />} />
          <Route path="/atualizar-senha" element={<AtualizarSenha />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="/contas-receber" element={<ContasReceber />} />
          <Route path="/bancos" element={<Bancos />} />
          <Route path="/conciliacao" element={<Conciliacao />} />
          <Route path="/importar" element={<Importar />} />
          <Route path="/plano-contas" element={<PlanoContas />} />
          <Route path="/minha-assinatura" element={<MinhaAssinatura />} />
          <Route path="/payment-success" element={<PaymentSuccessHandler />} />
          
          {/* Módulo Contratos */}
          <Route path="/contratos" element={<Contratos />} />
          <Route path="/contratos/tags" element={<GerenciarTags />} />
          <Route path="/contratos/modelos" element={<GerenciarModelos />} />
          <Route path="/contratos/preencher/:modeloId" element={<PreencherContrato />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </SessionProvider>
  );
}

export default App;