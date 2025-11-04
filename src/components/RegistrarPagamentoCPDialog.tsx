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
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useSessao } from '@/hooks/use-sessao';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { SaldoConta } from '@/types/saldo-conta';
import { AdminParcelaPagar } from '@/types/contas-pagar';

interface ParcelaParaPagamento extends AdminParcelaPagar {
  // Adiciona campos necessários para o contexto
  fornecedor: string;
}

const formSchema = z.object({
  valor_pago: z.coerce.number().positive('O valor deve ser maior que zero.'),
  data_pagamento: z.date({ required_error: 'A data é obrigatória.' }),
  forma_pagamento: z.string().min(1, 'A forma de pagamento é obrigatória.'),
  conta_id: z.string().uuid('Selecione a conta de origem.').nullable(), // Conta de onde o dinheiro sai
  acao_saldo_restante: z.enum(['desconto_obtido', 'reprogramar', 'parcelar']).optional(),
  nova_data_vencimento: z.date().optional(),
  numero_novas_parcelas: z.coerce.number().int().min(2).optional(),
  intervalo_dias_novas_parcelas: z.coerce.number().int().min(1).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface RegistrarPagamentoCPDialogProps {
  parcela: ParcelaParaPagamento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveComplete: () => void;
}

const RegistrarPagamentoCPDialog: React.FC<RegistrarPagamentoCPDialogProps> = ({ parcela, open, onOpenChange, onSaveComplete }) => {
  const { role, usuario } = useSessao();
  const isAdmin = role === 'Admin';
  
  const [contasOrigem, setContasOrigem] = useState<SaldoConta[]>([]);
  const [loadingContas, setLoadingContas] = useState(true);
  const [mapeamentoContabil, setMapeamentoContabil] = useState<Record<string, string | null>>({});
  
  // Determina as tabelas de destino
  const tabelaPagamentos = 'admin_pagamentos';
  const tabelaParcelas = 'admin_parcelas_pagar';
  
  const adminId = usuario?.id;

  const saldoDevedor = parcela ? parcela.valor_parcela - (parcela.valor_pago || 0) : 0;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      valor_pago: saldoDevedor,
      data_pagamento: new Date(),
      forma_pagamento: 'Pix',
      conta_id: null,
      acao_saldo_restante: 'reprogramar',
      numero_novas_parcelas: 2,
      intervalo_dias_novas_parcelas: 30,
    },
  });
  
  const { setValue } = form;

  const fetchContasOrigem = useCallback(async () => {
    if (!adminId) return;
    setLoadingContas(true);
    
    // Busca contas de saldo do Admin
    const { data, error } = await supabase
        .from('saldo_contas')
        .select(`
            *,
            plano_contas ( is_conta_saldo )
        `)
        .eq('empresa_id', adminId)
        .order('nome');
        
    if (error) {
        showError('Erro ao carregar Contas/Caixas: ' + error.message);
        setContasOrigem([]);
    } else {
        const filteredData = (data as any[])
            .filter(c => c.plano_contas?.is_conta_saldo === true)
            .map(c => ({ ...c, plano_contas: undefined })) as SaldoConta[];
            
        setContasOrigem(filteredData);
        
        if (filteredData.length > 0) {
            setValue('conta_id', filteredData[0].id);
        } else {
            setValue('conta_id', null);
        }
    }
    setLoadingContas(false);
  }, [adminId, setValue]);
  
  const fetchMapeamentoContabil = useCallback(async () => {
    if (!isAdmin || !adminId) return;
    
    const { data, error } = await supabase
        .from('configuracao_contas_pagar')
        .select('tipo_registro, conta_contabil_id')
        .eq('proprietario_id', adminId);
        
    if (error) {
        console.error('Erro ao buscar mapeamento contábil CP:', error);
        setMapeamentoContabil({});
    } else {
        const map = (data as { tipo_registro: string, conta_contabil_id: string | null }[]).reduce((acc, item) => {
            acc[item.tipo_registro] = item.conta_contabil_id;
            return acc;
        }, {} as Record<string, string | null>);
        setMapeamentoContabil(map);
    }
  }, [isAdmin, adminId]);
  
  useEffect(() => {
      if (open && isAdmin) {
          fetchContasOrigem();
          fetchMapeamentoContabil();
      }
  }, [open, isAdmin, fetchContasOrigem, fetchMapeamentoContabil]);

  const valorPago = form.watch('valor_pago');
  const acaoSaldoRestante = form.watch('acao_saldo_restante');
  const isPagamentoParcial = valorPago > 0 && valorPago < saldoDevedor;
  const saldoRestante = saldoDevedor - valorPago;

  const onSubmit = async (values: FormValues) => {
    if (!parcela || !adminId || !values.conta_id) {
        showError('Dados incompletos ou conta de origem não selecionada.');
        return;
    }

    const valorPagoAtual = values.valor_pago;
    const valorPagoAnterior = parcela.valor_pago || 0;
    const novoValorPagoTotal = valorPagoAnterior + valorPagoAtual;
    const saldoRestanteCalculado = parcela.valor_parcela - novoValorPagoTotal;
    const quitouComPagamentoAtual = novoValorPagoTotal >= parcela.valor_parcela;
    
    // Contas Contábeis Mapeadas
    const contaPagamento = mapeamentoContabil['pagamento'];
    const contaParcelaPagar = mapeamentoContabil['parcela_pagar'];
    const contaDescontoObtido = mapeamentoContabil['desconto_obtido'];

    try {
      // 1. Registrar o pagamento (admin_pagamentos)
      const pagamentoBasePayload = { 
          parcela_id: parcela.id, 
          admin_id: adminId, 
          valor_pago: valorPagoAtual, 
          conta_id: values.conta_id,
          id_conta_contabil: contaPagamento, // Mapeamento para Pagamento (Saída)
      };
      
      const { error: pagamentoError } = await supabase.from(tabelaPagamentos).insert({
        ...pagamentoBasePayload,
        data_pagamento: values.data_pagamento.toISOString(),
        forma_pagamento: values.forma_pagamento,
        tipo_pagamento: quitouComPagamentoAtual ? 'total' : 'parcial',
      });
      
      if (pagamentoError) throw pagamentoError;
      
      // 2. Lidar com a parcela original (admin_parcelas_pagar)
      if (quitouComPagamentoAtual) {
        // Se quitou, atualiza a parcela para paga
        await supabase.from(tabelaParcelas).update({
          status: 'paga',
          valor_pago: novoValorPagoTotal,
          data_pagamento: format(values.data_pagamento, 'yyyy-MM-dd'),
          id_conta_contabil: contaParcelaPagar,
        }).eq('id', parcela.id);
      } else { // Pagamento parcial
        if (values.acao_saldo_restante === 'desconto_obtido') {
          // Se for desconto obtido, a parcela é marcada como paga, e o saldo restante é o desconto (Receita)
          await supabase.from(tabelaParcelas).update({
            status: 'paga',
            valor_pago: novoValorPagoTotal,
            data_pagamento: format(values.data_pagamento, 'yyyy-MM-dd'),
            observacao: `Pago R$ ${valorPagoAtual.toFixed(2)} com R$ ${saldoRestanteCalculado.toFixed(2)} de desconto obtido.`,
            id_conta_contabil: contaParcelaPagar,
          }).eq('id', parcela.id);
          
          // TODO: Registrar o desconto obtido como um lançamento de Receita (Entrada)
          
        } else if (values.acao_saldo_restante === 'reprogramar' || values.acao_saldo_restante === 'parcelar') {
          // Marca a parcela original como paga (quitada pelo valor pago + saldo restante tratado)
          await supabase.from(tabelaParcelas).update({
            status: 'paga', 
            valor_pago: novoValorPagoTotal,
            data_pagamento: format(values.data_pagamento, 'yyyy-MM-dd'),
            observacao: `Pago R$ ${valorPagoAtual.toFixed(2)}. Saldo de R$ ${saldoRestanteCalculado.toFixed(2)} ${values.acao_saldo_restante === 'reprogramar' ? 'reprogramado' : 'parcelado'}.`,
            id_conta_contabil: contaParcelaPagar,
          }).eq('id', parcela.id);

          const baseParcelaPayload = { admin_id: adminId, id_conta_contabil: contaParcelaPagar };
          
          if (values.acao_saldo_restante === 'reprogramar') {
            await supabase.from(tabelaParcelas).insert({
              conta_pagar_id: parcela.conta_pagar_id,
              ...baseParcelaPayload,
              numero_parcela: 99,
              valor_parcela: saldoRestanteCalculado,
              data_vencimento: format(values.nova_data_vencimento!, 'yyyy-MM-dd'),
              status: 'reprogramada'
            });
          } else { // Parcelar
            const valorNovaParcela = saldoRestanteCalculado / values.numero_novas_parcelas!;
            const novasParcelas = Array.from({ length: values.numero_novas_parcelas! }).map((_, i) => ({
              conta_pagar_id: parcela.conta_pagar_id,
              ...baseParcelaPayload,
              numero_parcela: 100 + i,
              valor_parcela: valorNovaParcela,
              data_vencimento: format(addDays(values.nova_data_vencimento!, i * values.intervalo_dias_novas_parcelas!), 'yyyy-MM-dd'),
              status: 'reprogramada',
            }));
            await supabase.from(tabelaParcelas).insert(novasParcelas);
          }
        } else {
            // Caso de pagamento parcial sem ação definida (apenas atualiza)
            await supabase.from(tabelaParcelas).update({
                status: 'parcial',
                valor_pago: novoValorPagoTotal,
                id_conta_contabil: contaParcelaPagar,
            }).eq('id', parcela.id);
        }
      }
      
      // 3. Registrar o Lançamento na conta de Saldo (Movimentação de Caixa/Banco)
      // O tipo é 'Saida' porque é um Pagamento
      const lancamentoPayload = {
          empresa_id: adminId,
          data_movimentacao: values.data_pagamento.toISOString(),
          descricao: `Pagamento Parcela ${parcela.id} - ${parcela.fornecedor}`,
          valor: valorPagoAtual,
          tipo: 'Saida', // <-- SAÍDA
          conta_bancaria_id: values.conta_id,
          conta_contabil_id: contaPagamento, // Conta contábil do pagamento (Admin)
      };
      
      await supabase.from('lancamentos').insert(lancamentoPayload);


      showSuccess('Pagamento registrado com sucesso!');
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao registrar pagamento: ${error.message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Pagamento</DialogTitle>
          <DialogDescription>Saldo devedor da parcela: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoDevedor)}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="valor_pago" render={({ field }) => (<FormItem><FormLabel>Valor Pago</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="data_pagamento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Data</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy") : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="forma_pagamento" render={({ field }) => (<FormItem><FormLabel>Forma de Pagamento</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="conta_id" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Conta/Caixa de Origem</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value || undefined} disabled={loadingContas}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder={loadingContas ? "Carregando Contas..." : "Selecione a conta"} />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {contasOrigem.length === 0 ? (
                                    <SelectItem value="disabled" disabled>Nenhuma conta de saldo disponível.</SelectItem>
                                ) : (
                                    contasOrigem.map(c => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.nome} ({c.tipo_saldo})
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        {contasOrigem.length === 0 && (
                            <p className="text-sm text-red-500">
                                Nenhuma conta de saldo encontrada. Crie uma em <a href="/bancos" className="underline">Bancos / Caixas</a>.
                            </p>
                        )}
                    </FormItem>
                )} />
            </div>
            
            {isPagamentoParcial && (
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold text-destructive">Saldo restante: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoRestante)}</h3>
                <FormField control={form.control} name="acao_saldo_restante" render={({ field }) => (
                  <FormItem><FormLabel>O que fazer com o saldo restante?</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="space-y-2"><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="desconto_obtido" /></FormControl><FormLabel className="font-normal">Obter Desconto (Receita)</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="reprogramar" /></FormControl><FormLabel className="font-normal">Reprogramar Saldo</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="parcelar" /></FormControl><FormLabel className="font-normal">Parcelar Saldo</FormLabel></FormItem></RadioGroup></FormControl></FormItem>
                )} />
                {acaoSaldoRestante === 'reprogramar' && <FormField control={form.control} name="nova_data_vencimento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Nova Data de Vencimento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />}
                {acaoSaldoRestante === 'parcelar' && (
                  <div className="grid grid-cols-3 gap-4 items-end">
                    <FormField control={form.control} name="numero_novas_parcelas" render={({ field }) => (<FormItem><FormLabel>Nº Parcelas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="intervalo_dias_novas_parcelas" render={({ field }) => (<FormItem><FormLabel>Intervalo</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="nova_data_vencimento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>1º Venc.</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy") : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                  </div>
                )}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}><Loader2 className={cn("mr-2 h-4 w-4 animate-spin", !form.formState.isSubmitting && "hidden")} />Confirmar Pagamento</Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default RegistrarPagamentoCPDialog;