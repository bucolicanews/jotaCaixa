import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, CheckCircle, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Plano } from '@/types/plano';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { format, addDays } from 'date-fns';
import { useStripeConfig } from '@/hooks/use-stripe-config';
import { useSessao } from '@/hooks/use-sessao';

interface CheckoutPlanoProps {
  plano: Plano;
  isUpgrade?: boolean; // Novo prop para diferenciar fluxo de upgrade
  contaPagarId?: string; // ID da conta a pagar se for renovação
  valorCobrado?: number; // NOVO: Valor real a ser cobrado neste ciclo
}

const CheckoutPlano: React.FC<CheckoutPlanoProps> = ({ plano, isUpgrade = false, contaPagarId, valorCobrado }) => {
  const [email, setEmail] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const navigate = useNavigate();
  
  const { stripePromise, loading: loadingStripe } = useStripeConfig();
  const { usuario, carregando: carregandoSessao, refetch } = useSessao();

  const handleAdesao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUpgrade) return;
    
    if (!email || !nomeEmpresa) {
      showError('Preencha o email e o nome da empresa/pessoa.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Cadastrar o novo cliente no Supabase Auth (Simulação de Trial de 30 dias)
      const dataFimAcesso = addDays(new Date(), 30).toISOString();
      
      // IMPORTANTE: Definir role: 'Cliente' e plano_id para que o trigger insira diretamente em tbl_clientes.
      const { error: authError } = await supabase.auth.signUp({
        email: email,
        password: Math.random().toString(36).substring(2, 15), // Senha temporária
        options: {
          emailRedirectTo: `${window.location.origin}/atualizar-senha`,
          data: { 
            role: 'Cliente', // Define a role para que o trigger insira em tbl_clientes
            nome: nomeEmpresa, 
            plano_id: plano.id, // Indica que veio do fluxo de vendas/plano
            permissoes: JSON.stringify(plano.permissoes), 
            data_fim_acesso: dataFimAcesso, // Passa a data de fim de acesso
          }
        }
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
            showError('Este email já está cadastrado. Por favor, faça login.');
            navigate('/login');
            return;
        }
        throw authError;
      }
      
      // Se o cadastro for bem-sucedido, o usuário é automaticamente logado (sessão temporária)
      
      setIsRegistered(true);
      showSuccess('Cadastro inicial realizado! Verifique seu email para definir a senha.');

    } catch (error: any) {
      console.error('Erro na adesão:', error);
      showError('Falha na adesão: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleCheckout = async (emailCliente?: string, clienteId?: string) => {
    if (loadingStripe || !stripePromise) {
        showError('Sistema de pagamento ainda não carregado.');
        return;
    }
    
    setIsSubmitting(true);
    
    try {
        // 1. Determinar o ID do cliente e email
        const finalClienteId = clienteId || usuario?.id;
        const finalEmail = emailCliente || usuario?.email;
        
        if (!finalClienteId || !finalEmail) {
            throw new Error('Dados do cliente não disponíveis para checkout.');
        }
        
        // **ETAPA DE UPGRADE/RENOVAÇÃO:** Atualizar o plano_id E as permissões na tbl_clientes antes do checkout
        if (isUpgrade) {
            const { error: updateError } = await supabase
                .from('tbl_clientes')
                .update({ 
                    plano_id: plano.id,
                    permissoes: plano.permissoes, // ATUALIZA AS PERMISSÕES IMEDIATAMENTE
                })
                .eq('id', finalClienteId);
                
            if (updateError) throw new Error('Falha ao atualizar plano no perfil: ' + updateError.message);
            
            // Força o refetch para atualizar o perfil na sessão antes de prosseguir
            await refetch();
        }

        // 2. Chamar a Edge Function correta
        let functionName: 'create-checkout-session' | 'create-renewal-session';
        let body: any;
        
        const valorParaCheckout = contaPagarId && valorCobrado !== undefined ? valorCobrado : plano.preco_mensal;

        if (contaPagarId) {
            // Fluxo de Renovação (usa a Edge Function de renovação)
            functionName = 'create-renewal-session';
            body = {
                planoId: plano.id,
                clienteId: finalClienteId,
                email: finalEmail,
                contaPagarId: contaPagarId, // Passa o ID da conta a pagar
                valorCobrado: valorParaCheckout, // NOVO: Passa o valor real a ser cobrado
            };
        } else {
            // Fluxo de Adesão (usa a Edge Function de adesão)
            functionName = 'create-checkout-session';
            body = {
                planoId: plano.id,
                clienteId: finalClienteId,
                email: finalEmail,
            };
        }

        const { data, error } = await supabase.functions.invoke(functionName, { body });
        
        if (error) throw error;
        
        const { url } = data;
        if (!url) throw new Error('URL de checkout não recebida.');

        // 3. Redirecionar para o Stripe
        window.location.href = url;
        
    } catch (error: any) {
        console.error('Erro no checkout:', error);
        showError('Falha ao iniciar o checkout: ' + (error.message || 'Erro desconhecido.'));
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const valorParaExibir = contaPagarId && valorCobrado !== undefined ? valorCobrado : plano.preco_mensal;

  if (loadingStripe || carregandoSessao) {
      return (
        <Card className="w-full max-w-md mx-auto">
            <CardHeader><CardTitle className="text-xl">Carregando Pagamento...</CardTitle></CardHeader>
            <CardContent className="flex justify-center items-center h-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent>
        </Card>
      );
  }
  
  // Fluxo 2: Cliente Logado (Upgrade/Renovação)
  if (isUpgrade) {
      const title = contaPagarId ? `Pagar Mensalidade: ${plano.nome}` : `Atualizar para ${plano.nome}`;
      const description = contaPagarId 
        ? `Você está pagando o valor de R$ ${valorParaExibir.toFixed(2)} para o plano ${plano.nome}.`
        : `Confirme a atualização do seu plano. O valor de R$ ${valorParaExibir.toFixed(2)} será cobrado mensalmente.`;
        
      return (
        <Card className="w-full max-w-md mx-auto">
            <CardHeader>
                <CardTitle className="text-2xl">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Button onClick={() => handleCheckout(usuario?.email, usuario?.id)} className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                    Pagar Agora (R$ {valorParaExibir.toFixed(2)})
                </Button>
            </CardContent>
        </Card>
      );
  }

  // Fluxo 1: Público (Adesão e Trial)
  if (isRegistered) {
    // Assumimos 30 dias de trial no fluxo de adesão
    const dataVencimentoTrial = format(addDays(new Date(), 30), 'dd/MM/yyyy');
    
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-green-600 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 mr-2" /> Adesão Concluída!
          </CardTitle>
          <CardDescription>
            Seu trial de 30 dias começa agora. Verifique seu email para definir a senha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 border rounded-md bg-yellow-50 dark:bg-yellow-900/20">
            <p className="font-semibold">Próxima Etapa: Pagamento</p>
            <p className="text-sm mt-1">
              Seu período de teste termina em <strong>{dataVencimentoTrial}</strong>. Inicie o checkout para garantir a continuidade.
            </p>
          </div>
          
          {/* No fluxo de adesão, o usuário está logado temporariamente. Usamos o ID e email da sessão. */}
          <Button onClick={() => handleCheckout(usuario?.email, usuario?.id)} className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
            Ir para o Checkout (R$ {plano.preco_mensal.toFixed(2)})
          </Button>
          
          <Button onClick={() => navigate('/login')} variant="secondary" className="w-full">
            Ir para o Login
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Aderir ao Plano {plano.nome}</CardTitle>
        <CardDescription>Inicie seu trial de 30 dias. Preço: R$ {plano.preco_mensal.toFixed(2)}/mês.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleAdesao} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome-empresa">Nome da Empresa / Pessoa</Label>
            <Input
              id="nome-empresa"
              value={nomeEmpresa}
              onChange={(e) => setNomeEmpresa(e.target.value)}
              placeholder={plano.tipo_cliente === 'PJ' ? 'Minha Empresa LTDA' : 'João da Silva'}
              required
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email (Será seu login)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              disabled={isSubmitting}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Iniciar Trial Grátis
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default CheckoutPlano;