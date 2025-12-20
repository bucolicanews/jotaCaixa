import React, { useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Save, AlertTriangle, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import { PlanoContas } from '@/types/plano-contas';
import { Historico } from '@/types/historico';
import { SaldoContaDetalhada } from '@/types/saldo-conta';
import { formatCurrency } from '@/utils/formatters';

const formSchema = z.object({
  valor: z.coerce.number().positive('O valor deve ser maior que zero.'),
  conta_saldo_id: z.string().uuid('Selecione a conta de Caixa/Banco.'),
});

type FormValues = z.infer<typeof formSchema>;

interface FormCapitalSocialProps {
  onSaveComplete: () => void;
}

const FormCapitalSocial: React.FC<FormCapitalSocialProps> = ({ onSaveComplete }) => {
  const { usuario, refetch } = useSessao();
  const { configMap } = useContabilConfig();
  const [loadingData, setLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [contaCaixa, setContaCaixa] = useState<SaldoContaDetalhada | null>(null);
  const [contaCapital, setContaCapital] = useState<PlanoContas | null>(null);
  const [historicoCapital, setHistoricoCapital] = useState<Historico | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      valor: undefined,
      conta_saldo_id: undefined,
    },
  });

  const fetchRequiredData = useCallback(async () => {
    if (!usuario?.id) return;
    setLoadingData(true);
    
    try {
      // 1. Buscar Conta de Saldo (Caixa)
      const { data: caixaData } = await supabase
        .from('saldo_contas')
        .select(`*, plano_contas ( id, Conta, Descricao, is_caixa )`)
        .eq('proprietario_id', usuario.id)
        .eq('plano_contas.is_caixa', true)
        .limit(1)
        .single();
      
      if (caixaData) setContaCaixa(caixaData as SaldoContaDetalhada);
      
      // 2. Buscar Conta de Capital Social (Plano de Contas)
      const plCode = configMap['Patrimonio Liquido'] || '3';
      const { data: capitalData } = await supabase
        .from('plano_contas')
        .select('*')
        .eq('proprietario_id', usuario.id)
        .eq('Analitica', 'Sim')
        .eq('is_conta_patrimonial', true)
        .like('Conta', `${plCode}.%`)
        .ilike('Descricao', '%capital%')
        .limit(1)
        .single();
        
      if (capitalData) setContaCapital(capitalData as PlanoContas);
      
      // 3. Buscar Histórico Padrão de Capital Social
      const { data: historicoConfig } = await supabase
        .from('configuracao_historico_padrao')
        .select('historico_id, historicos ( id, codigo, descricao )')
        .eq('proprietario_id', usuario.id)
        .eq('tipo_registro', 'capital_social')
        .limit(1)
        .single();
        
      if (historicoConfig?.historicos) setHistoricoCapital(historicoConfig.historicos as Historico);
      
      // 4. Preencher defaultValues
      if (caixaData) {
          form.setValue('conta_saldo_id', caixaData.id);
      }

    } catch (error) {
      console.error('Erro ao buscar dados de setup:', error);
    } finally {
      setLoadingData(false);
    }
  }, [usuario?.id, configMap, form]);

  useEffect(() => {
    fetchRequiredData();
  }, [fetchRequiredData]);

  const onSubmit = async (values: FormValues) => {
    if (!usuario?.id || !contaCaixa || !contaCapital || !contaCaixa.conta_contabil_id) {
        showError('Configurações contábeis essenciais não encontradas. Recarregue a página ou contate o suporte.');
        return;
    }
    
    setIsSubmitting(true);
    
    try {
        // 1. Lançamento de Capital Social (RPC insert_manual_lancamentos)
        // D: Caixa (Ativo) - conta_caixa_id (conta_contabil_id do saldo_contas)
        // C: Capital Social (PL) - contaCapital.id
        
        const { data, error: rpcError } = await supabase.rpc('insert_manual_lancamentos', {
            p_proprietario_id: usuario.id,
            p_data_movimentacao: format(new Date(), 'yyyy-MM-dd') + 'T12:00:00Z',
            p_conta_debito_id: contaCaixa.conta_contabil_id, // DÉBITO: Conta Contábil do Caixa
            p_conta_credito_id: contaCapital.id, // CRÉDITO: Conta Contábil do Capital Social
            p_valor: values.valor,
            p_historico_id: historicoCapital?.id || null,
            p_descricao_complementar: 'Lançamento inicial de Capital Social',
            p_conta_saldo_debito_id: contaCaixa.id, // Conta de Saldo (Caixa)
        });
        
        if (rpcError) throw rpcError;
        
        const result = data?.[0];
        
        if (result && !result.success) {
            throw new Error(result.message);
        }
        
        showSuccess(`Lançamento de Capital Social de ${formatCurrency(values.valor)} registrado com sucesso!`);
        
        // 2. Força o refetch da sessão para atualizar o setupStatus
        await refetch();
        onSaveComplete();
        
    } catch (error: any) {
        showError('Falha ao registrar Capital Social: ' + error.message);
    } finally {
        setIsSubmitting(false);
    }
  };

  if (loadingData) {
    return <div className="flex justify-center items-center h-40"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  
  const isConfigValid = contaCaixa && contaCapital && contaCaixa.conta_contabil_id;
  
  return (
    <Card className="max-w-xl mx-auto border-l-4 border-primary">
        <CardHeader>
            <CardTitle className="text-2xl flex items-center text-primary">
                <DollarSign className="w-6 h-6 mr-2" /> Primeiro Lançamento (Capital Social)
            </CardTitle>
        </CardHeader>
        <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
                Este lançamento é obrigatório para iniciar o controle de saldos e liberar o uso completo do sistema.
            </p>
            
            {!isConfigValid && (
                <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-500 rounded-md mb-4">
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300 flex items-center">
                        <AlertTriangle className="w-5 h-5 mr-2" /> Configuração Incompleta
                    </p>
                    <ul className="list-disc list-inside text-xs text-red-600 dark:text-red-400 mt-1">
                        {!contaCaixa && <li>Conta de Caixa (1.1.01.0001) não encontrada ou não marcada como Caixa.</li>}
                        {!contaCapital && <li>Conta de Capital Social (3.1.00.0001) não encontrada ou não marcada como Patrimonial.</li>}
                        {contaCaixa && !contaCaixa.conta_contabil_id && <li>Conta de Saldo 'Caixa Inicial' não vinculada a uma conta contábil.</li>}
                    </ul>
                </div>
            )}
            
            {isConfigValid && (
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-2 p-3 bg-secondary rounded-md">
                            <p className="text-sm font-medium">Partida Contábil</p>
                            <p className="font-mono text-xs">
                                D: {contaCaixa?.plano_contas?.Conta} {contaCaixa?.plano_contas?.Descricao} ({contaCaixa?.nome})
                            </p>
                            <p className="font-mono text-xs">
                                C: {contaCapital?.Conta} {contaCapital?.Descricao}
                            </p>
                        </div>
                        
                        <FormField control={form.control} name="valor" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Valor Inicial (R$)</FormLabel>
                                <FormControl><Input type="number" step="0.01" placeholder="1000.00" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        
                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Save className="mr-2 h-4 w-4" /> Registrar Capital Social
                        </Button>
                    </form>
                </Form>
            )}
        </CardContent>
    </Card>
  );
};

export default FormCapitalSocial;