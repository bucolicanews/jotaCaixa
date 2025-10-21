import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProvedorAutenticacao } from "./contextos/ContextoAutenticacao";
import LayoutPrincipal from "./componentes/LayoutPrincipal";
import TelaLogin from "./pages/Login";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Páginas placeholder (serão criadas a seguir)
import ContasPagar from "./pages/ContasPagar";
import ContasReceber from "./pages/ContasReceber";
import Bancos from "./pages/Bancos";
import Conciliacao from "./pages/Conciliacao";
import Importar from "./pages/Importar";
import Relatorios from "./pages/Relatorios";
import Configuracoes from "./pages/Configuracoes";
import AdminUsuarios from "./pages/AdminUsuarios";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ProvedorAutenticacao>
          <Routes>
            <Route path="/login" element={<TelaLogin />} />
            
            {/* Rotas Protegidas */}
            <Route element={<LayoutPrincipal />}>
              <Route path="/" element={<Index />} />
              <Route path="/contas-pagar" element={<ContasPagar />} />
              <Route path="/contas-receber" element={<ContasReceber />} />
              <Route path="/bancos" element={<Bancos />} />
              <Route path="/conciliacao" element={<Conciliacao />} />
              <Route path="/importar" element={<Importar />} />
              <Route path="/relatorios" element={<Relatorios />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
              <Route path="/admin/usuarios" element={<AdminUsuarios />} />
            </Route>

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ProvedorAutenticacao>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;