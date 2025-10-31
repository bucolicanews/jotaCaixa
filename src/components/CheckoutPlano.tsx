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
import { format } from 'date-fns';
import { useStripeConfig } from '@/hooks/use-stripe-config';
import { useSessao } from '@/hooks/use-sessao';

interface CheckoutPlanoProps {
  plano: Plano;
  isUpgrade?: boolean; // Novo prop para diferenciar fluxo de upgrade
}

const CheckoutPlano: React.FC<CheckoutPlanoProps> = ({ plano, isUpgrade = false }) => {
  const [email, setEmail] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const navigate = useNavigate();
  
  const { stripePromise, loading: loadingStripe } = useStripeConfig();
  const { usuario, carregando: carregandoSessao } = useSessao();

  const handleAdesao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUpgrade) return;
    
    if (!email || !nomeEmpresa) {
      showError('Preencha o email e o nome da empresa/pessoa.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Cadastrar o novo cliente no Supabase Auth (Simulação de Trial)
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
      // e o `usuario` no useSessao será atualizado.
      
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
        // No fluxo de upgrade, usa o usuário logado. No fluxo de adesão, usa o usuário recém-criado (que está no estado `usuario`).
        const finalClienteId = clienteId || usuario?.id;
        const finalEmail = emailCliente || usuario?.email;
        
        if (!finalClienteId || !finalEmail) {
            throw new Error('Dados do cliente não disponíveis para checkout.');
        }

        // 2. Chamar a Edge Function para criar a sessão de checkout
        const { data, error } = await supabase.functions.invoke('create-checkout-session', {
            body: {
                planoId: plano.id,
                clienteId: finalClienteId,
                email: finalEmail,
            },
        });
        
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

  if (loadingStripe || carregandoSessao) {
      return (
        <Card className="w-full max-w-md mx-auto">
            <CardHeader><CardTitle className="text-xl">Carregando Pagamento...</CardTitle></CardHeader>
            <CardContent className="flex justify-center items-center h-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent>
        </Card>
      );
  }
  
  // Fluxo 2: Cliente Logado (Upgrade)
  if (isUpgrade) {
      return (
        <Card className="w-full max-w-md mx-auto">
            <CardHeader>
                <CardTitle className="text-2xl">Atualizar para {plano.nome}</CardTitle>
                <CardDescription>Confirme a atualização do seu plano. O valor de R$ {plano.preco_mensal.toFixed(2)} será cobrado mensalmente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Button onClick={() => handleCheckout(usuario?.email, usuario?.id)} className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                    Pagar e Atualizar Plano
                </Button>
            </CardContent>
        </Card>
      );
  }

  // Fluxo 1: Público (Adesão e Trial)
  if (isRegistered) {
    const dataVencimentoTrial = format(new Date(Date.now() + plano.dias_trial * 24 * 60 * 60 * 1000), 'dd/MM/yyyy');
    
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-green-600 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 mr-2" /> Adesão Concluída!
          </CardTitle>
          <CardDescription>
            Seu trial de {plano.dias_trial} dias começa agora. Verifique seu email para definir a senha.
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
        <CardDescription>Inicie seu trial de {plano.dias_trial} dias. Preço: R$ {plano.preco_mensal.toFixed(2)}/mês.</CardDescription>
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