import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Plano } from '@/types/plano';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { addDays } from 'date-fns';
import { useStripeConfigClient } from '@/integrations/stripe/use-stripe-config-client';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile } from '@/types/usuario';
import { BASE_URL } from '@/config/app-config';
import { useAdminId } from '@/hooks/use-admin-id';

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
  // Removendo isRegistered, pois o fluxo será direto
  const navigate = useNavigate();
  
  const { usuario, perfil, role, carregando: carregandoSessao, refetch } = useSessao();
  const { adminId: primaryAdminId, loading: loadingAdminId } = useAdminId();

  // Determina o proprietário das chaves Stripe
  const proprietarioId = React.useMemo(() => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.admin_id || primaryAdminId;
    
    // Se não estiver logado (fluxo de adesão pública), usa o ID do Admin principal
    return primaryAdminId;
  }, [role, usuario, perfil, primaryAdminId]);

  const { loading: loadingStripe } = useStripeConfigClient(proprietarioId);

  const handleCheckout = async (emailCliente: string, clienteId: string) => {
    if (loadingStripe || loadingAdminId) {
        showError('Sistema de pagamento ainda não carregado.');
        return;
    }
    
    if (!proprietarioId) {
        showError('Configuração de pagamento do administrador não encontrada.');
        return;
    }
    
    setIsSubmitting(true);
    
    try {
        // **ETAPA DE UPGRADE/RENOVAÇÃO:** Atualizar o plano_id E as permissões na tbl_clientes antes do checkout
        if (isUpgrade) {
            const { error: updateError } = await supabase
                .from('tbl_clientes')
                .update({ 
                    plano_id: plano.id,
                    permissoes: plano.permissoes, // ATUALIZA AS PERMISSÕES IMEDIATAMENTE
                })
                .eq('id', clienteId);
                
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
                clienteId: clienteId,
                email: emailCliente,
                contaPagarId: contaPagarId, // Passa o ID da conta a pagar
                valorCobrado: valorParaCheckout, // Passa o valor real a ser cobrado
                proprietarioId: proprietarioId, // Passa o ID do dono das chaves
            };
        } else {
            // Fluxo de Adesão (usa a Edge Function de adesão)
            functionName = 'create-checkout-session';
            body = {
                planoId: plano.id,
                clienteId: clienteId,
                email: emailCliente,
                proprietarioId: proprietarioId, // Passa o ID do dono das chaves
            };
        }

        const { data, error } = await supabase.functions.invoke(functionName, { body });
        
        if (error) {
            // Se for um erro de invocação (rede, timeout, etc.)
            throw error;
        }
        
        // Se a Edge Function retornou um erro no corpo (status 200, mas erro lógico)
        if (data?.error) {
            throw new Error(data.error);
        }
        
        const { url } = data;
        if (!url) throw new Error('URL de checkout não recebida.');

        // 3. Redirecionar para o Stripe
        window.location.href = url;
        
    } catch (error: any) {
      console.error('Erro no checkout:', error);
      // Exibe a mensagem de erro da Edge Function, se disponível
      showError('Falha ao iniciar o checkout: ' + (error.message || 'Erro desconhecido.'));
    } finally {
      setIsSubmitting(false);
    }
  };
  
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
      
      const { data: signUpData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: Math.random().toString(36).substring(2, 15), // Senha temporária
        options: {
          emailRedirectTo: `${BASE_URL}/atualizar-senha`,
          data: { 
            role: 'Cliente',
            nome: nomeEmpresa, 
            plano_id: plano.id,
            permissoes: JSON.stringify(plano.permissoes), 
            data_fim_acesso: dataFimAcesso,
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
      
      const newUserId = signUpData.user?.id;
      const newUserEmail = signUpData.user?.email;
      
      if (!newUserId || !newUserEmail) {
          throw new Error('Falha ao obter dados do novo usuário.');
      }
      
      // 2. Se o cadastro for bem-sucedido, VAI DIRETO PARA O CHECKOUT
      showSuccess('Cadastro inicial realizado! Redirecionando para o pagamento...');
      
      // Chama o checkout com os dados do novo usuário
      await handleCheckout(newUserEmail, newUserId);

    } catch (error: any) {
      console.error('Erro na adesão:', error);
      showError('Falha na adesão: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const valorParaExibir = contaPagarId && valorCobrado !== undefined ? valorCobrado : plano.preco_mensal;

  if (loadingStripe || carregandoSessao || loadingAdminId) {
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
      
      let description;
      if (contaPagarId) {
          description = `Você está pagando o valor de R$ ${valorParaExibir.toFixed(2)} para o plano ${plano.nome}.`;
      } else {
          description = `Confirme a atualização do seu plano. O valor de R$ ${valorParaExibir.toFixed(2)} será cobrado mensalmente.`;
      }
        
      return (
        <Card className="w-full max-w-md mx-auto">
            <CardHeader>
                <CardTitle className="text-2xl">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Button onClick={() => handleCheckout(usuario?.email!, usuario?.id!)} className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                    Pagar Agora (R$ {valorParaExibir.toFixed(2)})
                </Button>
            </CardContent>
        </Card>
      );
  }

  // Fluxo 1: Público (Adesão) - Formulário de Cadastro Inicial
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl">Aderir ao Plano {plano.nome}</CardTitle>
        <CardDescription>Preencha os dados para iniciar o pagamento de R$ {plano.preco_mensal.toFixed(2)}/mês.</CardDescription>
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
            Ir para o Checkout
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default CheckoutPlano;