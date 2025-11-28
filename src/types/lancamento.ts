export interface Lancamento {
  id: string;
  proprietario_id: string;
  data_movimentacao: string;
  descricao: string;
  valor: number; // Valor absoluto (positivo)
  tipo: 'Entrada' | 'Saida'; // Débito ou Crédito (depende da natureza da conta)
  conta_bancaria_id: string | null;
  conta_contabil_id: string | null;
  conciliado: boolean;
  origem: string;
  documento: string | null;
  historico_id: string | null;
  conta_resultado_id: string | null; // ID do lançamento de partida dobrada
  is_saldo_inicial: boolean | null; // NOVO CAMPO
}
</dyad-file>

<dyad-write path="src/components/formularios/FormLancamentoManual.tsx" description="Adicionando o campo is_saldo_inicial ao formulário e lógica de submissão.">
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { PlanoContas } from '@/types/plano-contas';
import { Historico } from '@/types/historico';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ptBR } from 'date-fns/locale';
import { SaldoContaDetalhada } from '@/types/saldo-conta';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import { Checkbox } from '../ui/checkbox';

const formSchema = z.object({
  data_movimentacao: z.date({ required_error: 'A data é obrigatória.' }),
  conta_debito_id: z.string().uuid('Selecione a conta de Débito.'),
  conta_credito_id: z.string().uuid('Selecione a conta de Crédito.'),
  valor: z.coerce.number().positive('O valor deve ser maior que zero.'),
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  descricao_complementar: z.string().optional().or(z.literal('')),
  
  // NOVO CAMPO: Conta de Saldo (para Débito)
  conta_saldo_debito_id: z.string().uuid('Selecione a conta de saldo de Débito.').optional().nullable(),
  
  // NOVO CAMPO: Saldo Inicial
  is_saldo_inicial: z.boolean().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormLancamentoManualProps {
  onSaveComplete: () => void;
}

const FormLancamentoManual: React.FC<FormLancamentoManualProps> = ({ onSaveComplete }) => {
  const { usuario } = useSessao();
  const { configMap } = useContabilConfig();
  const [contasAnaliticas, setContasAnaliticas] = useState<PlanoContas[]>([]);
  const [contasSaldo, setContasSaldo] = useState<SaldoContaDetalhada[]>([]);
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const ownerId = usuario?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      data_movimentacao: new Date(),
      conta_debito_id: undefined,
      conta_credito_id: undefined,
      valor: undefined,
      historico_id: null,
      descricao_complementar: '',
      conta_saldo_debito_id: null,
      is_saldo_inicial: false, // NOVO DEFAULT
    },
  });
  
  const contaDebitoId = form.watch('conta_debito_id');
  const contaCreditoId = form.watch('conta_credito_id');
  const isSaldoInicial = form.watch('is_saldo_inicial');

  const fetchContasEHistoricos = useCallback(async () => {
    if (!ownerId) return;
    setLoadingData(true);
    
    try {
      // 1. Buscar Contas Analíticas (Plano de Contas)
      const { data: contasData, error: contasError } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica, is_conta_caixa_banco')
        .eq('proprietario_id', ownerId)
        .eq('Analitica', 'Sim')
        .order('Conta');
        
      if (contasError) throw contasError;
      setContasAnaliticas(contasData as PlanoContas[]);
      
      // 2. Buscar Contas de Saldo (Caixa/Banco/Patrimonial)
      const { data: saldosData, error: saldosError } = await supabase
        .from('saldo_contas')
        .select(`*, plano_contas ( id, Conta, Descricao, is_conta_caixa_banco )`)
        .eq('proprietario_id', ownerId)
        .order('nome');
        
      if (saldosError) throw saldosError;
      setContasSaldo(saldosData as SaldoContaDetalhada[]);
      
      // 3. Buscar Históricos
      const { data: hData, error: hError } = await supabase
        .from('historicos')
        .select('id, descricao, codigo')
        .eq('proprietario_id', ownerId)
        .order('descricao');
        
      if (hError) throw hError;
      setHistoricos(hData as Historico[]);

    } catch (error: any) {
      showError('Falha ao carregar dados: ' + error.message);
    } finally {
      setLoadingData(false);
    }
  }, [ownerId]);

  useEffect(() => {
    if (ownerId) {
      fetchContasEHistoricos();
    }
  }, [ownerId, fetchContasEHistoricos]);
  
  // NOVO: Verifica se a conta de Débito é um Caixa/Banco
  const isDebitoCaixaBanco = useMemo(() => {
      const conta = contasAnaliticas.find(c => c.id === contaDebitoId);
      const prefix = conta?.Conta.split('.')[0];
      return prefix === (configMap.Ativo || '1') && conta?.is_conta_caixa_banco;
  }, [contasAnaliticas, contaDebitoId, configMap.Ativo]);

  const onSubmit = async (values: FormValues) => {
    if (!ownerId) { showError('ID do proprietário não encontrado.'); return; }
    if (values.conta_debito_id === values.conta_credito_id) {
        showError('As contas de Débito e Crédito devem ser diferentes.');
        return;
    }
    
    const contaDebito = contasAnaliticas.find(c => c.id === values.conta_debito_id);
    
    if (!contaDebito) {
        showError('Conta de Débito selecionada não é válida.');
        return;
    }
    
    // Validação: Se for Débito em Caixa/Banco, a conta de saldo deve ser selecionada
    if (isDebitoCaixaBanco && !values.conta_saldo_debito_id) {
        showError('Selecione a Conta de Saldo (Caixa/Banco) para o lançamento de Débito.');
        return;
    }

    setIsSubmitting(true);
    
    const dataMovimentacao = format(values.data_movimentacao, 'yyyy-MM-dd') + 'T12:00:00Z';
    const valor = values.valor;
    const historicoId = values.historico_id;
    const descricaoComplementar = values.descricao_complementar;
    
    // CRÍTICO: Gera IDs e define a referência cruzada
    const idDebito = crypto.randomUUID();
    const idCredito = crypto.randomUUID();
    
    // 1. Lançamento de Débito (Entrada)
    const lancamentoDebito = {
        id: idDebito,
        proprietario_id: ownerId,
        data_movimentacao: dataMovimentacao,
        descricao: `D: ${contaDebito.Descricao} - ${descricaoComplementar}`,
        valor: valor,
        tipo: 'Entrada' as const, // Débito é sempre 'Entrada'
        // NOVO: Vincula a conta de saldo se for Caixa/Banco
        conta_bancaria_id: isDebitoCaixaBanco ? values.conta_saldo_debito_id : null, 
        conta_contabil_id: values.conta_debito_id,
        origem: 'lancamento_manual',
        historico_id: historicoId,
        conta_resultado_id: idCredito, // L1 aponta para L2
        is_saldo_inicial: values.is_saldo_inicial, // NOVO CAMPO
    };
    
    // 2. Lançamento de Crédito (Saída)
    const lancamentoCredito = {
        id: idCredito,
        proprietario_id: ownerId,
        data_movimentacao: dataMovimentacao,
        descricao: `C: ${contasAnaliticas.find(c => c.id === values.conta_credito_id)?.Descricao} - ${descricaoComplementar}`,
        valor: valor,
        tipo: 'Saida' as const, // Crédito é sempre 'Saída'
        conta_bancaria_id: null,
        conta_contabil_id: values.conta_credito_id,
        origem: 'lancamento_manual',
        historico_id: historicoId,
        conta_resultado_id: idDebito, // L2 aponta para L1
        is_saldo_inicial: values.is_saldo_inicial, // NOVO CAMPO
    };
    
    // 3. Inserir ambos os lançamentos
    try {
        const [resDebito, resCredito] = await Promise.all([
            supabase.from('lancamentos').insert(lancamentoDebito),
            supabase.from('lancamentos').insert(lancamentoCredito),
        ]);
        
        if (resDebito.error) throw resDebito.error;
        if (resCredito.error) throw resCredito.error;
        
        showSuccess(`Lançamento de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)} registrado com sucesso!`);
        
        // Resetar formulário (mantendo a data e o histórico)
        form.reset({
            data_movimentacao: values.data_movimentacao,
            conta_debito_id: undefined,
            conta_credito_id: undefined,
            valor: undefined,
            historico_id: values.historico_id, 
            descricao_complementar: '',
            conta_saldo_debito_id: null,
            is_saldo_inicial: false,
        });
        
        onSaveComplete();
        
    } catch (error: any) {
        showError('Falha ao registrar lançamento: ' + error.message);
    } finally {
        setIsSubmitting(false);
    }
  };

  if (loadingData) {
    return <div className="flex justify-center items-center h-40"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  
  const isFormValid = form.formState.isValid;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        <FormField control={form.control} name="data_movimentacao" render={({ field }) => (
            <FormItem className="flex flex-col">
                <FormLabel>Data do Lançamento</FormLabel>
                <Popover>
                    <PopoverTrigger asChild>
                        <FormControl>
                            <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                {field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Escolha a data</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                        </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} />
                    </PopoverContent>
                </Popover>
                <FormMessage />
            </FormItem>
        )} />
        
        <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="conta_debito_id" render={({ field }) => (
                <FormItem>
                    <FormLabel>Conta Contábil Débito (D)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                            <SelectTrigger className="text-red-600">
                                <SelectValue placeholder="Selecione a conta de Débito" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {contasAnaliticas.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                    {c.Conta} - {c.Descricao}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />
            
            <FormField control={form.control} name="conta_credito_id" render={({ field }) => (
                <FormItem>
                    <FormLabel>Conta Contábil Crédito (C)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                            <SelectTrigger className="text-green-600">
                                <SelectValue placeholder="Selecione a conta de Crédito" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {contasAnaliticas.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                    {c.Conta} - {c.Descricao}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />
        </div>
        
        {/* NOVO CAMPO: Seleção de Conta de Saldo (Apenas se Débito for Caixa/Banco) */}
        {isDebitoCaixaBanco && (
            <FormField control={form.control} name="conta_saldo_debito_id" render={({ field }) => (
                <FormItem>
                    <FormLabel>Conta de Saldo (Caixa/Banco) - Onde o dinheiro entrou</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                            <SelectTrigger className="border-blue-500">
                                <SelectValue placeholder="Selecione a conta de saldo" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {contasSaldo
                                .filter(c => c.conta_contabil_id === contaDebitoId)
                                .map(c => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.nome}
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    {contasSaldo.filter(c => c.conta_contabil_id === contaDebitoId).length === 0 && (
                        <p className="text-xs text-red-500">
                            Nenhuma conta de saldo vinculada à conta contábil de Débito.
                        </p>
                    )}
                </FormItem>
            )} />
        )}
        
        <FormField control={form.control} name="valor" render={({ field }) => (
            <FormItem>
                <FormLabel>Valor (R$)</FormLabel>
                <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
                <FormMessage />
            </FormItem>
        )} />
        
        <FormField control={form.control} name="historico_id" render={({ field }) => (
            <FormItem>
                <FormLabel>Histórico (Opcional)</FormLabel>
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
        
        <FormField control={form.control} name="descricao_complementar" render={({ field }) => (
            <FormItem>
                <FormLabel>Descrição Complementar</FormLabel>
                <FormControl><Input placeholder="Detalhes adicionais do lançamento" {...field} /></FormControl>
                <FormMessage />
            </FormItem>
        )} />
        
        {/* NOVO CAMPO: Saldo Inicial */}
        <FormField
            control={form.control}
            name="is_saldo_inicial"
            render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                        <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isSubmitting}
                        />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                        <FormLabel>
                            Marcar como Lançamento de Saldo Inicial
                        </FormLabel>
                        <p className="text-sm text-muted-foreground">
                            Se marcado, este lançamento será considerado no cálculo do Saldo Inicial do Fluxo de Caixa.
                        </p>
                    </div>
                </FormItem>
            )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting || !isFormValid}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" /> Registrar Lançamento
        </Button>
      </form>
    </Form>
  );
};

export default FormLancamentoManual;
</dyad-file>

<dyad-write path="src/hooks/use-saldo-conta-calculado.ts" description="Ajustando a lógica de cálculo do saldo para ignorar lançamentos de saldo inicial (Débito) no movimento.">
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { SaldoContaDetalhada } from '@/types/saldo-conta';
import { useSessao } from './use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

interface SaldoCalculado extends SaldoContaDetalhada {
  saldo_atual: number;
}

type Scope = 'bancos' | 'patrimonial';

interface SaldoContaCalculadoHook {
  contas: SaldoCalculado[];
  totalSaldo: number;
  carregando: boolean;
  refetch: () => void;
}

const useSaldoContaCalculado = (
    filtroTipoSaldo: 'todos' | 'Credito' | 'Debito' | 'Receita' | 'Despesa', 
    filtroContaContabilId: string, 
    filtroNomeDebounced: string, 
    scope: Scope = 'bancos',
    isBancoOnly: boolean = false // NOVO PARÂMETRO
): SaldoContaCalculadoHook => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [contas, setContas] = useState<SaldoCalculado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const getEmpresaId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null; // FIX: proprietario_id -> cliente_id
    return null;
  };
  
  const empresaId = getEmpresaId();

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);
  
  // Função auxiliar para buscar contas e lançamentos (sem data de corte)
  const fetchContasAndLancamentos = useCallback(async (targetEmpresaId: string) => {
      // 1. Buscar contas de saldo (filtradas ou todas)
      let contasQuery = supabase
        .from('saldo_contas')
        .select(`*, plano_contas ( id, Conta, Descricao, is_conta_caixa_banco, is_conta_patrimonial, is_caixa, is_banco )`) // ADICIONADO is_caixa e is_banco
        .eq('proprietario_id', targetEmpresaId);
        
      // Aplica Filtros de UI
      if (filtroTipoSaldo !== 'todos') {
          contasQuery = contasQuery.eq('tipo_saldo', filtroTipoSaldo);
      }
      if (filtroContaContabilId !== 'todos') {
          contasQuery = contasQuery.eq('conta_contabil_id', filtroContaContabilId);
      }
      if (filtroNomeDebounced) {
          contasQuery = contasQuery.ilike('nome', `%${filtroNomeDebounced}%`);
      }
      
      const { data: contasData, error: contasError } = await contasQuery.order('nome', { ascending: true });
      if (contasError) throw contasError;
      
      let fetchedContas = contasData as SaldoContaDetalhada[];
      const contaIds = fetchedContas.map(c => c.id);
      const contaContabilIds = fetchedContas.map(c => c.plano_contas?.id).filter((id): id is string => !!id);
      
      if (contaIds.length === 0 && contaContabilIds.length === 0) {
          return { fetchedContas: [], lancamentosData: [] };
      }

      // 2. Buscar todos os lançamentos
      
      // Cláusula OR para buscar lançamentos:
      // A) Movimentações de Caixa/Banco (conta_bancaria_id IN contaIds)
      // B) Movimentações Patrimoniais (conta_contabil_id IN contaContabilIds)
      const orClauses = [
          `conta_bancaria_id.in.(${contaIds.join(',')})`,
          `conta_contabil_id.in.(${contaContabilIds.join(',')})`,
      ];
      
      let lancamentosQuery = supabase
        .from('lancamentos')
        .select('valor, tipo, conta_contabil_id, conta_bancaria_id, origem, is_saldo_inicial') // ADD is_saldo_inicial
        .eq('proprietario_id', targetEmpresaId)
        .or(orClauses.join(','));

      const { data: lancamentosData, error: lancamentosError } = await lancamentosQuery;
      if (lancamentosError) throw lancamentosError;
      
      return { fetchedContas, lancamentosData };
  }, [filtroTipoSaldo, filtroContaContabilId, filtroNomeDebounced]);


  const buscarContas = useCallback(async () => {
    if (!empresaId || carregandoSessao) {
      setCarregando(false);
      return;
    }
    
    setCarregando(true);
    
    try {
      const { fetchedContas, lancamentosData } = await fetchContasAndLancamentos(empresaId);

      // 3. Inicializar o mapa de movimentos por SaldoConta ID
      const lancamentosPorConta = fetchedContas.reduce((acc, conta) => {
        acc[conta.id] = { entradas: 0, saidas: 0 };
        return acc;
      }, {} as Record<string, { entradas: number, saidas: number }>);
      
      // Mapeamento de Conta Contábil ID para Saldo Conta ID
      const contaContabilToSaldoIdMap = fetchedContas.reduce((acc, c) => {
          if (c.conta_contabil_id) acc[c.conta_contabil_id] = c.id;
          return acc;
      }, {} as Record<string, string>);

      lancamentosData.forEach(l => {
        // IGNORA LANÇAMENTOS ORIGINAIS ESTORNADOS
        if (l.origem === 'movimentacao_direta_estornada') return; 
        
        // CRÍTICO: IGNORA LANÇAMENTOS MARCADOS COMO SALDO INICIAL (DEBITO)
        if (l.is_saldo_inicial && l.tipo === 'Entrada') return;
        
        let targetSaldoId: string | null = null;
        
        // Prioridade 1: Movimentação de Caixa/Banco (usa conta_bancaria_id)
        if (l.conta_bancaria_id && lancamentosPorConta[l.conta_bancaria_id]) {
            targetSaldoId = l.conta_bancaria_id;
        } 
        // Prioridade 2: Movimentação Patrimonial (usa conta_contabil_id)
        else if (l.conta_contabil_id && contaContabilToSaldoIdMap[l.conta_contabil_id]) {
            targetSaldoId = contaContabilToSaldoIdMap[l.conta_contabil_id];
        }
        
        if (targetSaldoId && lancamentosPorConta[targetSaldoId]) {
            if (l.tipo === 'Entrada') {
                lancamentosPorConta[targetSaldoId].entradas += l.valor;
            } else if (l.tipo === 'Saida') {
                lancamentosPorConta[targetSaldoId].saidas += l.valor;
            }
        }
      });

      const contasCalculadas: SaldoCalculado[] = fetchedContas.map(conta => {
        const { entradas = 0, saidas = 0 } = lancamentosPorConta[conta.id] || {};
        
        // Saldo Atual = Saldo Inicial + Entradas - Saídas
        const saldo_atual = conta.saldo_inicial + entradas - saidas;
        
        return {
          ...conta,
          saldo_atual,
        };
      });
      
      // 4. Aplicar filtro de ESCOPO no frontend
      let filteredContas = contasCalculadas;
      
      if (scope === 'bancos') {
          // Filtra apenas contas marcadas como Caixa/Banco
          filteredContas = filteredContas.filter(c => c.plano_contas?.is_conta_caixa_banco);
      } else if (scope === 'patrimonial') {
          // Filtra apenas contas marcadas como Patrimonial
          filteredContas = filteredContas.filter(c => c.plano_contas?.is_conta_patrimonial);
      }
      
      // NOVO FILTRO: Apenas contas marcadas como Banco (para Conciliação)
      if (isBancoOnly) {
          filteredContas = filteredContas.filter(c => c.plano_contas?.is_banco === true);
      }
      
      // 5. Aplicar filtro de nome no frontend (se a busca por ILIKE não for suficiente)
      if (filtroNomeDebounced) {
          const termo = filtroNomeDebounced.toLowerCase();
          filteredContas = filteredContas.filter(conta => {
              const nomeMatch = conta.nome.toLowerCase().includes(termo);
              const contaContabilMatch = conta.plano_contas?.Descricao?.toLowerCase().includes(termo);
              return nomeMatch || contaContabilMatch;
          });
      }

      setContas(filteredContas);

    } catch (error: any) {
      console.error('Erro ao buscar e calcular saldos:', error);
      showError('Falha ao carregar saldos: ' + error.message);
      setContas([]);
    } finally {
      setCarregando(false);
    }
  }, [empresaId, carregandoSessao, filtroNomeDebounced, fetchContasAndLancamentos, scope, isBancoOnly]);

  useEffect(() => {
    buscarContas();
  }, [buscarContas, refreshKey]);

  const totalSaldo = contas.reduce((sum, conta) => sum + conta.saldo_atual, 0);

  return { contas, totalSaldo, carregando, refetch };
};export default useSaldoContaCalculado;