import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Loader2 } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';

/**
 * Componente responsável por lidar com o retorno de sucesso do Stripe Checkout.
 * Ele busca os metadados da sessão e chama o RPC de ativação da assinatura.
 */
const PaymentSuccessHandler: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refetch } = useSessao();
  
  const sessionId = searchParams.get('session_id');
  const isRenewal = searchParams.get('renewal') === 'success';
  const contaPagarId = searchParams.get('cp_id'); // Apenas para renovação

  useEffect(() => {
    if (!sessionId) {
      showError('Sessão de pagamento inválida.');
      navigate('/painel', { replace: true });
      return;
    }

    const handleSuccess = async () => {
      try {
        // 1. Buscar metadados da sessão Stripe (Edge Function)
        const { data: sessionData, error: sessionError } = await supabase.functions.invoke('get-stripe-session', {
          body: { sessionId },
        });

        if (sessionError) throw sessionError;
        
        const { metadata } = sessionData;
        const { clienteId, planoId, valorCobrado } = metadata;

        if (!clienteId || !planoId) {
          throw new Error('Metadados da sessão incompletos.');
        }
        
        // 2. Chamar a função de ativação/renovação no banco de dados
        let rpcError = null;
        
        if (isRenewal && contaPagarId && valorCobrado) {
            // Fluxo de Renovação Manual (Minha Assinatura)
            const { error } = await supabase.rpc('manual_subscription_renewal', {
                p_cliente_id: clienteId,
                p_plano_id: planoId,
                p_conta_pagar_id: contaPagarId,
                p_valor_pago: parseFloat(valorCobrado),
                p_forma_pagamento: 'Stripe',
            });
            rpcError = error;
            
        } else {
            // Fluxo de Adesão Inicial (Vendas)
            const { error } = await supabase.rpc('activate_subscription', {
                p_cliente_id: clienteId,
                p_plano_id: planoId,
            });
            rpcError = error;
        }

        if (rpcError) throw rpcError;

        showSuccess('Pagamento confirmado e assinatura ativada/renovada com sucesso!');
        await refetch(); // Atualiza o perfil do usuário
        navigate('/painel', { replace: true });

      } catch (error: any) {
        console.error('Erro no processamento pós-pagamento:', error);
        showError('Falha ao processar o pagamento: ' + (error.message || 'Erro desconhecido.'));
        navigate('/painel', { replace: true });
      }
    };

    handleSuccess();
  }, [sessionId, navigate, refetch, isRenewal, contaPagarId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
        <h1 className="text-xl font-bold">Processando Pagamento...</h1>
        <p className="text-muted-foreground">Não feche esta janela.</p>
      </div>
    </div>
  );
};

export default PaymentSuccessHandler;