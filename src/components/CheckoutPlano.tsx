import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, CheckCircle, Copy, QrCode } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Plano } from '@/types/plano';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

interface CheckoutPlanoProps {
  plano: Plano;
}

// Simulação de dados PIX (deve ser configurável pelo Admin no futuro)
const CHAVE_PIX_PADRAO = '123.456.789-00'; 
const QR_CODE_SIMULADO_URL = 'https://public.dyad.sh/assets/qr-code-placeholder.png';

const CheckoutPlano: React.FC<CheckoutPlanoProps> = ({ plano }) => {
  const [email, setEmail] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const navigate = useNavigate();

  const handleAdesao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !nomeEmpresa) {
      showError('Preencha o email e o nome da empresa/pessoa.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Cadastrar o novo cliente no Supabase Auth
      // Usamos signUp para que o cliente receba o link de confirmação/senha
      const { data, error: authError } = await supabase.auth.signUp({
        email: email,
        password: Math.random().toString(36).substring(2, 15), // Senha temporária
        options: {
          emailRedirectTo: `${window.location.origin}/atualizar-senha`,
          data: { 
            role: 'Cliente', 
            nome: nomeEmpresa, 
            cliente_id: null, // O trigger route_new_user cuidará disso
            plano_id: plano.id, // Passa o ID do plano para o trigger
            permissoes: plano.permissoes, // Passa as permissões do plano
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
      
      // Para simular o fluxo, assumimos que o ID do usuário é o ID do cliente
      // setClienteId(data.user?.id || 'simulado'); // Removido
      setIsRegistered(true);
      showSuccess('Cadastro inicial realizado! Verifique seu email para definir a senha.');

    } catch (error: any) {
      console.error('Erro na adesão:', error);
      showError('Falha na adesão: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleCopyPix = () => {
      navigator.clipboard.writeText(CHAVE_PIX_PADRAO);
      showSuccess('Chave PIX copiada!');
  };

  if (isRegistered) {
    const dataVencimentoTrial = format(new Date(Date.now() + plano.dias_trial * 24 * 60 * 60 * 1000), 'dd/MM/yyyy');
    
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-green-600 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 mr-2" /> Adesão Concluída!
          </CardTitle>
          <CardDescription>
            Seu trial de {plano.dias_trial} dias começa agora. Você receberá um email para definir sua senha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 border rounded-md bg-yellow-50 dark:bg-yellow-900/20">
            <p className="font-semibold">Próxima Etapa: Pagamento</p>
            <p className="text-sm mt-1">
              Seu período de teste termina em <strong>{dataVencimentoTrial}</strong>. Para continuar usando o plano {plano.nome} (R$ {plano.preco_mensal.toFixed(2)}/mês), realize o pagamento via PIX.
            </p>
          </div>
          
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center"><QrCode className="w-4 h-4 mr-2" /> Pagamento PIX</h3>
            
            <div className="flex justify-center">
                <img src={QR_CODE_SIMULADO_URL} alt="QR Code Simulado" className="w-32 h-32 border p-1 rounded-md" />
            </div>
            
            <div className="space-y-2">
                <Label>Chave PIX (CNPJ/CPF)</Label>
                <div className="flex space-x-2">
                    <Input readOnly value={CHAVE_PIX_PADRAO} className="flex-1" />
                    <Button onClick={handleCopyPix} variant="secondary" size="icon">
                        <Copy className="w-4 h-4" />
                    </Button>
                </div>
            </div>
          </div>
          
          <Button onClick={() => navigate('/login')} className="w-full">
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