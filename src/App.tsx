import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { SessionProvider } from "./contexts/SessionContext";

// Páginas
import Index from "@/pages/Index";
import Login from "./pages/Login";
import AtualizarSenha from "./pages/AtualizarSenha";
import Painel from "@/pages/Painel";
import Configuracoes from "./pages/Configuracoes";
import ContasReceber from "./pages/ContasReceber";
import ContasPagar from "./pages/ContasPagar";
import Bancos from "./pages/Bancos";
import Conciliacao from "./pages/Conciliacao";
import Importar from "./pages/Importar";
import PlanoContas from "./pages/PlanoContas";
import Contratos from "./pages/Contratos";
import GerenciarTags from "./pages/GerenciarTags";
import GerenciarModelos from "./pages/GerenciarModelos";
import PreencherContrato from "./pages/PreencherContrato";
import MinhaAssinatura from "./pages/MinhaAssinatura";
import PaymentSuccessHandler from "@/components/PaymentSuccessHandler";
import GerenciarPlanos from "./pages/GerenciarPlanos";
import Vendas from "./pages/Vendas";
import SelecaoPerfil from "./pages/SelecaoPerfil";
import SelecaoPagamentoRenovacao from "./pages/SelecaoPagamentoRenovacao";
import CadastrarEmpresa from "./pages/CadastrarEmpresa";
import GerenciarUsuarios from "./pages/GerenciarUsuarios";
import PontoEletronico from "./pages/PontoEletronico";
import FolhaPonto from "./pages/FolhaPonto";
import ClientesPage from "./pages/Clientes";
import Relatorios from "./pages/Relatorios";
import Perfil from "./pages/Perfil";
import NotFound from "./pages/NotFound";

function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/painel" element={<Painel />} />
          <Route path="/login" element={<Login />} />
          <Route path="/atualizar-senha" element={<AtualizarSenha />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="/contas-receber" element={<ContasReceber />} />
          <Route path="/contas-pagar" element={<ContasPagar />} />
          <Route path="/bancos" element={<Bancos />} />
          <Route path="/conciliacao" element={<Conciliacao />} />
          <Route path="/importar" element={<Importar />} />
          <Route path="/plano-contas" element={<PlanoContas />} />
          <Route path="/minha-assinatura" element={<MinhaAssinatura />} />
          <Route path="/payment-success" element={<PaymentSuccessHandler />} />
          <Route path="/planos" element={<GerenciarPlanos />} />
          <Route path="/vendas" element={<Vendas />} />
          <Route path="/selecao-perfil" element={<SelecaoPerfil />} />
          <Route path="/renovacao" element={<SelecaoPagamentoRenovacao />} />
          <Route path="/cadastrar-empresa" element={<CadastrarEmpresa />} />
          <Route path="/gerenciar-usuarios" element={<GerenciarUsuarios />} />
          <Route path="/ponto-eletronico" element={<PontoEletronico />} />
          <Route path="/folha-ponto" element={<FolhaPonto />} />
          <Route path="/clientes" element={<ClientesPage />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/perfil" element={<Perfil />} />
          
          {/* Módulo Contratos */}
          <Route path="/contratos" element={<Contratos />} />
          <Route path="/contratos/tags" element={<GerenciarTags />} />
          <Route path="/contratos/modelos" element={<GerenciarModelos />} />
          <Route path="/contratos/preencher/:modeloId" element={<PreencherContrato />} />
          
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </SessionProvider>
  );
}

export default App;