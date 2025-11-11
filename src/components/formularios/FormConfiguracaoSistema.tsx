import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { PlanoContas } from '@/types/plano-contas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';

interface FormConfiguracaoSistemaProps {
  adminId: string;
}

const FormConfiguracaoSistema: React.FC<FormConfiguracaoSistemaProps> = ({ adminId }) => {
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [planoContasPadraoId, setPlanoContasPadraoId] = useState<string | null>(null);
  const [contasNivel1, setContasNivel1] = useState<PlanoContas[]>([]);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    
    // 1. Buscar o ID do Plano de Contas Padrão
    const { data: configData } = await supabase
      .from('configuracao_sistema')
      .select('valor')
      .eq('admin_id', adminId)
      .eq('chave', 'plano_contas_padrao_id')
      .limit(1)
      .single();
      
    setPlanoContasPadraoId(configData?.valor || null);
    
    // 2. Buscar todas as contas de nível 1 (para que o Admin possa selecionar o plano)
    const { data: contasData, error: contasError } = await supabase
        .from('plano_contas')
        .select('*')
        .eq('proprietario_id', adminId)
        .eq('Analitica', 'Não')
        .like('Conta', '1') // Busca contas de nível 1 (Ativo)
        .order('Conta');
        
    if (contasError) {
        console.error('Erro ao buscar contas de nível 1:', contasError);
        setContasNivel1([]);
    } else {
        // Filtra apenas as contas de nível 1 (ex: '1', '2', '3', '4', '5')
        const nivel1 = (contasData as PlanoContas[]).filter(c => c.Conta.split('.').filter(p => p.length > 0).length === 1);
        setContasNivel1(nivel1);
    }

    setLoading(false);
  }, [adminId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    if (!planoContasPadraoId) {
      showError('Selecione uma conta de nível 1 para definir o Plano Padrão.');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
        // O valor salvo é o ID do Admin, que é o proprietário do Plano de Contas Padrão
        const dataToSave = {
            admin_id: adminId,
            chave: 'plano_contas_padrao_id',
            valor: adminId, // O valor é o ID do Admin (proprietário do plano)
        };
        
        const { error } = await supabase
            .from('configuracao_sistema')
            .upsert(dataToSave, { onConflict: 'chave' });

        if (error) throw error;
        
        showSuccess('Plano de Contas Padrão definido com sucesso!');
        fetchConfig();
    } catch (error: any) {
        showError('Falha ao salvar configuração: ' + error.message);
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const isCurrentPlanSet = planoContasPadraoId === adminId;

  return (
    <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
            Defina o Plano de Contas que será copiado para novos clientes do sistema. O plano copiado será o seu plano atual.
        </p>
        
        <Card className={cn("p-4", isCurrentPlanSet ? "border-l-4 border-green-500" : "border-l-4 border-yellow-500")}>
            <CardContent className="p-0 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="font-semibold">Status do Plano Padrão:</span>
                    {isCurrentPlanSet ? (
                        <span className="text-green-600 flex items-center"><CheckCircle2 className="w-4 h-4 mr-1" /> Definido</span>
                    ) : (
                        <span className="text-yellow-600 flex items-center"><AlertTriangle className="w-4 h-4 mr-1" /> Não Definido</span>
                    )}
                </div>
                <p className="text-sm text-muted-foreground">
                    O Plano de Contas Padrão será copiado do seu perfil (Admin) para novos clientes.
                </p>
            </CardContent>
        </Card>

        <Button 
            onClick={handleSave} 
            disabled={isSubmitting || loading || isCurrentPlanSet}
            className="w-full"
        >
            {loading || isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Definir Meu Plano Atual como Padrão'}
        </Button>
        
        {/* Exibição das contas de nível 1 (apenas para referência) */}
        <div className="pt-4 border-t">
            <h4 className="font-semibold text-sm mb-2">Contas de Nível 1 (Seu Plano Atual)</h4>
            <div className="flex flex-wrap gap-2">
                {contasNivel1.map(c => (
                    <Badge key={c.id} variant="secondary" className="text-xs">
                        {c.Conta} - {c.Descricao}
                    </Badge>
                ))}
            </div>
        </div>
    </div>
  );
};

export default FormConfiguracaoSistema;