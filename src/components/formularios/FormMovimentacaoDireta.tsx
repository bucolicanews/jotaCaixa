import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Save, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Separator } from '../ui/separator';
import { Historico } from '@/types/historico';
import { PlanoContas } from '@/types/plano-contas';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import { Label } from '@/components/ui/label';
import { DialogDescription } from '@/components/ui/dialog';
import { formatCurrency } from '@/utils/formatters';
import { format } from 'date-fns';

// Interface for the primary launch (linked to the bank account)
interface LancamentoPrimario {
    id: string;
    data_movimentacao: string;
    descricao: string;
    valor: number;
    tipo: 'Entrada' | 'Saida';
    conta_bancaria_id: string;
    historico_id: string | null;
    conta_contabil_id: string; // This is the DRE account ID (Resultado)
}
export type { LancamentoPrimario };

const formSchema = z.object({
  tipo_movimentacao: z.enum(['Entrada', 'Saida'], { required_error: 'Selecione o tipo de movimentação.' }),
  valor: z.coerce.number().positive('O valor deve ser maior que zero.'),
  conta_bancaria_id: z.string().uuid('Selecione a conta de destino/origem.'),
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  
  // Contas de Partida Dobrada (Resultado)
  conta_resultado_id: z.string().uuid('Selecione a conta de resultado (Receita/Despesa).'),
});

type FormValues = z.infer<typeof formSchema>;

interface FormMovimentacaoDiretaProps {
  onSaveComplete: () => void;
  lancamentoInicial?: LancamentoPrimario | null; // NEW PROP
}

