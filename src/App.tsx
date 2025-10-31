import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SessionProvider } from "@/contexts/SessionContext";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Painel from "./pages/Painel";
import ContasPagar from "./pages/ContasPagar";
import ContasReceber from "./pages/ContasReceber";
import Bancos from "./pages/Bancos";
import Conciliacao from "./pages/Conciliacao";
import Importar from "./pages/Importar";
import Relatorios from "./pages/Relatorios";
import Configuracoes from "./pages/Configuracoes";
import AtualizarSenha from "./pages/AtualizarSenha";
import PlanoContasPage from "./pages/PlanoContas";
import GerenciarUsuarios from "./pages/GerenciarUsuarios";
import CadastrarEmpresa from "./pages/CadastrarEmpresa";
import PontoEletronico from "./pages/PontoEletronico";
import ClientesPage from "./pages/Clientes";
import Perfil from "./pages/Perfil";
import FolhaPonto from "./pages/FolhaPonto";
import Contratos from "./pages/Contratos";
import GerenciarTags from "./pages/GerenciarTags";
import GerenciarModelos from "./pages/GerenciarModelos";
import NovoContrato from "./pages/NovoContrato";
import PreencherContrato from "./pages/PreencherContrato";
import GerenciarPlanos from "./pages/GerenciarPlanos";
import Vendas from "./pages/Vendas";
import SelecaoPerfil from "./pages/SelecaoPerfil"; // Novo Import

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <SessionProvider>
          <Toaster />
          <Sonner />
          <Routes>
            {/* Rotas Públicas/Auth */}
            <Route path="/" element={<Vendas />} />
            <Route path="/vendas" element={<Vendas />} />
            <Route path="/login" element={<Login />} />
            <Route path="/atualizar-senha" element={<AtualizarSenha />} />
            
            {/* Rota de Seleção de Perfil */}
            <Route path="/selecao-perfil" element={<SelecaoPerfil />} />
            
            {/* Rotas Autenticadas (Protegidas pelo LayoutPrincipal) */}
            <Route path="/painel" element={<Painel />} />
            <Route path="/contas-pagar" element={<ContasPagar />} />
            <Route path="/contas-receber" element={<ContasReceber />} />
            <Route path="/clientes" element={<ClientesPage />} />
            <Route path="/bancos" element={<Bancos />} />
            <Route path="/conciliacao" element={<Conciliacao />} />
            <Route path="/importar" element={<Importar />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/planos" element={<GerenciarPlanos />} />
            <Route path="/plano-contas" element={<PlanoContasPage />} />
            <Route path="/gerenciar-usuarios" element={<GerenciarUsuarios />} />
            <Route path="/cadastrar-empresa" element={<CadastrarEmpresa />} />
            <Route path="/ponto-eletronico" element={<PontoEletronico />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/folha-ponto" element={<FolhaPonto />} />
            <Route path="/contratos" element={<Contratos />} />
            <Route path="/contratos/tags" element={<GerenciarTags />} />
            <Route path="/contratos/modelos" element={<GerenciarModelos />} />
            <Route path="/contratos/novo" element={<NovoContrato />} />
            <Route path="/contratos/preencher/:modeloId" element={<PreencherContrato />} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SessionProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;