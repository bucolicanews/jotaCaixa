import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSessao } from '@/hooks/use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

const GlobalHandlers: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { usuario, refetch, carregando } = useSessao();

  const paymentStatus = searchParams.get('payment');
  const renewalStatus = searchParams.get('renewal');
  const sessionId = searchParams.get('session_id');
  const parcelaId = searchParams.get('cp_id');

  // --- Payment Success Handler (Adesão) ---
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
        const { data: clienteData } = await supabase
            .from('tbl_clientes')
            .select('plano_id, admin_id')
            .eq('id', usuario.id)
            .single();
            
        if (!clienteData?.plano_id) {
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
  }, [paymentStatus, sessionId, usuario, carregando, navigate, refetch]);

  // --- Payment Renewal Handler (Renovação) ---
  React.useEffect(() => {
    if (renewalStatus === 'success' && sessionId && parcelaId && usuario && !carregando) {
      
      const processedKey = `processed_renewal_session_${sessionId}`;
      if (sessionStorage.getItem(processedKey) === 'true') {
          navigate('/minha-assinatura', { replace: true });
          return;
      }
      
      const renewSubscription = async () => {
        sessionStorage.setItem(processedKey, 'true');
        
        // 1. Buscar dados da sessão do Stripe para obter o valor pago E o idContaResultado
        const proprietarioId = (usuario as any)?.admin_id || usuario?.id;
        
        const { data: sessionData, error: sessionError } = await supabase.functions.invoke('get-stripe-session', {
            body: { sessionId, proprietarioId },
        });
        
        if (sessionError || !sessionData?.metadata?.valorCobrado) {
            showError('Falha ao obter detalhes da sessão de pagamento.');
            navigate('/minha-assinatura', { replace: true });
            return;
        }
        
        const valorPago = parseFloat(sessionData.metadata.valorCobrado);
        
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
            p_conta_pagar_id: parcelaId,
            p_valor_pago: valorPago,
            p_forma_pagamento: 'Stripe',
        });

        if (rpcError) {
          showError(`Falha ao renovar assinatura: ${rpcError.message}`);
        } else {
          showSuccess('Pagamento confirmado e assinatura renovada com sucesso!');
          await refetch();
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

export default GlobalHandlers;