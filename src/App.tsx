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

const queryClient = new QueryClient();

// Componente para lidar com o redirecionamento pós-pagamento de ADESÃO
const PaymentSuccessHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { usuario, refetch, carregando, perfil } = useSessao();
  
  const paymentStatus = searchParams.get('payment');
  const sessionId = searchParams.get('session_id');

  // Lógica para ativar a assinatura
  React.useEffect(() => {
    if (paymentStatus === 'success' && sessionId && usuario && !carregando) {
      
      // CRÍTICO: Verifica se a sessão já foi processada
      const processedKey = `processed_session_${sessionId}`;
      if (sessionStorage.getItem(processedKey) === 'true') {
          navigate('/painel', { replace: true });
          return;
      }
      
      const activateSubscription = async () => {
        sessionStorage.setItem(processedKey, 'true'); // Marca como processado
        
        // 1. Buscar o plano atual do cliente (que foi definido no signUp/upsert inicial)
        const { data: clienteData, error: clienteError } = await supabase
            .from('tbl_clientes')
            .select('plano_id, admin_id')
            .eq('id', usuario.id)
            .single();
            
        if (clienteError || !clienteData?.plano_id) {
            showError('Falha ao encontrar o plano do cliente para ativação.');
            navigate('/painel', { replace: true });
            return;
        }
        
        // 2. Buscar o ID da Conta de Resultado do Stripe (configurada pelo Admin)
        const proprietarioId = clienteData.admin_id || usuario.id;
        const { data: stripeConfig, error: configError } = await supabase.functions.invoke('get-admin-stripe-config', {
            body: { adminId: proprietarioId },
        });
        
        const idContaResultado = stripeConfig?.config?.id_conta_resultado || null;
        
        if (configError || stripeConfig?.error) {
            console.error('Falha ao buscar config Stripe para ativação:', configError || stripeConfig.error);
            // Continua, mas com idContaResultado = null
        }
        
        // 3. Chamar a função RPC para ativar a assinatura
        const { error: rpcError } = await supabase.rpc('activate_subscription', {
            p_cliente_id: usuario.id,
            p_plano_id: clienteData.plano_id,
            p_id_conta_resultado: idContaResultado, // PASSANDO O ID DA CONTA DE RESULTADO
        });

        if (rpcError) {
          showError(`Falha ao ativar assinatura: ${rpcError.message}`);
        } else {
          showSuccess('Assinatura ativada com sucesso! Bem-vindo(a).');
          await refetch(); // Atualiza o perfil para remover o banner de trial
        }
        
        // Limpa a URL
        navigate('/painel', { replace: true });
      };
      
      activateSubscription();
    } else if (paymentStatus === 'canceled') {
        showError('O pagamento foi cancelado.');
        navigate('/vendas', { replace: true });
    }
  }, [paymentStatus, sessionId, usuario, carregando, navigate, refetch, perfil]);

  return null;
};

