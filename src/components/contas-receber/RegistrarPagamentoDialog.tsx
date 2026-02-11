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
import { useSessao } from '@/hooks/use-sessao';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import { Historico } from '@/types/historico';
import { Checkbox } from '../ui/checkbox';
import { PlanoContas } from '@/types/plano-contas';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import FormExtratoManualCR from './FormExtratoManualCR';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '../ui/textarea';
import { saveRecebimentoAndLancamentos } from './EditarParcelaPagaDialog';

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
  taxa_bancaria: z.coerce.number().min(0, 'A taxa não pode ser negativa.').optional(),
  data_pagamento: z.date({ required_error: 'A data é obrigatória.' }),
  forma_pagamento: z.string().min(1, 'A forma de pagamento é obrigatória.'),
  codigo_transacao: z.string().optional(),
  conta_id: z.string().uuid('Selecione a conta de destino.').nullable(),
  acao_saldo_restante: z.enum(['desconto', 'reprogramar', 'parcelar', 'taxas_bancarias']).optional(),
  nova_data_vencimento: z.date().optional(),
  numero_novas_parcelas: z.coerce.number().int().min(2).optional(),
  intervalo_dias_novas_parcelas: z.coerce.number().int().min(1).optional(),
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  salvar_como_padrao: z.boolean().optional(),
  conta_patrimonial_id: z.string().uuid('Selecione a conta patrimonial válida.').nullable(),
  conta_acrescimo_id: z.string().uuid('Selecione a conta de acréscimo.').nullable().optional(),
  observacao: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface RegistrarPagamentoDialogProps {
  parcela: ParcelaParaPagamento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveComplete: () => void;
}