const FormMovimentacaoDireta: React.FC<FormMovimentacaoDiretaProps> = ({ onSaveComplete, lancamentoInicial }) => {
  const { usuario, role } = useSessao();
  const { configMap } = useContabilConfig();
  
  const isEditing = !!lancamentoInicial; // Determine editing mode
  
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [contasResultado, setContasResultado] = useState<PlanoContas[]>([]);
  const [loadingContasResultado, setLoadingContasResultado] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dreLaunchId, setDreLaunchId] = useState<string | null>(null); // State for paired DRE launch ID
  
  const ownerId = usuario?.id;

  // Hook to fetch the paired DRE launch ID if editing
  useEffect(() => {
    if (isEditing && lancamentoInicial?.id && !dreLaunchId && ownerId) {
        const fetchPairedLaunch = async () => {
            // The paired launch has the same proprietario_id, same description, same absolute value, 
            // opposite type, and conta_bancaria_id is null.
            const oppositeType = lancamentoInicial.tipo === 'Entrada' ? 'Saida' : 'Entrada';
            const valorAbsoluto = Math.abs(lancamentoInicial.valor);
            
            // We search for the paired launch using the primary launch's ID as a reference, 
            // but filtering by the DRE launch characteristics.
            const { data, error } = await supabase
                .from('lancamentos')
                .select('id, valor')
                .eq('proprietario_id', ownerId)
                .eq('origem', 'movimentacao_direta')
                .eq('descricao', lancamentoInicial.descricao)
                .eq('tipo', oppositeType)
                .is('conta_bancaria_id', null)
                .neq('id', lancamentoInicial.id) // Ensure we don't select the primary launch itself
                .limit(1)
                .single();
                
            if (error || !data) {
                console.error('Could not find paired DRE launch for editing:', error);
                // This is a critical error for editing, but we proceed to allow the user to try saving.
            } else {
                setDreLaunchId(data.id);
            }
        };
        fetchPairedLaunch();
    }
  }, [isEditing, lancamentoInicial, ownerId, dreLaunchId]);


  // Busca apenas contas de Caixa/Banco (Ativo)
  const { contas: contasAtivo, carregando: loadingContas, refetch: refetchSaldos } = useSaldoContaCalculado('Debito', 'todos', '', 'bancos');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tipo_movimentacao: lancamentoInicial?.tipo || 'Entrada',
      valor: Math.abs(lancamentoInicial?.valor || 0),
      conta_bancaria_id: lancamentoInicial?.conta_bancaria_id || undefined,
      historico_id: lancamentoInicial?.historico_id || null,
      conta_resultado_id: lancamentoInicial?.conta_contabil_id || undefined,
    },
  });
  
  const tipoMovimentacao = form.watch('tipo_movimentacao');

  const fetchHistoricos = useCallback(async () => {
    if (!ownerId) return;
    const { data, error } = await supabase
        .from('historicos')
        .select('id, descricao, codigo')
        .eq('proprietario_id', ownerId)
        .order('descricao');
        
    if (error) {
        console.error('Erro ao carregar históricos:', error);
        setHistoricos([]);
    } else {
        setHistoricos(data as Historico[]);
    }
  }, [ownerId]);
  
  const fetchContasResultado = useCallback(async () => {
    if (!ownerId) return;
    setLoadingContasResultado(true);
    
    // Busca contas de Resultado (Receita e Despesa/Custo)
    const receitaCode = configMap.Receita || '4';
    const custoCode = configMap.Custo || '5';
    const despesaCode = configMap.Despesa || '6';
    
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao')
        .eq('proprietario_id', ownerId)
        .eq('Analitica', 'Sim')
        .eq('is_conta_resultado', true)
        .or(`Conta.like.${receitaCode}.%,Conta.like.${custoCode}.%,Conta.like.${despesaCode}.%`)
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar contas de resultado: ' + error.message);
        setContasResultado([]);
    } else {
        setContasResultado(data as PlanoContas[]);
    }
    setLoadingContasResultado(false);
  }, [ownerId, configMap.Receita, configMap.Custo, configMap.Despesa]);

  useEffect(() => {
      if (ownerId) {
          refetchSaldos();
          fetchHistoricos();
          fetchContasResultado();
      }
  }, [ownerId, refetchSaldos, fetchHistoricos, fetchContasResultado]);

  useEffect(() => {
    if (!form.getValues('conta_bancaria_id') && contasAtivo.length > 0) {
        form.setValue('conta_bancaria_id', contasAtivo[0].id);
    }
  }, [contasAtivo, form]);

  const onSubmit = async (values: FormValues) => {
    if (!ownerId) {
        showError('ID do proprietário não encontrado.');
        return;
    }
    
    const contaBancaria = contasAtivo.find(c => c.id === values.conta_bancaria_id);
    const contaResultado = contasResultado.find(c => c.id === values.conta_resultado_id);
    
    if (!contaBancaria || !contaResultado) {
        showError('Conta bancária ou conta de resultado não encontrada.');
        return;
    }
    
    if (!contaBancaria.plano_contas?.id) {
        showError('A conta bancária selecionada não está vinculada a um Plano de Contas (Ativo).');
        return;
    }
    
    // Only check balance if it's a withdrawal AND not editing (or if editing, check against current balance minus original value)
    if (values.tipo_movimentacao === 'Saida') {
        let saldoParaVerificar = contaBancaria.saldo_atual;
        if (isEditing && lancamentoInicial) {
            // Se estiver editando, remove o valor original da conta para verificar o novo saldo
            saldoParaVerificar += Math.abs(lancamentoInicial.valor);
        }
        
        if (values.valor > saldoParaVerificar) {
            showError('Saldo insuficiente na conta para realizar a sangria.');
            return;
        }
    }

    setIsSubmitting(true);
    
    const dataMovimentacao = format(new Date(), 'yyyy-MM-dd') + 'T12:00:00Z';
    const valor = values.valor;
    const historicoId = values.historico_id;
    
    // Contas Contábeis
    const contaAtivoCaixa = contaBancaria.plano_contas.id;
    const contaResultadoId = values.conta_resultado_id;
    
    // 1. Lançamento na Conta de Saldo (Caixa/Banco) - DÉBITO/CRÉDITO no Ativo
    const lancamentoAtivoPayload = {
        proprietario_id: ownerId,
        data_movimentacao: dataMovimentacao,
        descricao: `${values.tipo_movimentacao} Direta: ${contaResultado.Descricao}`,
        valor: valor,
        tipo: values.tipo_movimentacao, // Entrada (Débito) ou Saída (Crédito)
        conta_bancaria_id: values.conta_bancaria_id,
        conta_contabil_id: contaAtivoCaixa,
        origem: 'movimentacao_direta',
        historico_id: historicoId,
        atualizado_em: new Date().toISOString(), // Para upsert
    };
    
    // 2. Lançamento na Conta de Resultado (Partida Dobrada)
    let tipoResultado: 'Entrada' | 'Saida';
    
    if (values.tipo_movimentacao === 'Entrada') {
        // Entrada (Reforço): D: Caixa (Ativo), C: Receita -> Receita é Credora, então C = 'Saida'
        tipoResultado = 'Saida';
    } else {
        // Saída (Sangria): D: Despesa/Resultado (Credora), C: Caixa (Ativo)
        tipoResultado = 'Entrada';
    }
    
    const lancamentoResultadoPayload = {
        proprietario_id: ownerId,
        data_movimentacao: dataMovimentacao,
        descricao: `${values.tipo_movimentacao === 'Entrada' ? 'Reforço de Caixa' : 'Sangria de Caixa'}: ${contaResultado.Descricao}`,
        valor: valor,
        tipo: tipoResultado, // Tipo ajustado para a conta de Resultado
        conta_bancaria_id: null, // Não é conta bancária
        conta_contabil_id: contaResultadoId, // Conta de Resultado (Receita/Despesa)
        origem: 'movimentacao_direta',
        historico_id: historicoId,
        atualizado_em: new Date().toISOString(), // Para upsert
    };

    try {
      if (isEditing) {
          // CRÍTICO: Se estiver editando, precisamos dos IDs originais
          const launchIdAtivo = lancamentoInicial!.id;
          const launchIdResultado = dreLaunchId;
          
          if (!launchIdResultado) {
              throw new Error('Não foi possível encontrar o lançamento contábil de partida dobrada para edição.');
          }
          
          // Executa o UPSERT para ambos os lançamentos
          const [resAtivo, resResultado] = await Promise.all([
              supabase.from('lancamentos').upsert({ ...lancamentoAtivoPayload, id: launchIdAtivo }),
              supabase.from('lancamentos').upsert({ ...lancamentoResultadoPayload, id: launchIdResultado }),
          ]);
          
          if (resAtivo.error) throw resAtivo.error;
          if (resResultado.error) throw resResultado.error;
          
          showSuccess(`Movimentação atualizada com sucesso!`);
          
      } else {
          // Criação (INSERT)
          const [resAtivo, resResultado] = await Promise.all([
              supabase.from('lancamentos').insert(lancamentoAtivoPayload),
              supabase.from('lancamentos').insert(lancamentoResultadoPayload),
          ]);
          
          if (resAtivo.error) throw resAtivo.error;
          if (resResultado.error) throw resResultado.error;
          
          showSuccess(`${values.tipo_movimentacao} direta de ${formatCurrency(valor)} registrada com sucesso!`);
      }
      
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao registrar movimentação: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <DialogDescription className="sr-only">
        Formulário para registrar entradas ou saídas diretas de caixa/banco.
    </DialogDescription>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        
        <FormField control={form.control} name="tipo_movimentacao" render={({ field }) => (
          <FormItem>
            <FormLabel>1. Tipo de Movimentação</FormLabel>
            <FormControl>
              <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex space-x-4 pt-2" disabled={isEditing}>
                <div className="flex items-center space-x-2"><RadioGroupItem value="Entrada" id="entrada" /><Label htmlFor="entrada" className="flex items-center text-green-600"><ArrowUpCircle className="w-4 h-4 mr-1" /> Entrada (Reforço)</Label></div>
                <div className="flex items-center space-x-2"><RadioGroupItem value="Saida" id="saida" /><Label htmlFor="saida" className="flex items-center text-red-600"><ArrowDownCircle className="w-4 h-4 mr-1" /> Saída (Sangria)</Label></div>
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        
        <Separator />
        
        <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="valor" render={({ field }) => (
                <FormItem>
                    <FormLabel>2. Valor (R$)</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
                    <FormMessage />
                </FormItem>
            )} />
            
            <FormField control={form.control} name="conta_bancaria_id" render={({ field }) => (
                <FormItem>
                    <FormLabel>3. Conta {tipoMovimentacao === 'Entrada' ? 'Destino' : 'Origem'} (Ativo)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingContas || isEditing}>
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder={loadingContas ? "Carregando Contas..." : "Selecione a conta"} />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {contasAtivo.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                    {c.nome} ({formatCurrency(c.saldo_atual)})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />
        </div>
        
        <Separator />
        
        <FormField control={form.control} name="conta_resultado_id" render={({ field }) => (
            <FormItem>
                <FormLabel>4. Conta de Partida Dobrada (Resultado)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingContasResultado}>
                    <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder={loadingContasResultado ? "Carregando Contas..." : `Selecione a conta de ${tipoMovimentacao === 'Entrada' ? 'Receita' : 'Despesa'}`} />
                        </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                        {contasResultado
                            .filter(c => {
                                const prefix = c.Conta.split('.')[0];
                                if (tipoMovimentacao === 'Entrada') {
                                    return prefix === (configMap.Receita || '4');
                                } else {
                                    return prefix === (configMap.Custo || '5') || prefix === (configMap.Despesa || '6');
                                }
                            })
                            .map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                    {c.Conta} - {c.Descricao}
                                </SelectItem>
                            ))}
                    </SelectContent>
                </Select>
                <FormMessage />
            </FormItem>
        )} />
        
        <FormField control={form.control} name="historico_id" render={({ field }) => (
            <FormItem>
                <FormLabel>5. Histórico (Opcional)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecione o histórico" />
                        </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                        <SelectItem value={null as any}>Nenhum</SelectItem>
                        {historicos.map(h => (
                            <SelectItem key={h.id} value={h.id}>
                                {h.codigo && `[${h.codigo}] `}{h.descricao}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <FormMessage />
            </FormItem>
        )} />

        <Button type="submit" className="w-full" disabled={isSubmitting || (isEditing && !dreLaunchId)}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Salvar Alterações' : 'Registrar Movimentação'}
        </Button>
      </form>
    </Form>
    </>
  );
};

export default FormMovimentacaoDireta;