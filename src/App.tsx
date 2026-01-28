import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useSearchParams, useNavigate } from "react-router-dom";
import { SessionProvider } from "./contexts/SessionContext";
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
import PlanoContasPage from "./pages/contabilidade/PlanoContas";
import GerenciarUsuarios from "./pages/GerenciarUsuarios";
import CadastrarEmpresa from "./pages/CadastrarEmpresa";
import PontoEletronico from "./pages/PontoEletronico";
import Perfil from "./pages/Perfil";
import FolhaPonto from "./pages/FolhaPonto";
import Contratos from "./pages/Contratos";
import GerenciarTags from "./pages/GerenciarTags";
import GerenciarModelos from "./pages/GerenciarModelos";
import NovoContrato from "./pages/NovoContrato";
import PreencherContrato from "./pages/PreencherContrato";
import GerenciarPlanos from "./pages/GerenciarPlanos";
import Vendas from "./pages/Vendas";
import { supabase } from "./integrations/supabase/client";
import { showSuccess, showError } from "./utils/toast";
import { useSessao } from "./hooks/use-sessao";
import MinhaAssinatura from "./pages/MinhaAssinatura";
import SelecaoPagamentoRenovacao from "./pages/SelecaoPagamentoRenovacao";
import FluxoCaixa from "./pages/FluxoCaixa";
import BalancoPatrimonial from "./pages/BalancoPatrimonial";
import TesteGratis from "./pages/TesteGratis";
import AssinarContrato from "./pages/AssinarContrato";
import ContratoLinkPage from "./pages/ContratoLinkPage";
import DRE from "./pages/DRE";
import GerenciarHistoricos from "./pages/GerenciarHistoricos";
import ClientesPage from "./pages/Clientes";
import SiteLayout from "./components/SiteLayout";
import Index from "./pages/Index";
import DocumentosSocietarios from "./pages/DocumentosSocietarios";
import GerenciarModelosSocietarios from "./pages/GerenciarModelosSocietarios";
import GerenciarBlocosSocietarios from "./pages/GerenciarBlocosSocietarios";
import GerarDocumentoSocietario from "./pages/GerarDocumentoSocietario";
import Suporte from "./pages/Suporte";
import AdminSuporte from "./pages/AdminSuporte";
import ContasPatrimoniais from "./pages/ContasPatrimoniais";
import Extratos from "./pages/Extratos";
import Exportar from "./pages/Exportar";
import LancamentosNaoMapeados from "./pages/LancamentosNaoMapeados";
import Balancete from "./pages/Balancete"; // NOVO IMPORT
import Razao from "./pages/Razao"; // NOVO IMPORT
import Lancamentos from "./pages/Lancamentos"; // NOVO IMPORT
import Protocolos from "./pages/Protocolos"; // NOVO IMPORT
import ConfirmarRecebimento from "./pages/ConfirmarRecebimento"; // NOVO IMPORT
import GerenciarDescricoesExtrato from "./pages/GerenciarDescricoesExtrato";
import GerenciarIdentificadoresExtrato from "./pages/GerenciarIdentificadoresExtrato";
import GerenciarConfiguracoesExtrato from "./pages/GerenciarConfiguracoesExtrato";
import Mapeamento from "./pages/Mapeamento";
import ConfiguracoesPagBank from "./pages/ConfiguracoesPagBank";
import PagamentoPix from "./pages/PagamentoPix";
import ProtectedRoute from "@/components/ProtectedRoute";
import GlobalHandlers from "@/components/GlobalHandlers";
import { ErrorBoundary } from "@/components/ErrorBoundary";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter 
        future={{ 
          v7_startTransition: true, 
          v7_relativeSplatPath: true 
        }}
      >
        <SessionProvider>
          <ErrorBoundary>
            <GlobalHandlers />
            <Toaster />
            <Sonner />
            <Routes>
              {/* Rotas Públicas/Site (Usam SiteLayout) */}
              <Route element={<SiteLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/vendas" element={<Vendas />} />
              <Route path="/teste-gratis" element={<TesteGratis />} />
              </Route>
              
              {/* Rotas de Auth (Não usam layout) */}
              <Route path="/login" element={<Login />} />
              <Route path="/atualizar-senha" element={<AtualizarSenha />} />
              <Route path="/painel" element={<Painel />} />
              
              {/* Rotas de Contrato (Não usam layout) */}
              <Route path="/assinar-contrato/:id" element={<AssinarContrato />} />
              <Route path="/contrato-link/:id" element={<ContratoLinkPage />} />
              <Route path="/protocolo/confirmar/:id" element={<ConfirmarRecebimento />} />
              
              {/* Rota Pública: Pagamento PIX */}
              <Route path="/pix/:id" element={<PagamentoPix />} />
              
              {/* Rotas Autenticadas (Protegidas pelo LayoutPrincipal) */}
            
              <Route path="/contas-pagar" element={<ProtectedRoute permissionKey="contas_pagar"><ContasPagar /></ProtectedRoute>} />
              <Route path="/contas-receber" element={<ProtectedRoute permissionKey="contas_receber"><ContasReceber /></ProtectedRoute>} />
              <Route path="/bancos" element={<ProtectedRoute permissionKey="bancos"><Bancos /></ProtectedRoute>} />
              <Route path="/contas-patrimoniais" element={<ProtectedRoute permissionKey="contas_patrimoniais"><ContasPatrimoniais /></ProtectedRoute>} />
              <Route path="/conciliacao" element={<ProtectedRoute permissionKey="conciliacao"><Conciliacao /></ProtectedRoute>} />
              <Route path="/importar" element={<ProtectedRoute permissionKey="importar"><Importar /></ProtectedRoute>} />
              <Route path="/exportar" element={<ProtectedRoute permissionKey="exportar"><Exportar /></ProtectedRoute>} />
              <Route path="/relatorios" element={<ProtectedRoute permissionKey="relatorios"><Relatorios /></ProtectedRoute>} />
              <Route path="/relatorios/fluxo-caixa" element={<ProtectedRoute permissionKey="relatorios"><FluxoCaixa /></ProtectedRoute>} />
              <Route path="/relatorios/balanco" element={<ProtectedRoute permissionKey="balanco"><BalancoPatrimonial /></ProtectedRoute>} />
              <Route path="/relatorios/dre" element={<ProtectedRoute permissionKey="dre"><DRE /></ProtectedRoute>} />
              <Route path="/relatorios/balancete" element={<ProtectedRoute permissionKey="balancete"><Balancete /></ProtectedRoute>} />
              <Route path="/relatorios/razao" element={<ProtectedRoute permissionKey="razao"><Razao /></ProtectedRoute>} />
              <Route path="/relatorios/lancamentos-nao-mapeados" element={<ProtectedRoute permissionKey="lancamentos"><LancamentosNaoMapeados /></ProtectedRoute>} />
              <Route path="/configuracoes" element={<ProtectedRoute permissionKey="configuracoes"><Configuracoes /></ProtectedRoute>} />
              <Route path="/configuracoes-pagbank" element={<ProtectedRoute permissionKey="configuracoes"><ErrorBoundary><ConfiguracoesPagBank /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/planos" element={<ProtectedRoute permissionKey=""><GerenciarPlanos /></ProtectedRoute>} />
              <Route path="/plano-contas" element={<ProtectedRoute permissionKey="plano_contas"><PlanoContasPage /></ProtectedRoute>} />
              <Route path="/gerenciar-usuarios" element={<ProtectedRoute permissionKey="cadastrar_usuarios"><GerenciarUsuarios /></ProtectedRoute>} />
              <Route path="/cadastrar-empresa" element={<ProtectedRoute permissionKey="gerenciar_clientes"><CadastrarEmpresa /></ProtectedRoute>} />
              <Route path="/ponto-eletronico" element={<ProtectedRoute permissionKey="ponto_eletronico"><PontoEletronico /></ProtectedRoute>} />
              <Route path="/perfil" element={<Perfil />} />
              <Route path="/folha-ponto" element={<ProtectedRoute permissionKey="folha_ponto"><FolhaPonto /></ProtectedRoute>} />
              <Route path="/contratos" element={<ProtectedRoute permissionKey="contratos"><Contratos /></ProtectedRoute>} />
              <Route path="/contratos/tags" element={<ProtectedRoute permissionKey="contratos"><GerenciarTags /></ProtectedRoute>} />
              <Route path="/contratos/modelos" element={<ProtectedRoute permissionKey="contratos"><GerenciarModelos /></ProtectedRoute>} />
              <Route path="/contratos/novo" element={<ProtectedRoute permissionKey="contratos"><NovoContrato /></ProtectedRoute>} />
              <Route path="/contratos/preencher/:modeloId" element={<ProtectedRoute permissionKey="contratos"><PreencherContrato /></ProtectedRoute>} />
              <Route path="/minha-assinatura" element={<MinhaAssinatura />} />
              <Route path="/renovacao" element={<ProtectedRoute permissionKey=""><SelecaoPagamentoRenovacao /></ProtectedRoute>} />
              <Route path="/historicos" element={<ProtectedRoute permissionKey="historicos"><GerenciarHistoricos /></ProtectedRoute>} />
              <Route path="/clientes" element={<ClientesPage />} />
              
              {/* NOVAS ROTAS: Documentos Societários */}
              <Route path="/documentos-societarios" element={<ProtectedRoute permissionKey="documentos_societarios"><DocumentosSocietarios /></ProtectedRoute>} />
              <Route path="/documentos-societarios/modelos" element={<ProtectedRoute permissionKey="documentos_societarios"><GerenciarModelosSocietarios /></ProtectedRoute>} />
              <Route path="/documentos-societarios/blocos" element={<ProtectedRoute permissionKey="documentos_societarios"><GerenciarBlocosSocietarios /></ProtectedRoute>} />
              <Route path="/documentos-societarios/gerar/:modeloId" element={<ProtectedRoute permissionKey="documentos_societarios"><GerarDocumentoSocietario /></ProtectedRoute>} />

              {/* NOVAS ROTAS: Suporte */}
              <Route path="/suporte" element={<ProtectedRoute permissionKey="gestao_suporte"><Suporte /></ProtectedRoute>} />
              <Route path="/admin/suporte" element={<ProtectedRoute permissionKey="gestao_suporte"><AdminSuporte /></ProtectedRoute>} />
              
              {/* NOVA ROTA: Extratos */}
              <Route path="/extratos" element={<ProtectedRoute permissionKey="extratos"><Extratos /></ProtectedRoute>} />
              <Route path="/banco/descricoes" element={<ProtectedRoute permissionKey="extratos"><GerenciarDescricoesExtrato /></ProtectedRoute>} />
              <Route path="/banco/identificadores" element={<ProtectedRoute permissionKey="extratos"><GerenciarIdentificadoresExtrato /></ProtectedRoute>} />
              <Route path="/banco/configuracoes" element={<ProtectedRoute permissionKey="extratos"><GerenciarConfiguracoesExtrato /></ProtectedRoute>} />
              <Route path="/mapeamento" element={<ProtectedRoute permissionKey="conciliacao"><Mapeamento /></ProtectedRoute>} />
              
              {/* NOVA ROTA: Lançamentos Manuais */}
              <Route path="/lancamentos" element={<ProtectedRoute permissionKey="lancamentos"><Lancamentos /></ProtectedRoute>} />

              <Route path="/protocolos" element={<ProtectedRoute permissionKey="protocolos"><Protocolos /></ProtectedRoute>} />

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </SessionProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;