const RegistrarPagamentoDialog: React.FC<RegistrarPagamentoDialogProps> = ({ parcela, open, onOpenChange, onSaveComplete }) => {
  const { role, usuario, perfil } = useSessao();
  const { configMap } = useContabilConfig();

  const isDirectAdmin = role === 'Admin';
  const adminIdFromProfile = (perfil as any)?.admin_id ?? null;
  const isAdminUsuario = role === 'Usuario' && !!adminIdFromProfile;
  const isAdmin = isDirectAdmin || isAdminUsuario;
  
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [loadingHistoricos, setLoadingHistoricos] = useState(true);
  const [contasPatrimoniais, setContasPatrimoniais] = useState<PlanoContas[]>([]);
  const [loadingContasPatrimoniais, setLoadingContasPatrimoniais] = useState(true);
  const [contasReceita, setContasReceita] = useState<PlanoContas[]>([]);
  const [loadingContasReceita, setLoadingContasReceita] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [loading, setLoading] = useState(false); 
  const [extratoManualDialog, setExtratoManualDialog] = useState(false);
  const [pendingPaymentData, setPendingPaymentData] = useState<FormValues & { isPagamentoParcial: boolean, saldoRestante: number } | null>(null);
  const [showConfirmacaoCodigoDialog, setShowConfirmacaoCodigoDialog] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<FormValues | null>(null);
  
  const tabelaContasReceber = isAdmin ? 'admin_contas_receber' : 'contas_receber';
  
  const proprietarioDaSessao = isDirectAdmin ? usuario?.id : (isAdminUsuario ? adminIdFromProfile : ((perfil as any)?.cliente_id || (perfil as any)?.id));

  const { contas: contasDestino, carregando: loadingContas, refetch: refetchSaldos } = useSaldoContaCalculado('todos', 'todos', '', 'bancos');

  const saldoDevedor = parcela ? parcela.valor_parcela - (parcela.valor_pago || 0) : 0;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      valor_recebido: 0,
      taxa_bancaria: 0,
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
      observacao: '',
    },
  });
  
  const { reset, watch } = form;

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
  
  const fetchContasReceita = useCallback(async () => {
    if (!proprietarioDaSessao) return;
    setLoadingContasReceita(true);
    
    const receitaCode = configMap.Receita || '4';
    
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao')
        .eq('proprietario_id', proprietarioDaSessao)
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
  }, [proprietarioDaSessao, configMap.Receita]);
  
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
        taxa_bancaria: 0,
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
        observacao: '',
    });
    
    setIsInitialized(true);
    
  }, [parcela, proprietarioDaSessao, reset, tabelaContasReceber, contasDestino, saldoDevedor]);

  useEffect(() => {
      if (open && !isInitialized) {
          refetchSaldos();
          fetchHistoricos();
          fetchContasPatrimoniais();
          fetchContasReceita();
          
          if (parcela) {
              fetchConfigAndDefaults();
          }
      }
      
      if (!open) {
          setIsInitialized(false);
      }
  }, [open, isInitialized, refetchSaldos, fetchHistoricos, fetchContasPatrimoniais, fetchContasReceita, fetchConfigAndDefaults, parcela]);

  const valorRecebido = watch('valor_recebido');
  const taxaBancaria = watch('taxa_bancaria') || 0;
  const acaoSaldoRestante = watch('acao_saldo_restante');
  
  const valorLiquido = valorRecebido - taxaBancaria;
  const isPagamentoParcial = valorRecebido > 0 && valorRecebido < saldoDevedor;
  const saldoRestante = saldoDevedor - valorRecebido;
  const isRecebimentoMaior = valorRecebido > saldoDevedor;
  const valorAcrescimo = isRecebimentoMaior ? valorRecebido - saldoDevedor : 0;

  const saveDirectPayment = async (values: FormValues) => {
    setLoading(true);
    try {
        await saveRecebimentoAndLancamentos({
            values: { ...values, observacao: values.observacao || null },
            parcela: parcela!,
            proprietarioDaSessao: proprietarioDaSessao!,
            isAdmin,
            contasDestino,
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
    
    const codigoTransacao = values.codigo_transacao?.trim();
    if (!codigoTransacao) {
        setPendingSubmitData(values);
        setShowConfirmacaoCodigoDialog(true);
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

  const handleConfirmarSemCodigo = async () => {
    if (!pendingSubmitData) return;
    
    pendingSubmitData.codigo_transacao = 'Não Informado';
    setShowConfirmacaoCodigoDialog(false);
    
    const contaDestinoDetalhe = contasDestino.find(c => c.id === pendingSubmitData.conta_id);
    const isBankPayment = contaDestinoDetalhe?.plano_contas?.is_banco === true;
    
    if (isBankPayment) {
        setPendingPaymentData({ 
            ...pendingSubmitData, 
            isPagamentoParcial: isPagamentoParcial, 
            saldoRestante: saldoRestante 
        });
        setExtratoManualDialog(true);
        return;
    }
    
    await saveDirectPayment(pendingSubmitData);
    onOpenChange(false);
  };

  const handleCancelarSemCodigo = () => {
    setShowConfirmacaoCodigoDialog(false);
    setPendingSubmitData(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-y-auto">
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
              {/* Form fields... */}
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
                  name="taxa_bancaria"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Taxa Bancária</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          {...field}
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                          value={field.value ?? 0}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormItem>
                  <FormLabel>Valor Líquido</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      value={valorLiquido.toFixed(2)}
                      disabled
                      className="disabled:opacity-100 disabled:cursor-default"
                    />
                  </FormControl>
                </FormItem>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="forma_pagamento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Forma de Pagamento</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a forma" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                          <SelectItem value="Pix">Pix</SelectItem>
                          <SelectItem value="Cartão">Cartão</SelectItem>
                          <SelectItem value="Boleto">Boleto</SelectItem>
                          <SelectItem value="Transferência">Transferência</SelectItem>
                          <SelectItem value="Bens">Bens</SelectItem>
                        </SelectContent>
                      </Select>
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
              
              <FormField
                control={form.control}
                name="observacao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observação (Opcional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Detalhes adicionais" {...field} value={field.value ?? ''} rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                                <RadioGroupItem value="taxas_bancarias" />
                              </FormControl>
                              <FormLabel className="font-normal">
                                Taxas Bancárias (Despesa)
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

              {isRecebimentoMaior && (
                <div className="space-y-4 pt-4 border-t">
                  <h3 className="font-semibold text-green-600">
                    Acréscimo (Receita adicional):{" "}
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(valorAcrescimo)}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    O valor recebido é maior que o saldo devedor. Selecione a
                    conta de receita para registrar o acréscimo.
                  </p>

                  <FormField
                    control={form.control}
                    name="conta_acrescimo_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Conta de Receita (Acréscimo) *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || "0"}
                          disabled={loadingContasReceita}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  loadingContasReceita
                                    ? "Carregando Contas..."
                                    : "Selecione a conta de receita"
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {contasReceita.map((conta) => (
                              <SelectItem key={conta.id} value={conta.id}>
                                {conta.Conta} - {conta.Descricao}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || form.formState.isSubmitting}
              >
                {!loading && !form.formState.isSubmitting ? (
                  "Confirmar Recebimento"
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

            <div className="space-y-1 text-sm mt-2 p-3 bg-muted/50 rounded-md border">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor Bruto (Recebido)</span>
                <span>
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(pendingPaymentData.valor_recebido)}
                </span>
              </div>
              {(pendingPaymentData.taxa_bancaria || 0) > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Taxa Bancária</span>
                  <span>
                    -{" "}
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(pendingPaymentData.taxa_bancaria || 0)}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-bold border-t pt-1 mt-1">
                <span>Valor Líquido (No Banco)</span>
                <span>
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(
                    pendingPaymentData.valor_recebido -
                      (pendingPaymentData.taxa_bancaria || 0)
                  )}
                </span>
              </div>
            </div>

            <FormExtratoManualCR
              parcela={parcela}
              recebimentoDetalhes={{
                conta_id: pendingPaymentData.conta_id!,
                valor_recebido: pendingPaymentData.valor_recebido,
              }}
              formaPagamento={pendingPaymentData.forma_pagamento}
              dataPagamento={pendingPaymentData.data_pagamento}
              historicoId={pendingPaymentData.historico_id}
              contaPatrimonialId={pendingPaymentData.conta_patrimonial_id}
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

      <AlertDialog open={showConfirmacaoCodigoDialog} onOpenChange={setShowConfirmacaoCodigoDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Código de Transação Não Informado</AlertDialogTitle>
            <AlertDialogDescription>
              Você deseja prosseguir sem o código da transação? Este código é
              importante para a conciliação bancária.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-3 pt-4">
            <p className="text-sm text-muted-foreground">
              Ao continuar sem o código, o campo será preenchido
              automaticamente com "Não Informado".
            </p>
            
            <div className="flex gap-3 justify-end">
              <Button 
                variant="outline" 
                onClick={handleCancelarSemCodigo}
              >
                Não, voltar
              </Button>
              <Button 
                onClick={handleConfirmarSemCodigo}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Sim, prosseguir
              </Button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default RegistrarPagamentoDialog;