import React, { useEffect, useState, useCallback } from 'react';
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
import { useSessao } from '@/hooks/use-sessao';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import useSaldoContaCalculado, { SaldoCalculado } from '@/hooks/use-saldo-conta-calculado';
import { Historico } from '@/types/historico';
import { Checkbox } from '../ui/checkbox';
import { PlanoContas } from '@/types/plano-contas';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import FormExtratoManualCR from './FormExtratoManualCR';

interface ParcelaParaPagamento {
  id: string;
  conta_receber_id: string;
  empresa_id: string;
  valor_parcela: number;
  valor_pago: number;
  cliente_id: string | null;
  status?: string;
}

const formSchema = z.object({
  valor_recebido: z.coerce.number().positive('O valor deve ser maior que zero.'),
  data_pagamento: z.date({ required_error: 'A data é obrigatória.' }),
  forma_pagamento: z.string().min(1, 'A forma de pagamento é obrigatória.'),
  codigo_transacao: z.string().optional(),
  conta_id: z.string().uuid('Selecione a conta de destino.').nullable(),
  acao_saldo_restante: z.enum(['desconto', 'reprogramar', 'parcelar']).optional(),
  nova_data_vencimento: z.date().optional(),
  numero_novas_parcelas: z.coerce.number().int().min(2).optional(),
  intervalo_dias_novas_parcelas: z.coerce.number().int().min(1).optional(),
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  salvar_como_padrao: z.boolean().optional(),
  conta_patrimonial_id: z.string().uuid('Selecione a conta patrimonial válida.').nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface RegistrarPagamentoDialogProps {
  parcela: ParcelaParaPagamento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveComplete: () => void;
}

interface SavePaymentArgs {
    values: FormValues & { observacao?: string | null };
    parcela: ParcelaParaPagamento;
    proprietarioDaSessao: string;
    isAdmin: boolean;
    contasDestino: SaldoCalculado[];
    comprovanteUrl?: string | null;
}

export async function saveRecebimentoAndLancamentos({
    values,
    parcela,
    proprietarioDaSessao,
    isAdmin,
    contasDestino,
    comprovanteUrl = null,
}: SavePaymentArgs) {
    
    const tabelaRecebimentos = isAdmin ? 'admin_recebimentos' : 'recebimentos';
    const tabelaContasReceber = isAdmin ? 'admin_contas_receber' : 'contas_receber';
    const tabelaParcelas = isAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
    
    const valorRecebido = values.valor_recebido;
    const valorPagoAnterior = parcela.valor_pago || 0;
    const novoValorPagoTotal = valorPagoAnterior + valorRecebido;
    const saldoRestanteCalculado = parcela.valor_parcela - novoValorPagoTotal;
    const quitouComPagamentoAtual = novoValorPagoTotal >= parcela.valor_parcela;
    
    const { data: configCRData, error: configCRError } = await supabase
        .from('configuracao_contas_receber')
        .select('tipo_registro, conta_contabil_id')
        .eq('proprietario_id', proprietarioDaSessao);
    
    if (configCRError) console.warn('Aviso: Erro ao buscar configuração de CR:', configCRError);
    
    const configMap = (configCRData || []).reduce((acc, item) => { acc[item.tipo_registro] = item.conta_contabil_id; return acc; }, {} as Record<string, string | null>);
    
    const contaRecebimento = configMap['recebimento'];
    const contaParcela = configMap['parcela'];
    const contaDesconto = configMap['desconto_concedido'];
    
    const { data: contaSintetica, error: csError } = await supabase
        .from(tabelaContasReceber)
        .select('descricao, id_conta_resultado')
        .eq('id', parcela.conta_receber_id)
        .single();
        
    if (csError) throw csError;
    const descricaoContaSintetica = contaSintetica?.descricao || 'Recebimento';
    const contaReceitaResultado = contaSintetica?.id_conta_resultado;

    const dataPagamento = values.data_pagamento;
    const dataNoonUTC = new Date(Date.UTC(dataPagamento.getFullYear(), dataPagamento.getMonth(), dataPagamento.getDate(), 12, 0, 0));
    const dataPagamentoISO = dataNoonUTC.toISOString();
    
    const lancamentosPayload: any[] = [];
    
    let recebimentoBasePayload;
    
    const ownerKeyRecebimento = isAdmin ? 'admin_id' : 'empresa_id';

    if (isAdmin) {
        const clienteIdPagador = parcela.cliente_id || parcela.empresa_id;
        
        if (!clienteIdPagador) {
            throw new Error('ID do cliente pagador não encontrado.'); 
        }
        
        recebimentoBasePayload = { 
            parcela_id: parcela.id, 
            [ownerKeyRecebimento]: proprietarioDaSessao,
            valor_recebido: valorRecebido, 
            cliente_id: clienteIdPagador,
            conta_id: values.conta_id,
            id_conta_contabil: contaRecebimento,
            historico_id: values.historico_id,
            id_conta_resultado: contaReceitaResultado,
            anexo_url: comprovanteUrl,
            observacao: values.observacao || null,
            codigo_transacao: values.codigo_transacao || null,
        };
    } else {
        recebimentoBasePayload = { 
            parcela_id: parcela.id, 
            [ownerKeyRecebimento]: proprietarioDaSessao,
            valor_recebido: valorRecebido,
            conta_id: values.conta_id,
            id_conta_resultado: contaReceitaResultado,
            anexo_url: comprovanteUrl,
            observacao: values.observacao || null,
            codigo_transacao: values.codigo_transacao || null,
        };
    }

    const { error: recebimentoError } = await supabase.from(tabelaRecebimentos).insert({
        ...recebimentoBasePayload,
        data_recebimento: dataPagamentoISO,
        forma_pagamento: values.forma_pagamento,
        tipo_recebimento: quitouComPagamentoAtual ? 'total' : 'parcial',
    });
    
    if (recebimentoError) throw recebimentoError;
    
    if (quitouComPagamentoAtual) {
        await supabase.from(tabelaParcelas).update({
            status: 'paga',
            valor_pago: novoValorPagoTotal,
            data_pagamento: format(dataPagamento, 'yyyy-MM-dd'),
            ...(contaParcela && { id_conta_contabil: contaParcela })
        }).eq('id', parcela.id);
    } else {
        if (values.acao_saldo_restante === 'desconto') {
          await supabase.from(tabelaParcelas).update({
            status: 'paga',
            valor_pago: novoValorPagoTotal,
            data_pagamento: format(dataPagamento, 'yyyy-MM-dd'),
            observacao: `Recebido R$ ${valorRecebido.toFixed(2)} com R$ ${saldoRestanteCalculado.toFixed(2)} de desconto. ${values.observacao || ''}`,
            ...(contaParcela && { id_conta_contabil: contaParcela })
          }).eq('id', parcela.id);
          
          if (!contaDesconto) {
              throw new Error('Conta de Desconto Concedido não configurada.');
          }
          
          if (!values.conta_patrimonial_id) {
              throw new Error('Selecione a Conta Patrimonial para registrar o desconto.');
          }
          
          const idDescontoDespesa = crypto.randomUUID();
          const idDescontoPatrimonial = crypto.randomUUID();
          
          lancamentosPayload.push({
              id: idDescontoDespesa,
              proprietario_id: proprietarioDaSessao,
              data_movimentacao: dataPagamentoISO,
              descricao: `Desconto Concedido: ${descricaoContaSintetica} (CR ID: ${parcela.conta_receber_id.substring(0, 8)})`,
              valor: saldoRestanteCalculado,
              tipo: 'Entrada' as const,
              conta_bancaria_id: null,
              conta_contabil_id: contaDesconto,
              origem: 'recebimento_manual',
              historico_id: values.historico_id,
              conta_resultado_id: idDescontoPatrimonial,
          });
          
          lancamentosPayload.push({
              id: idDescontoPatrimonial,
              proprietario_id: proprietarioDaSessao,
              data_movimentacao: dataPagamentoISO,
              descricao: `Estorno Patrimonial Desconto CR: ${descricaoContaSintetica} (CR ID: ${parcela.conta_receber_id.substring(0, 8)})`,
              valor: saldoRestanteCalculado,
              tipo: 'Saida' as const,
              conta_bancaria_id: null,
              conta_contabil_id: values.conta_patrimonial_id,
              historico_id: values.historico_id,
              origem: 'recebimento_manual',
              conta_resultado_id: idDescontoDespesa,
          });
          
        } else if (values.acao_saldo_restante === 'reprogramar' || values.acao_saldo_restante === 'parcelar') {
          await supabase.from(tabelaParcelas).update({
            status: 'paga', 
            valor_pago: novoValorPagoTotal,
            data_pagamento: format(dataPagamento, 'yyyy-MM-dd'),
            observacao: `Recebido R$ ${valorRecebido.toFixed(2)}. Saldo de R$ ${saldoRestanteCalculado.toFixed(2)} ${values.acao_saldo_restante === 'reprogramar' ? 'reprogramado' : 'parcelado'}. ${values.observacao || ''}`,
            ...(contaParcela && { id_conta_contabil: contaParcela })
          }).eq('id', parcela.id);

          const baseParcelaPayload = isAdmin 
            ? { admin_id: proprietarioDaSessao, ...(contaParcela && { id_conta_contabil: contaParcela }) } 
            : { empresa_id: proprietarioDaSessao, ...(contaParcela && { id_conta_contabil: contaParcela }) };
          
          if (values.acao_saldo_restante === 'reprogramar') {
            await supabase.from(tabelaParcelas).insert({
                conta_receber_id: parcela.conta_receber_id,
                ...baseParcelaPayload,
                numero_parcela: 99,
                valor_parcela: saldoRestanteCalculado,
                data_vencimento: format(values.nova_data_vencimento!, 'yyyy-MM-dd'),
                status: 'reprogramada'
            });
          } else {
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
                ...(contaParcela && { id_conta_contabil: contaParcela })
            }).eq('id', parcela.id);
        }
    }
    
    const contaDestinoDetalhe = contasDestino.find(c => c.id === values.conta_id);
    const contaContabilCaixaBanco = contaDestinoDetalhe?.plano_contas?.id;
    
    if (!contaContabilCaixaBanco) {
        throw new Error('Conta de destino não possui vínculo contábil.');
    }
    
    const idAtivo = crypto.randomUUID();
    const idPatrimonial = crypto.randomUUID();
    
    lancamentosPayload.push({
        id: idAtivo,
        proprietario_id: proprietarioDaSessao,
        data_movimentacao: dataPagamentoISO,
        descricao: `Recebimento Parcela ${parcela.id.substring(0, 8)} - ${values.forma_pagamento}`,
        valor: valorRecebido,
        tipo: 'Entrada' as const,
        conta_bancaria_id: values.conta_id,
        conta_contabil_id: contaContabilCaixaBanco,
        historico_id: values.historico_id,
        origem: 'recebimento_manual',
        conta_resultado_id: idPatrimonial,
    });
    
    if (values.conta_patrimonial_id) {
        lancamentosPayload.push({
            id: idPatrimonial,
            proprietario_id: proprietarioDaSessao,
            data_movimentacao: dataPagamentoISO,
            descricao: `Estorno Patrimonial CR: ${descricaoContaSintetica} (CR ID: ${parcela.conta_receber_id.substring(0, 8)})`,
            valor: valorRecebido,
            tipo: 'Saida' as const,
            conta_bancaria_id: null,
            conta_contabil_id: values.conta_patrimonial_id,
            historico_id: values.historico_id,
            origem: 'recebimento_manual',
            conta_resultado_id: idAtivo,
        });
    } else {
        console.warn('Aviso: Conta Patrimonial (Direito a Receber) não mapeada. Balanço pode estar incompleto.');
    }
    
    const { error: lancamentoError } = await supabase.from('lancamentos').insert(lancamentosPayload);
    if (lancamentoError) throw lancamentoError;
    
    if (values.salvar_como_padrao && values.historico_id) {
        await supabase
            .from('configuracao_historico_padrao')
            .delete()
            .eq('proprietario_id', proprietarioDaSessao)
            .eq('tipo_registro', 'recebimento_padrao');
            
        await supabase.from('configuracao_historico_padrao').insert({
            proprietario_id: proprietarioDaSessao,
            tipo_registro: 'recebimento_padrao',
            historico_id: values.historico_id,
        });
    }
}

const RegistrarPagamentoDialog: React.FC<RegistrarPagamentoDialogProps> = ({ parcela, open, onOpenChange, onSaveComplete }) => {
  const { role, usuario, perfil } = useSessao();
  const { configMap } = useContabilConfig();

  const isDirectAdmin = role === 'Admin';
  const adminIdFromProfile = (perfil as any)?.admin_id ?? null;
  const isAdminUsuario = role === 'Usuario' && !!adminIdFromProfile;
  const isAdminOrEmployee = isDirectAdmin || isAdminUsuario;
  const isAdmin = isAdminOrEmployee;
  
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [loadingHistoricos, setLoadingHistoricos] = useState(true);
  const [contasPatrimoniais, setContasPatrimoniais] = useState<PlanoContas[]>([]);
  const [loadingContasPatrimoniais, setLoadingContasPatrimoniais] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [loading, setLoading] = useState(false); 
  const [extratoManualDialog, setExtratoManualDialog] = useState(false);
  const [pendingPaymentData, setPendingPaymentData] = useState<FormValues & { isPagamentoParcial: boolean, saldoRestante: number } | null>(null);
  
  const tabelaContasReceber = isAdmin ? 'admin_contas_receber' : 'contas_receber';
  
  const proprietarioDaSessao = isDirectAdmin ? usuario?.id : (isAdminUsuario ? adminIdFromProfile : ((perfil as any)?.cliente_id || (perfil as any)?.id));

  const { contas: contasDestino, carregando: loadingContas, refetch: refetchSaldos } = useSaldoContaCalculado('todos', 'todos', '', 'bancos');

  const saldoDevedor = parcela ? parcela.valor_parcela - (parcela.valor_pago || 0) : 0;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      valor_recebido: 0,
      data_pagamento: new Date(),
      forma_pagamento: 'Pix',
      codigo_transacao: '',
      conta_id: null,
      acao_saldo_restante: 'reprogramar',
      numero_novas_parcelas: 2,
      intervalo_dias_novas_parcelas: 30,
      historico_id: null,
      salvar_como_padrao: false,
      conta_patrimonial_id: null,
    },
  });
  
  const { reset } = form;

  const fetchHistoricos = useCallback(async () => {
    if (!proprietarioDaSessao) return;
    setLoadingHistoricos(true);
    const { data, error } = await supabase
        .from('historicos')
        .select('id, descricao, codigo')
        .eq('proprietario_id', proprietarioDaSessao)
        .order('descricao');
        
    if (error) {
        console.error('Erro ao carregar históricos:', error);
        setHistoricos([]);
    } else {
        setHistoricos(data as Historico[]);
    }
    setLoadingHistoricos(false);
  }, [proprietarioDaSessao]);
  
  const fetchContasPatrimoniais = useCallback(async () => {
    if (!proprietarioDaSessao) return;
    setLoadingContasPatrimoniais(true);
    
    const ativoCode = configMap.Ativo || '1';
    
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao')
        .eq('proprietario_id', proprietarioDaSessao)
        .eq('Analitica', 'Sim')
        .eq('is_conta_patrimonial', true)
        .eq('is_a_receber', true)
        .like('Conta', `${ativoCode}.%`)
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar contas patrimoniais: ' + error.message);
        setContasPatrimoniais([]);
    } else {
        setContasPatrimoniais(data as PlanoContas[]);
    }
    setLoadingContasPatrimoniais(false);
  }, [proprietarioDaSessao, configMap.Ativo]);
  
  const fetchConfigAndDefaults = useCallback(async () => {
    if (!parcela || !proprietarioDaSessao) return;
    
    const { data: historicoData } = await supabase
        .from('configuracao_historico_padrao')
        .select('historico_id')
        .eq('proprietario_id', proprietarioDaSessao)
        .eq('tipo_registro', 'recebimento_padrao')
        .limit(1)
        .single();
        
    const defaultHistoricoId = historicoData?.historico_id || null;
    
    const { data: contaSintetica } = await supabase
        .from(tabelaContasReceber)
        .select('id_conta_patrimonial')
        .eq('id', parcela.conta_receber_id)
        .single();
        
    const contaPatrimonialId = contaSintetica?.id_conta_patrimonial || null;
    
    reset({
        valor_recebido: saldoDevedor,
        data_pagamento: new Date(),
        forma_pagamento: 'Pix',
        codigo_transacao: '',
        conta_id: contasDestino.length > 0 ? contasDestino[0].id : null,
        acao_saldo_restante: 'reprogramar',
        numero_novas_parcelas: 2,
        intervalo_dias_novas_parcelas: 30,
        historico_id: defaultHistoricoId,
        salvar_como_padrao: false,
        conta_patrimonial_id: contaPatrimonialId,
    });
    
    setIsInitialized(true);
    
  }, [parcela, proprietarioDaSessao, reset, tabelaContasReceber, contasDestino, saldoDevedor]);

  useEffect(() => {
      if (open && !isInitialized) {
          refetchSaldos();
          fetchHistoricos();
          fetchContasPatrimoniais();
          
          if (parcela) {
              fetchConfigAndDefaults();
          }
      }
      
      if (!open) {
          setIsInitialized(false);
      }
  }, [open, isInitialized, refetchSaldos, fetchHistoricos, fetchContasPatrimoniais, fetchConfigAndDefaults, parcela]);

  const valorRecebido = form.watch('valor_recebido');
  const acaoSaldoRestante = form.watch('acao_saldo_restante');
  const isPagamentoParcial = valorRecebido > 0 && valorRecebido < saldoDevedor;
  const saldoRestante = saldoDevedor - valorRecebido;

  const saveDirectPayment = async (values: FormValues) => {
    if (!parcela || !proprietarioDaSessao || !values.conta_id || !values.conta_patrimonial_id) {
        showError('Dados incompletos. Selecione a conta de destino e a conta patrimonial.');
        return;
    }
    
    setLoading(true);

    try {
        await saveRecebimentoAndLancamentos({
            values: { ...values, observacao: null },
            parcela,
            proprietarioDaSessao,
            isAdmin,
            contasDestino,
            comprovanteUrl: null,
        });
        
        showSuccess('Pagamento registrado com sucesso!');
        onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao registrar pagamento: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!parcela || !proprietarioDaSessao) {
        showError('Dados da parcela ou administrador estão incompletos.');
        return;
    }
    
    if (values.valor_recebido <= 0) {
        showError('O valor recebido deve ser maior que zero.');
        return;
    }
    
    const contaDestinoDetalhe = contasDestino.find(c => c.id === values.conta_id);
    const isBankPayment = contaDestinoDetalhe?.plano_contas?.is_banco === true;
    
    if (isBankPayment) {
        setPendingPaymentData({ 
            ...values, 
            isPagamentoParcial: isPagamentoParcial, 
            saldoRestante: saldoRestante 
        });
        setExtratoManualDialog(true);
        return;
    }
    
    await saveDirectPayment(values);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
            <DialogDescription>
              Saldo devedor da parcela:{" "}
              {new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(saldoDevedor)}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="valor_recebido"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor Recebido</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="data_pagamento"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Data</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "dd/MM/yy", { locale: ptBR })
                              ) : (
                                <span>Data</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>

                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                            locale={ptBR}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="forma_pagamento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Forma de Pagamento</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="codigo_transacao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código da Transação</FormLabel>
                      <FormControl>
                        <Input placeholder="ID da transação externa" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

                <FormField
                  control={form.control}
                  name="conta_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Conta/Caixa de Destino (Ativo)</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || "0"}
                        disabled={loadingContas}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                loadingContas
                                  ? "Carregando Contas..."
                                  : "Selecione a conta"
                              }
                            />
                          </SelectTrigger>
                        </FormControl>

                        <SelectContent>
                          <SelectItem value="0" disabled>
                            Selecione a conta
                          </SelectItem>

                          {contasDestino.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome} ({c.tipo_saldo})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                      {contasDestino.length === 0 && !loadingContas &&(
                        <p className="text-sm text-red-500">
                          Nenhuma conta de saldo encontrada. Crie uma em{" "}
                          <a href="/bancos" className="underline">
                            Bancos / Caixas
                          </a>
                          .
                        </p>
                      )}
                    </FormItem>
                  )}
                />

              <FormField
                control={form.control}
                name="conta_patrimonial_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conta Patrimonial (Direito a Receber)</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || "0"}
                      disabled={loadingContasPatrimoniais}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              loadingContasPatrimoniais
                                ? "Carregando Contas..."
                                : `Selecione a conta de Ativo (${configMap.Ativo}.x.x)`
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0">Nenhum (Não Mapear)</SelectItem>
                        {contasPatrimoniais.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.Conta} - {c.Descricao}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    {contasPatrimoniais.length === 0 &&
                      !loadingContasPatrimoniais && (
                        <p className="text-sm text-red-500">
                          Nenhuma conta Patrimonial marcada como Contas a Receber
                          no Plano de Contas.
                        </p>
                      )}
                  </FormItem>
                )}
              />

              {isAdmin && (
                <div className="space-y-2 pt-2 border-t">
                  <FormField
                    control={form.control}
                    name="historico_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Histórico do Recebimento (Opcional)</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || "0"}
                          disabled={loadingHistoricos}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  loadingHistoricos
                                    ? "Carregando Históricos..."
                                    : "Selecione o histórico"
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="0">Nenhum</SelectItem>
                            {historicos.map((h) => (
                              <SelectItem key={h.id} value={String(h.id)}>
                                {h.codigo && (
                                  <span className="font-mono text-xs mr-2">
                                    [{h.codigo}]
                                  </span>
                                )}
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
                            disabled={!form.watch("historico_id")}
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
                  <h3 className="font-semibold text-destructive">
                    Saldo restante:{" "}
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(saldoRestante)}
                  </h3>

                  <FormField
                    control={form.control}
                    name="acao_saldo_restante"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>O que fazer com o saldo restante?</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="space-y-2"
                          >
                            <FormItem className="flex items-center space-x-2">
                              <FormControl>
                                <RadioGroupItem value="desconto" />
                              </FormControl>
                              <FormLabel className="font-normal">
                                Conceder Desconto (Perdoar)
                              </FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-2">
                              <FormControl>
                                <RadioGroupItem value="reprogramar" />
                              </FormControl>
                              <FormLabel className="font-normal">
                                Reprogramar Saldo
                              </FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-2">
                              <FormControl>
                                <RadioGroupItem value="parcelar" />
                              </FormControl>
                              <FormLabel className="font-normal">
                                Parcelar Saldo
                              </FormLabel>
                            </FormItem>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {acaoSaldoRestante === "reprogramar" && (
                    <FormField
                      control={form.control}
                      name="nova_data_vencimento"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Nova Data de Vencimento</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, "PPP", { locale: ptBR })
                                  ) : (
                                    <span>Escolha a data</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                initialFocus
                                locale={ptBR}
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {acaoSaldoRestante === "parcelar" && (
                    <div className="grid grid-cols-3 gap-4 items-end">
                      <FormField
                        control={form.control}
                        name="numero_novas_parcelas"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nº Parcelas</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="intervalo_dias_novas_parcelas"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Intervalo</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="nova_data_vencimento"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>1º Venc.</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      "w-full text-left font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
                                  >
                                    {field.value ? (
                                      format(field.value, "dd/MM/yy")
                                    ) : (
                                      <span>Data</span>
                                    )}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  initialFocus
                                  locale={ptBR}
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || form.formState.isSubmitting}
              >
                {!loading && !form.formState.isSubmitting ? (
                  'Confirmar Recebimento'
                ) : (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                  />
                )}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {extratoManualDialog && pendingPaymentData && parcela && (
        <Dialog open={extratoManualDialog} onOpenChange={setExtratoManualDialog}>
          <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Registro de Extrato Manual</DialogTitle>
              <DialogDescription>
                Confirme os detalhes do extrato para evitar duplicidade na
                conciliação.
              </DialogDescription>
            </DialogHeader>

            <FormExtratoManualCR
              parcela={parcela}
              recebimentoDetalhes={{
                conta_id: pendingPaymentData.conta_id!,
                valor_recebido: pendingPaymentData.valor_recebido,
              }}
              formaPagamento={pendingPaymentData.forma_pagamento}
              dataPagamento={pendingPaymentData.data_pagamento}
              historicoId={pendingPaymentData.historico_id}
              contaPatrimonialId={pendingPaymenta.conta_patrimonial_id}
              codigoTransacao={pendingPaymentData.codigo_transacao}
              contasDestino={contasDestino}
              isPagamentoParcial={pendingPaymentData.isPagamentoParcial}
              saldoRestante={pendingPaymentData.saldoRestante}
              onSaveComplete={onSaveComplete}
              onClose={() => setExtratoManualDialog(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default RegistrarPagamentoDialog;