// Componente para lidar com o redirecionamento pós-pagamento de RENOVAÇÃO
const PaymentRenewalHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { usuario, refetch, carregando } = useSessao();
  
  const renewalStatus = searchParams.get('renewal');
  const sessionId = searchParams.get('session_id');
  const parcelaId = searchParams.get('cp_id'); // Agora é o ID da PARCELA

  // Lógica para renovar a assinatura
  React.useEffect(() => {
    if (renewalStatus === 'success' && sessionId && parcelaId && usuario && !carregando) {
      
      const processedKey = `processed_renewal_session_${sessionId}`;
      if (sessionStorage.getItem(processedKey) === 'true') {
          navigate('/minha-assinatura', { replace: true });
          return;
      }
      
      const renewSubscription = async () => {
        sessionStorage.setItem(processedKey, 'true'); // Marca como processado
        
        // 1. Buscar dados da sessão do Stripe para obter o valor pago E o idContaResultado
        const proprietarioId = (usuario as any)?.admin_id || usuario?.id;
        
        const { data: sessionData, error: sessionError } = await supabase.functions.invoke('get-stripe-session', {
            body: { sessionId, proprietarioId }, // Passa o ID do Admin
        });
        
        if (sessionError || !sessionData?.metadata?.valorCobrado) {
            showError('Falha ao obter detalhes da sessão de pagamento.');
            navigate('/minha-assinatura', { replace: true });
            return;
        }
        
        const valorPago = parseFloat(sessionData.metadata.valorCobrado);
        const idContaResultado = sessionData.metadata.idContaResultado || null; // LENDO O NOVO METADADO
        
        // 2. Buscar o plano atual do cliente (que foi atualizado no CheckoutPlano)
        const { data: clienteData, error: clienteError } = await supabase
            .from('tbl_clientes')
            .select('plano_id')
            .eq('id', usuario.id)
            .single();
            
        if (clienteError || !clienteData?.plano_id) {
            showError('Falha ao encontrar o plano do cliente para renovação.');
            navigate('/minha-assinatura', { replace: true });
            return;
        }
        
        // 3. Chamar a função RPC para renovar a assinatura manualmente
        const { error: rpcError } = await supabase.rpc('manual_subscription_renewal', {
            p_cliente_id: usuario.id,
            p_plano_id: clienteData.plano_id,
            p_conta_pagar_id: parcelaId, // Passa o ID da PARCELA
            p_valor_pago: valorPago, // Usa o valor pago do Stripe
            p_forma_pagamento: 'Stripe',
            // O RPC manual_subscription_renewal não precisa mais do idContaResultado, pois ele busca da configuracoes_stripe
            // Mas vamos garantir que o RPC esteja usando o valor correto.
        });

        if (rpcError) {
          showError(`Falha ao renovar assinatura: ${rpcError.message}`);
        } else {
          showSuccess('Pagamento confirmado e assinatura renovada com sucesso!');
          await refetch(); // Atualiza o perfil para pegar a nova data_fim_acesso
        }
        
        // Limpa a URL
        navigate('/minha-assinatura', { replace: true });
      };
      
      renewSubscription();
    } else if (renewalStatus === 'canceled') {
        showError('O pagamento foi cancelado.');
        navigate('/minha-assinatura', { replace: true });
    }
  }, [renewalStatus, sessionId, parcelaId, usuario, carregando, navigate, refetch]);

  return null;
};


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
          <PaymentSuccessHandler />
          <PaymentRenewalHandler />
          <Toaster />
          <Sonner />
          <Routes>
            {/* Rotas Públicas/Site (Usam SiteLayout) */}
            <Route element={<SiteLayout />}>
                <Route path="/" element={<Index />} />
                <Route path="/vendas" element={<Vendas />} />
            </Route>
            
            {/* Rotas de Auth (Não usam layout) */}
            <Route path="/login" element={<Login />} />
            <Route path="/atualizar-senha" element={<AtualizarSenha />} />
            
            {/* Rotas de Contrato (Não usam layout) */}
            <Route path="/assinar-contrato/:id" element={<AssinarContrato />} />
            <Route path="/contrato-link/:id" element={<ContratoLinkPage />} />
            
            {/* Rotas Autenticadas (Protegidas pelo LayoutPrincipal) */}
            <Route path="/painel" element={<Painel />} />
            <Route path="/contas-pagar" element={<ContasPagar />} />
            <Route path="/contas-receber" element={<ContasReceber />} />
            <Route path="/bancos" element={<Bancos />} />
            <Route path="/contas-patrimoniais" element={<ContasPatrimoniais />} />
            <Route path="/conciliacao" element={<Conciliacao />} />
            <Route path="/importar" element={<Importar />} />
            <Route path="/exportar" element={<Exportar />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="/relatorios/fluxo-caixa" element={<FluxoCaixa />} />
            <Route path="/relatorios/balanco" element={<BalancoPatrimonial />} />
            <Route path="/relatorios/dre" element={<DRE />} />
            <Route path="/relatorios/balancete" element={<Balancete />} />
            <Route path="/relatorios/razao" element={<Razao />} />
            <Route path="/relatorios/lancamentos-nao-mapeados" element={<LancamentosNaoMapeados />} />
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
            <Route path="/minha-assinatura" element={<MinhaAssinatura />} />
            <Route path="/renovacao" element={<SelecaoPagamentoRenovacao />} />
            <Route path="/historicos" element={<GerenciarHistoricos />} />
            <Route path="/clientes" element={<ClientesPage />} />
            
            {/* NOVAS ROTAS: Documentos Societários */}
            <Route path="/documentos-societarios" element={<DocumentosSocietarios />} />
            <Route path="/documentos-societarios/modelos" element={<GerenciarModelosSocietarios />} />
            <Route path="/documentos-societarios/blocos" element={<GerenciarBlocosSocietarios />} />
            <Route path="/documentos-societarios/gerar/:modeloId" element={<GerarDocumentoSocietario />} />
            
            {/* NOVAS ROTAS: Suporte */}
            <Route path="/suporte" element={<Suporte />} />
            <Route path="/admin/suporte" element={<AdminSuporte />} />
            
            {/* NOVA ROTA: Extratos */}
            <Route path="/extratos" element={<Extratos />} />
            
            {/* NOVA ROTA: Lançamentos Manuais */}
            <Route path="/lancamentos" element={<Lancamentos />} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SessionProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;