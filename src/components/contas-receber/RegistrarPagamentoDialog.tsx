import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '../ui/separator';
import { useSessao } from '@/hooks/use-sessao';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import { Historico } from '@/types/historico';
import { Checkbox } from '../ui/checkbox';
import { PlanoContas } from '@/types/plano-contas';
import { useContabilConfig } from '@/hooks/use-contabil-config';

interface ParcelaParaPagamento {
  id: string;
  conta_receber_id: string;
  empresa_id: string; // Este é o ID do Admin ou da Empresa Cliente
  valor_parcela: number;
  valor_pago: number;
  cliente_id: string | null; // ID do cliente real (tbl_clientes)
}

const formSchema = z.object({
  valor_recebido: z.coerce.number().positive('O valor deve ser maior que zero.'),
  data_pagamento: z.date({ required_error: 'A data é obrigatória.' }),
  forma_pagamento: z.string().min(1, 'A forma de pagamento é obrigatória.'),
  conta_id: z.string().uuid('Selecione a conta de destino.').nullable(),
  acao_saldo_restante: z.enum(['desconto', 'reprogramar', 'parcelar']).optional(),
  nova_data_vencimento: z.date().optional(),
  numero_novas_parcelas: z.coerce.number().int().min(2).optional(),
  intervalo_dias_novas_parcelas: z.coerce.number().int().min(1).optional(),
  
  // Campos de Histórico
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  salvar_como_padrao: z.boolean().optional(),
  
  // NOVO CAMPO: Conta Patrimonial (Direito a Receber)
  conta_patrimonial_id: z.string().uuid('Selecione a conta patrimonial.').nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface RegistrarPagamentoDialogProps {
  parcela: ParcelaParaPagamento | null;
  open: boolean;
  onOpenChange: (open: (open: boolean) => void) => void;
  onSaveComplete: () => void;
}

const RegistrarPagamentoDialog: React.FC<RegistrarPagamentoDialogProps> = ({ parcela, open, onOpenChange, onSaveComplete }) => {
  const { role, usuario } = useSessao();
  const { configMap } = useContabilConfig();
  const isAdmin = role === 'Admin';
  
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [loadingHistoricos, setLoadingHistoricos] = useState(true);
  const [contasPatrimoniais, setContasPatrimoniais] = useState<PlanoContas[]>([]);
  const [loadingContasPatrimoniais, setLoadingContasPatrimoniais] = useState(true);
  
  // Determina as tabelas de destino
  const tabelaRecebimentos = isAdmin ? 'admin_recebimentos' : 'recebimentos';
  const tabelaContasReceber = isAdmin ? 'admin_contas_receber' : 'contas_receber';
  const tabelaParcelas = isAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
  
  // O ID do proprietário da conta (Admin ID ou Empresa ID)
  const ownerId = isAdmin ? usuario?.id : parcela?.empresa_id;

  // Usamos o hook de saldo calculado para obter as contas de destino
  const { contas: contasDestino, carregando: loadingContas, refetch: refetchSaldos } = useSaldoContaCalculado('todos', 'todos', '', 'bancos');

  const saldoDevedor = parcela ? parcela.valor_parcela - (parcela.valor_pago || 0) : 0;

  // 1. Definição do formulário (movida para o início)
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      valor_recebido: saldoDevedor,
      data_pagamento: new Date(),
      forma_pagamento: 'Pix',
      conta_id: null,
      acao_saldo_restante: 'reprogramar',
      numero_novas_parcelas: 2,
      intervalo_dias_novas_parcelas: 30,
      historico_id: null,
      salvar_como_padrao: false,
      conta_patrimonial_id: null,
    },
  });
  
  // Desestruturando setValue para usar nas funções de callback
  const { setValue } = form;

  const fetchHistoricos = useCallback(async () => {
    if (!ownerId) return;
    setLoadingHistoricos(true);
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
    setLoadingHistoricos(false);
  }, [ownerId]);
  
  const fetchContasPatrimoniais = useCallback(async () => {
    if (!ownerId) return;
    setLoadingContasPatrimoniais(true);
    
    const ativoCode = configMap.Ativo || '1';
    const passivoCode = configMap.Passivo || '2';
    const plCode = configMap['Patrimonio Liquido'] || '3';
    
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
  }, [ownerId, configMap.Ativo, configMap.Passivo, configMap['Patrimonio Liquido']]);
  
  const fetchConfigAndDefaults = useCallback(async () => {
    if (!isAdmin || !ownerId) return;
    
    // 1. Buscar Histórico Padrão
    const { data: historicoData } = await supabase
        .from('configuracao_historico_padrao')
        .select('historico_id')
        .eq('proprietario_id', ownerId)
        .eq('tipo_registro', 'recebimento_padrao')
        .limit(1)
        .single();
        
    const defaultHistoricoId = historicoData?.historico_id || null;
    form.setValue('historico_id', defaultHistoricoId);
    
    // 2. Buscar Conta Patrimonial da Conta Sintética (Direito a Receber)
    const { data: contaSintetica } = await supabase
        .from(tabelaContasReceber)
        .select('id_conta_patrimonial')
        .eq('id', parcela!.conta_receber_id)
        .single();
        
    form.setValue('conta_patrimonial_id', contaSintetica?.id_conta_patrimonial || null);
    
  }, [isAdmin, ownerId, form, tabelaContasReceber, parcela]);

  useEffect(() => {
      if (open) {
          refetchSaldos();
          fetchHistoricos();
          fetchContasPatrimoniais();
          if (isAdmin) {
              fetchConfigAndDefaults();
          }
      }
  }, [open, refetchSaldos, fetchHistoricos, fetchContasPatrimoniais, fetchConfigAndDefaults, isAdmin]);

  useEffect(() => {
    if (open && !loadingContas && contasDestino.length > 0) {
        if (!form.getValues('conta_id')) {
            setValue('conta_id', contasDestino[0].id);
        }
    }
  }, [open, loadingContas, contasDestino, setValue, form]);


  const valorRecebido = form.watch('valor_recebido');
  const acaoSaldoRestante = form.watch('acao_saldo_restante');
  const isPagamentoParcial = valorRecebido > 0 && valorRecebido < saldoDevedor;
  const saldoRestante = saldoDevedor - valorRecebido;

  const onSubmit = async (values: FormValues) => {
    if (!parcela || !ownerId || !values.conta_id || !values.conta_patrimonial_id) {
        showError('Dados incompletos. Selecione a conta de destino e a conta patrimonial.');
        return;
    }

    const valorRecebido = values.valor_recebido;
    const valorPagoAnterior = parcela.valor_pago || 0;
    const novoValorPagoTotal = valorPagoAnterior + valorRecebido;
    const saldoRestanteCalculado = parcela.valor_parcela - novoValorPagoTotal;
    const quitouComPagamentoAtual = novoValorPagoTotal >= parcela.valor_parcela;
    
    // Contas Contábeis Mapeadas (apenas Admin)
    const contaRecebimento = isAdmin ? (await supabase.from('configuracao_contas_receber').select('conta_contabil_id').eq('proprietario_id', ownerId).eq('tipo_registro', 'recebimento').single()).data?.conta_contabil_id : null;
    const contaParcela = isAdmin ? (await supabase.from('configuracao_contas_receber').select('conta_contabil_id').eq('proprietario_id', ownerId).eq('tipo_registro', 'parcela').single()).data?.conta_contabil_id : null;
    const contaDesconto = isAdmin ? (await supabase.from('configuracao_contas_receber').select('conta_contabil_id').eq('proprietario_id', ownerId).eq('tipo_registro', 'desconto').single()).data?.conta_contabil_id : null;
    
    // 0. Buscar a descrição da Conta Sintética
    const { data: contaSintetica, error: csError } = await supabase
        .from(tabelaContasReceber)
        .select('descricao, id_conta_resultado')
        .eq('id', parcela.conta_receber_id)
        .single();
        
    if (csError) {
        showError('Erro ao buscar conta sintética para Balanço: ' + csError.message);
        return;
    }
    const descricaoContaSintetica = contaSintetica?.descricao || 'Recebimento';
    const contaReceitaResultado = contaSintetica?.id_conta_resultado; // Conta de Receita (DRE)

    // CORREÇÃO DE FUSO HORÁRIO
    const dataPagamento = values.data_pagamento;
    const dataNoonUTC = new Date(Date.UTC(dataPagamento.getFullYear(), dataPagamento.getMonth(), dataPagamento.getDate(), 12, 0, 0));
    const dataPagamentoISO = dataNoonUTC.toISOString();
    
    // Payload base para recebimentos
    let recebimentoBasePayload;
    
    if (isAdmin) {
        const clienteIdPagador = parcela.cliente_id || parcela.empresa_id;
        
        if (!clienteIdPagador) {
            showError('ID do cliente pagador não encontrado.'); 
            return;
        }
        
        recebimentoBasePayload = { 
            parcela_id: parcela.id, 
            admin_id: ownerId, 
            valor_recebido: valorRecebido, 
            cliente_id: clienteIdPagador,
            conta_id: values.conta_id,
            id_conta_contabil: contaRecebimento, // Conta de Ativo/Passivo (Recebimento)
            historico_id: values.historico_id,
            id_conta_resultado: contaReceitaResultado, // USANDO A CONTA DE RECEITA DA SINTÉTICA
        };
    } else {
        recebimentoBasePayload = { 
            parcela_id: parcela.id, 
            empresa_id: ownerId, 
            valor_recebido: valorRecebido,
            conta_id: values.conta_id,
            id_conta_resultado: contaReceitaResultado, // USANDO A CONTA DE RECEITA DA SINTÉTICA
        };
    }

    try {
      // 1. Registrar o recebimento
      const { error: recebimentoError } = await supabase.from(tabelaRecebimentos).insert({
        ...recebimentoBasePayload,
        data_recebimento: dataPagamentoISO,
        forma_pagamento: values.forma_pagamento,
        tipo_recebimento: quitouComPagamentoAtual ? 'total' : 'parcial',
      });
      
      if (recebimentoError) throw recebimentoError;
      
      // 2. Lidar com a parcela original
      if (quitouComPagamentoAtual) {
        await supabase.from(tabelaParcelas).update({
          status: 'paga',
          valor_pago: novoValorPagoTotal,
          data_pagamento: format(dataPagamento, 'yyyy-MM-dd'),
          ...(isAdmin && { id_conta_contabil: contaParcela })
        }).eq('id', parcela.id);
      } else { // Pagamento parcial
        if (values.acao_saldo_restante === 'desconto') {
          await supabase.from(tabelaParcelas).update({
            status: 'paga',
            valor_pago: novoValorPagoTotal,
            data_pagamento: format(dataPagamento, 'yyyy-MM-dd'),
            observacao: `Recebido R$ ${valorRecebido.toFixed(2)} com R$ ${saldoRestanteCalculado.toFixed(2)} de desconto.`,
            ...(isAdmin && { id_conta_contabil: contaParcela })
          }).eq('id', parcela.id);
          
          // LANÇAMENTO DE DESCONTO (DÉBITO na Despesa/Custo)
          if (contaDesconto) {
              const lancamentoDescontoPayload = {
                  proprietario_id: ownerId,
                  data_movimentacao: dataPagamentoISO,
                  descricao: `Desconto Concedido: ${descricaoContaSintetica} (CR ID: ${parcela.conta_receber_id.substring(0, 8)})`,
                  valor: saldoRestanteCalculado,
                  tipo: 'Entrada' as const, // Entrada na Despesa (Débito)
                  conta_bancaria_id: null,
                  conta_contabil_id: contaDesconto, // Conta de Desconto (Despesa)
                  origem: 'recebimento_manual',
                  historico_id: values.historico_id,
              };
              await supabase.from('lancamentos').insert(lancamentoDescontoPayload);
          }
          
        } else if (values.acao_saldo_restante === 'reprogramar' || values.acao_saldo_restante === 'parcelar') {
          await supabase.from(tabelaParcelas).update({
            status: 'paga', 
            valor_pago: novoValorPagoTotal,
            data_pagamento: format(dataPagamento, 'yyyy-MM-dd'),
            observacao: `Recebido R$ ${valorRecebido.toFixed(2)}. Saldo de R$ ${saldoRestanteCalculado.toFixed(2)} ${values.acao_saldo_restante === 'reprogramar' ? 'reprogramado' : 'parcelado'}.`,
            ...(isAdmin && { id_conta_contabil: contaParcela })
          }).eq('id', parcela.id);

          const baseParcelaPayload = isAdmin ? { admin_id: ownerId, id_conta_contabil: contaParcela } : { empresa_id: ownerId };
          
          if (values.acao_saldo_restante === 'reprogramar') {
            await supabase.from(tabelaParcelas).insert({
              conta_receber_id: parcela.conta_receber_id,
              ...baseParcelaPayload,
              numero_parcela: 99,
              valor_parcela: saldoRestanteCalculado,
              data_vencimento: format(values.nova_data_vencimento!, 'yyyy-MM-dd'),
              status: 'reprogramada'
            });
          } else { // Parcelar
            const valorNovaParcela = saldoRestanteCalculado / values.numero_novas_parcelas!;
            const novasParcelas = Array.from({ length: values.numero_novas_parcelas! }).map((_, i) => ({
              conta_receber_id: parcela.conta_receber_id,
              ...baseParcelaPayload,
              numero_parcela: 100 + i,
              valor_parcela: valorNovaParcela,
              data_vencimento: format(addDays(values.nova_data_vencimento!, i * values.intervalo_dias_novas_parcelas!), 'yyyy-MM-dd'),
              status: 'reprogramada',
            }));
            await supabase.from(tabelaParcelas).insert(novasParcelas);
          }
        } else {
            await supabase.from(tabelaParcelas).update({
                status: 'parcial',
                valor_pago: novoValorPagoTotal,
                ...(isAdmin && { id_conta_contabil: contaParcela })
            }).eq('id', parcela.id);
        }
      }
      
      // 3. Buscar a conta de saldo (Caixa/Banco) para obter o conta_contabil_id
      const contaDestinoDetalhe = contasDestino.find(c => c.id === values.conta_id);
      const contaContabilCaixaBanco = contaDestinoDetalhe?.plano_contas?.id;
      
      if (!contaContabilCaixaBanco) {
          throw new Error('Conta de destino não possui vínculo contábil.');
      }
      
      // 4. Registrar o Lançamento na conta de Saldo (Movimentação de Caixa/Banco) - DÉBITO (Ativo)
      // D: CAIXA/BANCO (AUMENTA O CAIXA)
      const lancamentoAtivoPayload = {
          proprietario_id: ownerId,
          data_movimentacao: dataPagamentoISO,
          descricao: `Recebimento Parcela ${parcela.id} - ${values.forma_pagamento}`,
          valor: valorRecebido,
          tipo: 'Entrada' as const, // Entrada no Ativo (Débito) - CORRECT
          conta_bancaria_id: values.conta_id,
          conta_contabil_id: contaContabilCaixaBanco, // <-- USANDO CONTA CONTÁBIL DO SALDO
          historico_id: values.historico_id,
          origem: 'recebimento_manual',
      };
      
      await supabase.from('lancamentos').insert(lancamentoAtivoPayload);
      
      // 5. Lançamento de Estorno da Conta Patrimonial (Direito a Receber) - CRÉDITO (Passivo)
      // C: CLIENTES (DIMINUI O DIREITO A RECEBER)
      if (values.conta_patrimonial_id) {
          const lancamentoPatrimonialPayload = {
              proprietario_id: ownerId,
              data_movimentacao: dataPagamentoISO,
              descricao: `Estorno Patrimonial CR: ${descricaoContaSintetica} (CR ID: ${parcela.conta_receber_id.substring(0, 8)})`,
              valor: valorRecebido,
              tipo: 'Saida' as const, // Saída do Ativo (Crédito) - CORRECT
              conta_bancaria_id: null,
              conta_contabil_id: values.conta_patrimonial_id, // Conta Patrimonial (1.x.x)
              historico_id: values.historico_id,
              origem: 'recebimento_manual',
          };
          await supabase.from('lancamentos').insert(lancamentoPatrimonialPayload);
      } else {
          console.warn('Aviso: Conta Patrimonial (Direito a Receber) não mapeada. Balanço pode estar incompleto.');
      }
      
      // 6. Salvar Histórico Padrão (se marcado)
      if (isAdmin && values.salvar_como_padrao && values.historico_id) {
          await supabase.from('configuracao_historico_padrao').upsert({
              proprietario_id: ownerId,
              tipo_registro: 'recebimento_padrao',
              historico_id: values.historico_id,
          }, { onConflict: 'proprietario_id, tipo_registro' });
      }


      showSuccess('Pagamento registrado com sucesso!');
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao registrar pagamento: ${error.message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar Recebimento</DialogTitle>
          <DialogDescription>Saldo devedor da parcela: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoDevedor)}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="valor_recebido" render={({ field }) => (<FormItem><FormLabel>Valor Recebido</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="data_pagamento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Data</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy") : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent></Popover><FormMessage /></FormItem>)} />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="forma_pagamento" render={({ field }) => (<FormItem><FormLabel>Forma de Pagamento</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="conta_id" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Conta/Caixa de Destino (Ativo)</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value || undefined} disabled={loadingContas}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder={loadingContas ? "Carregando Contas..." : "Selecione a conta"} />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {contasDestino.map(c => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.nome} ({c.tipo_saldo})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        {contasDestino.length === 0 && (
                            <p className="text-sm text-red-500">
                                Nenhuma conta de saldo encontrada. Crie uma em <a href="/bancos" className="underline">Bancos / Caixas</a>.
                            </p>
                        )}
                    </FormItem>
                )} />
            </div>
            
            {/* NOVO CAMPO: Conta Patrimonial (Direito a Receber) */}
            <FormField
                control={form.control}
                name="conta_patrimonial_id"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Conta Patrimonial (Direito a Receber)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingContasPatrimoniais}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder={loadingContasPatrimoniais ? "Carregando Contas..." : `Selecione a conta de Ativo (${configMap.Ativo}.x.x)`} />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value={null as any}>Nenhum (Não Mapear)</SelectItem>
                                {contasPatrimoniais.map(c => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.Conta} - {c.Descricao}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        {contasPatrimoniais.length === 0 && !loadingContasPatrimoniais && (
                            <p className="text-sm text-red-500">
                                Nenhuma conta Patrimonial (Ativo) marcada no Plano de Contas.
                            </p>
                        )}
                    </FormItem>
                )}
            />
            
            {/* Histórico */}
            {isAdmin && (
                <div className="space-y-2 pt-2 border-t">
                    <FormField
                        control={form.control}
                        name="historico_id"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Histórico do Recebimento (Opcional)</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingHistoricos}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder={loadingHistoricos ? "Carregando Históricos..." : "Selecione o histórico"} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value={null as any}>Nenhum</SelectItem>
                                        {historicos.map(h => (
                                            <SelectItem key={h.id} value={h.id}>
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
                    <FormField
                        control={form.control}
                        name="salvar_como_padrao"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                                <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        disabled={!form.watch('historico_id')}
                                    />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                    <FormLabel>
                                        Definir este Histórico como Padrão para Recebimentos
                                    </FormLabel>
                                </div>
                            </FormItem>
                        )}
                    />
                </div>
            )}
            
            {isPagamentoParcial && (
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold text-destructive">Saldo restante: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoRestante)}</h3>
                <FormField control={form.control} name="acao_saldo_restante" render={({ field }) => (
                  <FormItem><FormLabel>O que fazer com o saldo restante?</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="space-y-2"><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="desconto" /></FormControl><FormLabel className="font-normal">Conceder Desconto (Perdoar)</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="reprogramar" /></FormControl><FormLabel className="font-normal">Reprogramar Saldo</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="parcelar" /></FormControl><FormLabel className="font-normal">Parcelar Saldo</FormLabel></FormItem></RadioGroup></FormControl></FormItem>
                )} />
                {acaoSaldoRestante === 'reprogramar' && <FormField control={form.control} name="nova_data_vencimento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Nova Data de Vencimento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent></Popover><FormMessage /></FormItem>)} />}
                {acaoSaldoRestante === 'parcelar' && (
                  <div className="grid grid-cols-3 gap-4 items-end">
                    <FormField control={form.control} name="numero_novas_parcelas" render={({ field }) => (<FormItem><FormLabel>Nº Parcelas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="intervalo_dias_novas_parcelas" render={({ field }) => (<FormItem><FormLabel>Intervalo</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="nova_data_vencimento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>1º Venc.</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy") : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                  </div>
                )}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}><Loader2 className={cn("mr-2 h-4 w-4 animate-spin", !form.formState.isSubmitting && "hidden")} />Confirmar Recebimento</Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default RegistrarPagamentoDialog;