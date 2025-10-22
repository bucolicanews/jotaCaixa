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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SessionProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Rotas Públicas/Auth */}
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="/atualizar-senha" element={<AtualizarSenha />} />
            
            {/* Rotas Autenticadas (Protegidas pelo LayoutPrincipal) */}
            <Route path="/painel" element={<Painel />} />
            <Route path="/contas-pagar" element={<ContasPagar />} />
            <Route path="/contas-receber" element={<ContasReceber />} />
            <Route path="/bancos" element={<Bancos />} />
            <Route path="/conciliacao" element={<Conciliacao />} />
            <Route path="/importar" element={<Importar />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/plano-contas" element={<PlanoContasPage />} />
            <Route path="/gerenciar-usuarios" element={<GerenciarUsuarios />} />
            <Route path="/cadastrar-empresa" element={<CadastrarEmpresa />} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;