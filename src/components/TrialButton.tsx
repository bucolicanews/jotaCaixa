import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Zap, Share2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ClienteProfile } from '@/types/usuario';
import { addDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface TrialButtonProps {
  clienteProfile: ClienteProfile;
  onTrialActivated: () => void;
}

const TrialButton: React.FC<TrialButtonProps> = ({ clienteProfile, onTrialActivated }) => {
  const [loading, setLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const navigate = useNavigate();

  const handleStartTrial = async (days: number) => {
    setLoading(true);
    
    // 1. Buscar o Plano de Trial (assumindo que o plano mais barato é o de trial, ou o primeiro)
    const { data: planos, error: planosError } = await supabase
        .from('planos')
        .select('id, permissoes, tipo_cliente')
        .order('preco_mensal', { ascending: true })
        .limit(1);
        
    if (planosError || planos.length === 0) {
        showError('Nenhum plano de trial encontrado. Contate o administrador.');
        setLoading(false);
        return;
    }
    
    const planoTrial = planos[0];
    
    // 2. Calcular a nova data de fim de acesso
    const dataAtual = new Date();
    const dataFimAcesso = addDays(dataAtual, days).toISOString();
    
    try {
        // 3. Atualizar o perfil do cliente para iniciar o trial
        const { error: updateError } = await supabase
            .from('tbl_clientes')
            .update({
                aprovado: true, // Aprova o cliente
                plano_id: planoTrial.id,
                data_fim_acesso: dataFimAcesso,
                permissoes: planoTrial.permissoes,
                tipo_cliente: planoTrial.tipo_cliente,
            })
            .eq('id', clienteProfile.id);

        if (updateError) throw updateError;
        
        showSuccess(`Trial de ${days} dias ativado com sucesso!`);
        onTrialActivated(); // Força o refetch da sessão no LayoutPrincipal
        navigate('/painel', { replace: true });

    } catch (error: any) {
        console.error('Erro ao iniciar trial:', error);
        showError('Falha ao iniciar o trial: ' + error.message);
    } finally {
        setLoading(false);
    }
  };
  
  const handleShareBonus = async () => {
      setShareLoading(true);
      
      // Simulação de compartilhamento e atribuição de bônus
      const shareLink = `${window.location.origin}/vendas?ref=${clienteProfile.id}`;
      
      if (navigator.share) {
          try {
              await navigator.share({
                  title: 'Teste Grátis Fluxo de Caixa',
                  text: 'Cadastre-se e ganhe 20 dias de bônus!',
                  url: shareLink,
              });
              showSuccess('Link compartilhado! Você receberá o bônus após a primeira adesão.');
          } catch (error) {
              console.error('Erro ao compartilhar:', error);
              showError('Falha ao compartilhar. Copie o link manualmente.');
              navigator.clipboard.writeText(shareLink);
          }
      } else {
          // Fallback para desktop: copiar link
          navigator.clipboard.writeText(shareLink);
          showSuccess('Link de compartilhamento copiado! Envie para um amigo e ganhe 20 dias de bônus.');
      }
      
      setShareLoading(false);
  };

  return (
    <div className="space-y-4 pt-6 border-t">
      <h3 className="text-lg font-semibold">Opções de Acesso Imediato</h3>
      
      <Button 
        onClick={() => handleStartTrial(30)} // Trial padrão de 30 dias
        className="w-full bg-green-600 hover:bg-green-700"
        disabled={loading}
      >
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
        Iniciar Trial Grátis de 30 Dias
      </Button>
      
      <Button 
        onClick={handleShareBonus} 
        variant="outline" 
        className="w-full"
        disabled={shareLoading}
      >
        {shareLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
        Compartilhe e Ganhe 20 Dias Grátis
      </Button>
      
      <p className="text-xs text-muted-foreground text-center">
        O bônus de 20 dias será aplicado após a primeira adesão de um amigo usando seu link.
      </p>
    </div>
  );
};

export default TrialButton;