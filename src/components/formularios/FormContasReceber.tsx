import React, { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '../ui/separator';
import { useSessao } from '@/hooks/use-sessao';
import { UsuarioProfile, ClienteProfile } from '@/types/usuario';
import { Historico } from '@/types/historico';
import { PlanoContas } from '@/types/plano-contas';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import { ContaReceber } from '@/types/contas-receber';

const formSchema = z.object({
  cliente_id: z.string({ required_error: 'Selecione um cliente.' }).uuid('Cliente inválido.'),
  descricao: z.string().min(1, 'A descrição é obrigatória.'),
  
  tipo_lancamento: z.enum(['unico', 'repetir', 'parcelar'], { required_error: 'Selecione o tipo de lançamento.' }),
  valor: z.coerce.number().positive('O valor deve ser maior que zero.'),
  
  data_vencimento: z.date().optional(),
  numero_parcelas: z.coerce.number().int().min(1).optional(),
  data_primeiro_vencimento: z.date().optional(),
  intervalo_dias: z.coerce.number().int().min(1).optional(),
  
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  novo_historico: z.string().optional(),
  
  // CAMPOS REMOVIDOS DO FORMULÁRIO, MAS MANTIDOS NO ESQUEMA PARA VALIDAÇÃO DE DADOS INICIAIS
  conta_patrimonial_id: z.string().uuid('Selecione uma conta patrimonial válida.').nullable(),
  conta_receita_id: z.string().uuid('Selecione uma conta de receita válida.').nullable(),

}).superRefine((data, ctx) => {
  if (data.tipo_lancamento === 'unico' && !data.data_vencimento) {
    ctx.addIssue({ code: 'custom', message: 'A data de vencimento é obrigatória.', path: ['data_vencimento'] });
  }
  if (data.tipo_lancamento !== 'unico') {
    if (!data.numero_parcelas || data.numero_parcelas < 1) ctx.addIssue({ code: 'custom', message: 'Informe um número de parcelas válido.', path: ['numero_parcelas'] });
    if (!data.data_primeiro_vencimento) ctx.addIssue({ code: 'custom', message: 'A data do primeiro vencimento é obrigatória.', path: ['data_primeiro_vencimento'] });
    if (!data.intervalo_dias || data.intervalo_dias < 1) ctx.addIssue({ code: 'custom', message: 'Informe um intervalo de dias válido.', path: ['intervalo_dias'] });
  }
});

type FormValues = z.infer<typeof formSchema>;

interface FormContasReceberProps {
  contaInicial?: ContaReceber | null;
  onSaveComplete: () => void;
}

interface ClienteCRSimples {
  id: string;
  nome: string;
  documento?: string | null;
  email?: string | null;
}

const FormContasReceber: React.FC<FormContasReceberProps> = ({ contaInicial, onSaveComplete }) => {
  const { perfil, role, usuario } = useSessao();
  const { configMap: _configMap } = useContabilConfig();
  const [clientes, setClientes] = useState<ClienteCRSimples[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [mapeamentoContabil, setMapeamentoContabil] = useState<Record<string, string | null>>({});
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [contasPatrimoniais, setContasPatrimoniais] = useState<PlanoContas[]>([]);
  const [contasReceita, setContasReceita] = useState<PlanoContas[]>([]);
  const [loadingContasPatrimoniais, setLoadingContasPatrimoniais] = useState(true);
  const [loadingContasReceita, setLoadingContasReceita] = useState(true);
  const [isCreatingHistorico, setIsCreatingHistorico] = useState(false);
  const isEditing = !!contaInicial;

  const getOwnerId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId();
  const isAdmin = role === 'Admin';

  const fetchMapeamentoContabil = useCallback(async () => {
    if (!isAdmin || !ownerId) return;
    
    const { data, error } = await supabase
        .from('configuracao_contas_receber')
        .select('tipo_registro, conta_contabil_id')
        .eq('proprietario_id', ownerId);
        
    if (error) {
        console.error('Erro ao buscar mapeamento contábil:', error);
        setMapeamentoContabil({});
    } else {
        const map = (data as { tipo_registro: string, conta_contabil_id: string | null }[]).reduce((acc, item) => {
            acc[item.tipo_registro] = item.conta_contabil_id;
            return acc;
        }, {} as Record<string, string | null>);
        setMapeamentoContabil(map);
    }
  }, [isAdmin, ownerId]);
  
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
  
  const fetchContasPatrimoniais = useCallback(async () => {
    if (!ownerId) return;
    setLoadingContasPatrimoniais(true);
    
    const ativoCode = _configMap.Ativo || '1';
    const passivoCode = _configMap.Passivo || '2';
    const plCode = _configMap['Patrimonio Liquido'] || '3';
    
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao')
        .eq('proprietario_id', ownerId)
        .eq('Analitica', 'Sim')
        .eq('is_conta_patrimonial', true)
        .or(`Conta.like.${ativoCode}.%,Conta.like.${passivoCode}.%,Conta.like.${plCode}.%`)
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar contas patrimoniais: ' + error.message);
        setContasPatrimoniais([]);
    } else {
        setContasPatrimoniais(data as PlanoContas[]);
    }
    setLoadingContasPatrimoniais(false);
  }, [ownerId, _configMap.Ativo, _configMap.Passivo, _configMap['Patrimonio Liquido']]);
  
  const fetchContasReceita = useCallback(async () => {
    if (!ownerId) return;
    setLoadingContasReceita(true);
    
    const receitaCode = _configMap.Receita || '4';
    
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao')
        .eq('proprietario_id', ownerId)
        .eq('Analitica', 'Sim')
        .eq('is_conta_resultado', true)
        .like('Conta', `${receitaCode}.%`)
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar contas de receita: ' + error.message);
        setContasReceita([]);
    } else {
        setContasReceita(data as PlanoContas[]);
    }
    setLoadingContasReceita(false);
  }, [ownerId, _configMap.Receita]);

  useEffect(() => {
    const fetchClientsData = async () => {
      if (!ownerId) {
        setLoadingClientes(false);
        return;
      }
      setLoadingClientes(true);
      
      let queryClients = supabase
          .from('tbl_clientes')
          .select('id, nome, documento, email')
          .eq('aprovado', true)
          .order('nome');
          
      const { data: dataClients, error: errorClients } = await queryClients;
      
      if (errorClients) {
          showError('Erro ao carregar clientes: ' + errorClients.message);
          setClientes([]);
      } else {
          const fetchedClients = (dataClients as ClienteCRSimples[])
              .filter(c => c.id !== ownerId);
              
          setClientes(fetchedClients);
      }
      
      setLoadingClientes(false);
    };
    
    fetchClientsData();
    fetchHistoricos();
    fetchContasPatrimoniais();
    fetchContasReceita();
    if (isAdmin) {
        fetchMapeamentoContabil();
    }
  }, [perfil, role, ownerId, isAdmin, fetchMapeamentoContabil, fetchHistoricos, fetchContasPatrimoniais, fetchContasReceita]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cliente_id: contaInicial?.cliente_id || undefined,
      descricao: contaInicial?.descricao || '',
      tipo_lancamento: 'unico',
      valor: contaInicial?.valor_total || undefined,
      data_vencimento: contaInicial?.data_vencimento ? new Date(contaInicial.data_vencimento + 'T00:00:00') : undefined,
      numero_parcelas: 1,
      intervalo_dias: 30,
      historico_id: contaInicial?.historico_id || null,
      novo_historico: '',
      conta_patrimonial_id: contaInicial?.id_conta_patrimonial || null,
      // CORREÇÃO AQUI: Lendo id_conta_resultado da conta sintética
      conta_receita_id: (contaInicial as any)?.id_conta_resultado || null, 
    },
  });

  const { isSubmitting } = form.formState;
  const tipoLancamento = form.watch('tipo_lancamento');
  const novoHistoricoValue = form.watch('novo_historico');
  
  // Efeito para preencher as contas contábeis iniciais (se for edição)
  // REMOVIDO: O useEffect que buscava o valor do lancamentos, pois agora lemos de contaInicial.id_conta_resultado
  
  const handleCreateHistorico = async () => {
    if (!novoHistoricoValue || !ownerId) return;
    
    setIsCreatingHistorico(true);
    try {
        const { data, error } = await supabase
            .from('historicos')
            .insert({ proprietario_id: ownerId, descricao: novoHistoricoValue })
            .select('id, descricao, codigo')
            .single();
            
        if (error) throw error;
        
        showSuccess('Histórico criado e selecionado!');
        fetchHistoricos();
        form.setValue('historico_id', data.id);
        form.setValue('novo_historico', '');
        setIsCreatingHistorico(false);
        
    } catch (error: any) {
        showError('Falha ao criar histórico: ' + error.message);
        setIsCreatingHistorico(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    const ownerId = getOwnerId();
    if (!ownerId) { showError('ID da empresa/admin não pôde ser determinado.'); return; }
    
    const contaPatrimonial = values.conta_patrimonial_id;
    const contaReceitaResultado = isAdmin ? values.conta_receita_id : null;
    
    // A conta de parcela é lida da configuração, mas não é mais obrigatória para salvar
    const contaParcela = isAdmin ? mapeamentoContabil['parcela'] : null;
    
    if (isAdmin && !contaReceitaResultado) {
        showError('A conta contábil para Receita (Resultado DRE) é obrigatória. Selecione uma conta de Receita.');
        return;
    }
    
    try {
      // 1. Calcular valores e parcelas
      let valorTotal: number;
      let parcelasParaInserir = [];

      if (values.tipo_lancamento === 'unico') {
        valorTotal = values.valor;
        parcelasParaInserir.push({ numero_parcela: 1, valor_parcela: values.valor, data_vencimento: format(values.data_vencimento!, 'yyyy-MM-dd'), status: 'aberta' });
      } else {
        const { numero_parcelas, data_primeiro_vencimento, intervalo_dias, valor } = values;
        const valorParcela = values.tipo_lancamento === 'parcelar' ? (valor / numero_parcelas!) : valor;
        valorTotal = values.tipo_lancamento === 'parcelar' ? valor : (valor * numero_parcelas!);
        for (let i = 0; i < numero_parcelas!; i++) {
          parcelasParaInserir.push({ numero_parcela: i + 1, valor_parcela: valorParcela, data_vencimento: format(addDays(data_primeiro_vencimento!, i * intervalo_dias!), 'yyyy-MM-dd'), status: 'aberta' });
        }
      }
      
      let contaReceberId: string;
      let tabelaContasReceber = isAdmin ? 'admin_contas_receber' : 'contas_receber';
      let tabelaParcelasReceber = isAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
      
      const ownerKey = isAdmin ? 'admin_id' : 'empresa_id';
      
      const contaReceberPayload = {
          [ownerKey]: ownerId,
          cliente_id: values.cliente_id,
          descricao: values.descricao,
          valor_total: valorTotal,
          data_emissao: format(new Date(), 'yyyy-MM-dd'),
          data_vencimento: parcelasParaInserir[0].data_vencimento,
          tipo_receita: tipoLancamento === 'unico' ? 'única' : 'recorrente',
          status: 'aberta',
          origem: 'manual',
          id_conta_patrimonial: contaPatrimonial, 
          historico_id: values.historico_id,
          // NOVO CAMPO: Salva a conta de resultado na conta sintética
          ...(isAdmin && { id_conta_resultado: contaReceitaResultado }),
      };

      if (isEditing) {
        const { data, error } = await supabase.from(tabelaContasReceber).update(contaReceberPayload).eq('id', contaInicial.id).select('id').single();
        if (error) throw error;
        contaReceberId = data.id;
        
        const { error: deleteError } = await supabase.from(tabelaParcelasReceber).delete().eq('conta_receber_id', contaReceberId);
        if (deleteError) throw deleteError;
      } else {
        const { data, error } = await supabase.from(tabelaContasReceber).insert(contaReceberPayload).select('id').single();
        if (error) throw error;
        contaReceberId = data.id;
      }

      const parcelasComId = parcelasParaInserir.map(p => ({ 
          ...p, 
          conta_receber_id: contaReceberId, 
          ...(isAdmin ? { admin_id: ownerId, id_conta_contabil: contaParcela } : { empresa_id: ownerId })
      }));
      
      const { error: parcelError } = await supabase.from(tabelaParcelasReceber).insert(parcelasComId);
      if (parcelError) throw parcelError;
      
      // 4. Lançamento 1: DÉBITO (Ativo) - Aumenta o direito a receber
      const dataMovimentacao = format(new Date(), 'yyyy-MM-dd') + 'T12:00:00Z';
      const launchDescription = values.descricao;
      const contaReceberIdShort = contaReceberId.substring(0, 8);
      
      if (contaPatrimonial) {
          const lancamentoPatrimonialPayload = {
              proprietario_id: ownerId,
              data_movimentacao: dataMovimentacao,
              descricao: `Lançamento Inicial CR: ${launchDescription} (CR ID: ${contaReceberIdShort})`,
              valor: valorTotal,
              tipo: 'Entrada' as const, // Entrada no Ativo (Débito)
              conta_bancaria_id: null,
              conta_contabil_id: contaPatrimonial,
              origem: 'lancamento_cr',
              historico_id: values.historico_id,
          };
          
          // Limpeza de lançamentos antigos (se edição)
          if (isEditing) {
              const oldLaunchDescriptionPrefix = `Lançamento Inicial CR: ${contaInicial?.descricao} (CR ID: ${contaInicial?.id.substring(0, 8)})`;
              await supabase.from('lancamentos')
                  .delete()
                  .eq('origem', 'lancamento_cr')
                  .eq('proprietario_id', ownerId)
                  .ilike('descricao', `${oldLaunchDescriptionPrefix}%`);
          }
          
          await supabase.from('lancamentos').insert(lancamentoPatrimonialPayload);
      }
      
      // 5. Lançamento 2: CRÉDITO (Resultado) - Aumenta a Receita (DRE)
      if (isAdmin && contaReceitaResultado) {
          const lancamentoReceitaPayload = {
              proprietario_id: ownerId,
              data_movimentacao: dataMovimentacao,
              descricao: `Receita: ${launchDescription} (CR ID: ${contaReceberIdShort})`,
              valor: valorTotal,
              tipo: 'Saida' as const, // Saída (Crédito) na Receita
              conta_bancaria_id: null,
              conta_contabil_id: contaReceitaResultado,
              origem: 'lancamento_cr',
              historico_id: values.historico_id,
          };
          
          // Limpeza de lançamentos antigos (se edição)
          if (isEditing) {
              const oldLaunchDescriptionPrefix = `Receita: ${contaInicial?.descricao} (CR ID: ${contaInicial?.id.substring(0, 8)})`;
              await supabase.from('lancamentos')
                  .delete()
                  .eq('origem', 'lancamento_cr')
                  .eq('proprietario_id', ownerId)
                  .ilike('descricao', `${oldLaunchDescriptionPrefix}%`);
          }
          
          await supabase.from('lancamentos').insert(lancamentoReceitaPayload);
      }


      showSuccess(`Conta ${isEditing ? 'atualizada' : 'salva'} com sucesso!`);
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao salvar: ${error.message}`);
    }
  };
return (
  <Form {...form}>
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

      {/* CLIENTE */}
      <FormField control={form.control} name="cliente_id" render={({ field }) => (
        <FormItem>
          <FormLabel>1. Cliente</FormLabel>
          <Select
            onValueChange={field.onChange}
            value={field.value ? String(field.value) : undefined}
            disabled={loadingClientes || isEditing}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={loadingClientes ? "Carregando..." : "Selecione um cliente"} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {clientes.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.nome} {c.documento && <span className="text-xs text-muted-foreground">({c.documento})</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <FormMessage />

          {clientes.length === 0 && !loadingClientes && (
            <p className="text-sm text-red-500">
              Nenhum cliente cadastrado. Cadastre um em <a href="/clientes" className="underline">Clientes</a>.
            </p>
          )}
        </FormItem>
      )} />

      <Separator />


      {/* DESCRIÇÃO */}
      <FormField control={form.control} name="descricao" render={({ field }) => (
        <FormItem>
          <FormLabel>2. Descrição do Lançamento</FormLabel>
          <FormControl><Input placeholder="Ex: Venda de produto X" {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <Separator />


      {/* CONTA PATRIMONIAL */}
      <FormField
        control={form.control}
        name="conta_patrimonial_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>3. Conta Patrimonial (Ativo/Passivo/PL)</FormLabel>

            <Select
              value={field.value ? String(field.value) : "0"}
              onValueChange={(v) => field.onChange(v === "0" ? null : v)}
              disabled={loadingContasPatrimoniais}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={loadingContasPatrimoniais ? "Carregando Contas..." : "Selecione a conta patrimonial"} />
                </SelectTrigger>
              </FormControl>

              <SelectContent>
                <SelectItem value="0">Nenhum (Não Mapear)</SelectItem>

                {contasPatrimoniais.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.Conta} - {c.Descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <FormMessage />

            {contasPatrimoniais.length === 0 && !loadingContasPatrimoniais && (
              <p className="text-sm text-red-500">
                Nenhuma conta Patrimonial marcada no Plano de Contas.
              </p>
            )}
          </FormItem>
        )}
      />

      <Separator />


      {/* CONTA DE RECEITA */}
      {isAdmin && (
        <FormField
          control={form.control}
          name="conta_receita_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>4. Conta de Receita (Resultado DRE)</FormLabel>

              <Select
                value={field.value ? String(field.value) : "0"}
                onValueChange={(v) => field.onChange(v === "0" ? null : v)}
                disabled={loadingContasReceita}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingContasReceita ? "Carregando Contas..." : `Selecione a conta de Receita (${_configMap.Receita}.x.x)`} />
                  </SelectTrigger>
                </FormControl>

                <SelectContent>
                  <SelectItem value="0">Nenhum (Não Mapear)</SelectItem>

                  {contasReceita.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.Conta} - {c.Descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <FormMessage />

              {contasReceita.length === 0 && !loadingContasReceita && (
                <p className="text-sm text-red-500">
                  Nenhuma conta de Receita ({_configMap.Receita}.x.x) marcada como "Conta de Resultado".
                </p>
              )}
            </FormItem>
          )}
        />
      )}

      <Separator />


      {/* HISTÓRICO */}
      <div className="space-y-2">
        <FormLabel>5. Histórico (Opcional)</FormLabel>

        <div className="flex space-x-2">
          <FormField
            control={form.control}
            name="historico_id"
            render={({ field }) => (
              <FormItem className="flex-1">
                <Select
                  value={field.value ? String(field.value) : "0"}
                  onValueChange={(v) => field.onChange(v === "0" ? null : v)}
                  disabled={isCreatingHistorico}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um histórico pré-cadastrado" />
                    </SelectTrigger>
                  </FormControl>

                  <SelectContent>
                    <SelectItem value="0">Nenhum</SelectItem>

                    {historicos.map(h => (
                      <SelectItem key={h.id} value={String(h.id)}>
                        {h.codigo && <span className="font-mono text-xs mr-2">[{h.codigo}]</span>}
                        {h.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="button" variant="outline" size="icon" onClick={() => setIsCreatingHistorico(prev => !prev)} title="Criar Novo Histórico">
            <PlusCircle className="w-4 h-4" />
          </Button>
        </div>

        {isCreatingHistorico && (
          <div className="flex space-x-2 pt-2">
            <FormField control={form.control} name="novo_historico" render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl><Input placeholder="Novo Histórico" {...field} disabled={isSubmitting} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <Button type="button" onClick={handleCreateHistorico} disabled={isSubmitting || !form.watch('novo_historico')}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar'}
            </Button>
          </div>
        )}
      </div>

      <Separator />


      {/* DETALHES DO PAGAMENTO */}
      <div className="space-y-4">
        <FormLabel>6. Detalhes do Pagamento</FormLabel>

        <FormField control={form.control} name="tipo_lancamento" render={({ field }) => (
          <FormItem>
            <FormControl>
              <RadioGroup onValueChange={field.onChange} value={field.value} className="flex space-x-4 pt-2">
                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl><RadioGroupItem value="unico" /></FormControl>
                  <FormLabel className="font-normal">Único</FormLabel>
                </FormItem>

                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl><RadioGroupItem value="repetir" /></FormControl>
                  <FormLabel className="font-normal">Repetir Valor</FormLabel>
                </FormItem>

                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl><RadioGroupItem value="parcelar" /></FormControl>
                  <FormLabel className="font-normal">Parcelar Valor</FormLabel>
                </FormItem>
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="valor" render={({ field }) => (
          <FormItem>
            <FormLabel>{tipoLancamento === 'parcelar' ? 'Valor Total a Parcelar' : 'Valor da Parcela'}</FormLabel>
            <FormControl><Input type="number" step="0.01" placeholder="0,00" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />

        {tipoLancamento === 'unico' && (
          <FormField control={form.control} name="data_vencimento" render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Data de Vencimento</FormLabel>

              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                      {field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
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
        )}

        {tipoLancamento !== 'unico' && (
          <div className="grid grid-cols-3 gap-4">

            <FormField control={form.control} name="numero_parcelas" render={({ field }) => (
              <FormItem>
                <FormLabel>Nº de Parcelas</FormLabel>
                <FormControl><Input type="number" placeholder="3" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="intervalo_dias" render={({ field }) => (
              <FormItem>
                <FormLabel>Intervalo (dias)</FormLabel>
                <FormControl><Input type="number" placeholder="30" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="data_primeiro_vencimento" render={({ field }) => (
              <FormItem>
                <FormLabel>1º Vencimento</FormLabel>

                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button variant="outline" className={cn("w-full text-left font-normal", !field.value && "text-muted-foreground")}>
                        {field.value ? format(field.value, "dd/MM/yy") : <span>Data</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>

                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} />
                  </PopoverContent>
                </Popover>

                <FormMessage />
              </FormItem>
            )} />

          </div>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isEditing ? 'Salvar Alterações' : 'Salvar Lançamento'}
      </Button>

    </form>
  </Form>
);
};


export default FormContasReceber;