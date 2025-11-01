import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useSearchParams, useNavigate } from "react-router-dom";
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
import { supabase } from "./integrations/supabase/client";
import { showSuccess, showError } from "./utils/toast";
import { useSessao } from "./hooks/use-sessao";
import MinhaAssinatura from "./pages/MinhaAssinatura";
import SelecaoPagamentoRenovacao from "./pages/SelecaoPagamentoRenovacao"; // NOVA IMPORTAÇÃO

const queryClient = new QueryClient();

// Componente para lidar com o redirecionamento pós-pagamento de ADESÃO
const PaymentSuccessHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { usuario, refetch, carregando } = useSessao();
  
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
            .select('plano_id')
            .eq('id', usuario.id)
            .single();
            
        if (clienteError || !clienteData?.plano_id) {
            showError('Falha ao encontrar o plano do cliente para ativação.');
            navigate('/painel', { replace: true });
            return;
        }
        
        // 2. Chamar a função RPC para ativar a assinatura
        const { error: rpcError } = await supabase.rpc('activate_subscription', {
            p_cliente_id: usuario.id,
            p_plano_id: clienteData.plano_id,
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
  }, [paymentStatus, sessionId, usuario, carregando, navigate, refetch]);

  return null;
};

// Componente para lidar com o redirecionamento pós-pagamento de RENOVAÇÃO
const PaymentRenewalHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { usuario, refetch, carregando } = useSessao();
  
  const renewalStatus = searchParams.get('renewal');
  const sessionId = searchParams.get('session_id');
  const contaPagarId = searchParams.get('cp_id');

  // Lógica para renovar a assinatura
  React.useEffect(() => {
    if (renewalStatus === 'success' && sessionId && contaPagarId && usuario && !carregando) {
      
      const processedKey = `processed_renewal_session_${sessionId}`;
      if (sessionStorage.getItem(processedKey) === 'true') {
          navigate('/minha-assinatura', { replace: true });
          return;
      }
      
      const renewSubscription = async () => {
        sessionStorage.setItem(processedKey, 'true'); // Marca como processado
        
        // 1. Buscar dados necessários para o RPC
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
        
        // 2. Buscar o valor da conta a pagar (para passar ao RPC)
        const { data: cpData, error: cpError } = await supabase
            .from('contas_pagar')
            .select('valor')
            .eq('id', contaPagarId)
            .single();
            
        if (cpError || !cpData?.valor) {
            showError('Falha ao encontrar o valor da conta a pagar.');
            navigate('/minha-assinatura', { replace: true });
            return;
        }
        
        // 3. Chamar a função RPC para renovar a assinatura manualmente (simulando o webhook)
        // O plano_id usado aqui é o plano ATUALMENTE salvo no perfil do cliente (que foi atualizado no CheckoutPlano)
        const { error: rpcError } = await supabase.rpc('manual_subscription_renewal', {
            p_cliente_id: usuario.id,
            p_plano_id: clienteData.plano_id,
            p_conta_pagar_id: contaPagarId,
            p_valor_pago: cpData.valor,
            p_forma_pagamento: 'Stripe', // Forma de pagamento fixa para checkout
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
  }, [renewalStatus, sessionId, contaPagarId, usuario, carregando, navigate, refetch]);

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
            {/* Rotas Públicas/Auth */}
            <Route path="/" element={<Vendas />} />
            <Route path="/vendas" element={<Vendas />} />
            <Route path="/login" element={<Login />} />
            <Route path="/atualizar-senha" element={<AtualizarSenha />} />
            
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
            <Route path="/minha-assinatura" element={<MinhaAssinatura />} />
            <Route path="/renovacao" element={<SelecaoPagamentoRenovacao />} /> {/* NOVA ROTA */}

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SessionProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;