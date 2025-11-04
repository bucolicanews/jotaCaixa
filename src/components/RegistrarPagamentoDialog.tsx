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
  conta_id: z.string().uuid('Selecione a conta de destino.').nullable(), // NOVO CAMPO
  acao_saldo_restante: z.enum(['desconto', 'reprogramar', 'parcelar']).optional(),
  nova_data_vencimento: z.date().optional(),
  numero_novas_parcelas: z.coerce.number().int().min(2).optional(),
  intervalo_dias_novas_parcelas: z.coerce.number().int().min(1).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface RegistrarPagamentoDialogProps {
  parcela: ParcelaParaPagamento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveComplete: () => void;
}

const RegistrarPagamentoDialog: React.FC<RegistrarPagamentoDialogProps> = ({ parcela, open, onOpenChange, onSaveComplete }) => {
  const { role, usuario } = useSessao();
  const isAdmin = role === 'Admin';
  
  const [contasDestino, setContasDestino] = useState<SaldoConta[]>([]);
  const [loadingContas, setLoadingContas] = useState(true);
  const [mapeamentoContabil, setMapeamentoContabil] = useState<Record<string, string | null>>({});
  
  // Determina as tabelas de destino
  const tabelaRecebimentos = isAdmin ? 'admin_recebimentos' : 'recebimentos';
  const tabelaParcelas = isAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
  
  // O ID do proprietário da conta (Admin ID ou Empresa ID)
  const ownerId = isAdmin ? usuario?.id : parcela?.empresa_id;

  const saldoDevedor = parcela ? parcela.valor_parcela - (parcela.valor_pago || 0) : 0;

  const fetchContasDestino = useCallback(async () => {
    if (!ownerId) return;
    setLoadingContas(true);
    
    const { data, error } = await supabase
        .from('saldo_contas')
        .select('*')
        .eq('empresa_id', ownerId)
        .order('nome');
        
    if (error) {
            showError('Erro ao carregar Contas/Caixas: ' + error.message);
        setContasDestino([]);
    } else {
        setContasDestino(data as SaldoConta[]);
        // Se houver contas, define a primeira como padrão
        if (data.length > 0) {
            form.setValue('conta_id', data[0].id);
        }
    }
    setLoadingContas(false);
  }, [ownerId]);
  
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
  
  useEffect(() => {
      if (open) {
          fetchContasDestino();
          if (isAdmin) {
              fetchMapeamentoContabil();
          }
      }
  }, [open, fetchContasDestino, fetchMapeamentoContabil, isAdmin]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      valor_recebido: saldoDevedor,
      data_pagamento: new Date(),
      forma_pagamento: 'Pix',
      conta_id: null, // Inicializa como null
      acao_saldo_restante: 'reprogramar',
      numero_novas_parcelas: 2,
      intervalo_dias_novas_parcelas: 30,
    },
  });

  const valorRecebido = form.watch('valor_recebido');
  const acaoSaldoRestante = form.watch('acao_saldo_restante');
  const isPagamentoParcial = valorRecebido > 0 && valorRecebido < saldoDevedor;
  const saldoRestante = saldoDevedor - valorRecebido;

  const onSubmit = async (values: FormValues) => {
    if (!parcela || !ownerId || !values.conta_id) {
        showError('Dados incompletos ou conta de destino não selecionada.');
        return;
    }

    const valorRecebido = values.valor_recebido;
    const valorPagoAnterior = parcela.valor_pago || 0;
    const novoValorPagoTotal = valorPagoAnterior + valorRecebido;
    const saldoRestanteCalculado = parcela.valor_parcela - novoValorPagoTotal;
    const quitouComPagamentoAtual = novoValorPagoTotal >= parcela.valor_parcela;
    
    // Contas Contábeis Mapeadas
    const contaRecebimento = isAdmin ? mapeamentoContabil['recebimento'] : null;
    const contaParcela = isAdmin ? mapeamentoContabil['parcela'] : null;
    
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
            id_conta_contabil: contaRecebimento, // NOVO: Mapeamento para Recebimento
        };
    } else {
        recebimentoBasePayload = { 
            parcela_id: parcela.id, 
            empresa_id: ownerId, 
            valor_recebido: valorRecebido,
            conta_id: values.conta_id,
            // id_conta_contabil não é necessário para Cliente/Usuário
        };
    }

    try {
      // 1. Registrar o recebimento
      const { data: recebimentoData, error: recebimentoError } = await supabase.from(tabelaRecebimentos).insert({
        ...recebimentoBasePayload,
        data_recebimento: values.data_pagamento.toISOString(),
        forma_pagamento: values.forma_pagamento,
        tipo_recebimento: quitouComPagamentoAtual ? 'total' : 'parcial',
      }).select('id').single();
      
      if (recebimentoError) throw recebimentoError;
      
      const recebimentoId = recebimentoData.id;

      // 2. Lidar com a parcela original
      if (quitouComPagamentoAtual) {
        // Se quitou, atualiza a parcela para paga
        await supabase.from(tabelaParcelas).update({
          status: 'paga',
          valor_pago: novoValorPagoTotal,
          data_pagamento: values.data_pagamento.toISOString(),
          ...(isAdmin && { id_conta_contabil: contaParcela }) // NOVO: Mapeamento para Parcela
        }).eq('id', parcela.id);
      } else { // Pagamento parcial
        if (values.acao_saldo_restante === 'desconto') {
          // Se for desconto, a parcela é marcada como paga, e o saldo restante é o desconto
          await supabase.from(tabelaParcelas).update({
            status: 'paga',
            valor_pago: novoValorPagoTotal,
            data_pagamento: values.data_pagamento.toISOString(),
            observacao: `Recebido R$ ${valorRecebido.toFixed(2)} com R$ ${saldoRestanteCalculado.toFixed(2)} de desconto.`,
            ...(isAdmin && { id_conta_contabil: contaParcela }) // NOVO: Mapeamento para Parcela
          }).eq('id', parcela.id);
          
        } else if (values.acao_saldo_restante === 'reprogramar' || values.acao_saldo_restante === 'parcelar') {
          // Marca a parcela original como paga (quitada pelo valor recebido + saldo restante tratado)
          await supabase.from(tabelaParcelas).update({
            status: 'paga', 
            valor_pago: novoValorPagoTotal,
            data_pagamento: values.data_pagamento.toISOString(),
            observacao: `Recebido R$ ${valorRecebido.toFixed(2)}. Saldo de R$ ${saldoRestanteCalculado.toFixed(2)} ${values.acao_saldo_restante === 'reprogramar' ? 'reprogramado' : 'parcelado'}.`,
            ...(isAdmin && { id_conta_contabil: contaParcela }) // NOVO: Mapeamento para Parcela
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
            // Caso de pagamento parcial sem ação definida (apenas atualiza)
            await supabase.from(tabelaParcelas).update({
                status: 'parcial',
                valor_pago: novoValorPagoTotal,
                ...(isAdmin && { id_conta_contabil: contaParcela }) // NOVO: Mapeamento para Parcela
            }).eq('id', parcela.id);
        }
      }
      
      // 3. Registrar o Lançamento na conta de Saldo (Movimentação de Caixa/Banco)
      // O tipo é 'Entrada' porque é um Recebimento
      const lancamentoPayload = {
          empresa_id: ownerId, // ID do Admin/Empresa
          data_movimentacao: values.data_pagamento.toISOString(),
          descricao: `Recebimento Parcela ${parcela.id} - ${values.forma_pagamento}`,
          valor: valorRecebido,
          tipo: 'Entrada',
          conta_bancaria_id: values.conta_id, // ID da conta de saldo
          conta_contabil_id: contaRecebimento, // Conta contábil do recebimento (Admin)
          origem_tabela: tabelaRecebimentos,
          origem_id: recebimentoId,
      };
      
      // Nota: A tabela 'lancamentos' no esquema tem 'empresa_id' e 'conta_bancaria_id'.
      // Para o Admin, 'empresa_id' é o ID do Admin. Para o Cliente, 'empresa_id' é o ID do Cliente.
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
              <FormField control={form.control} name="valor_recebido" render={({ field }) => (<FormItem><FormLabel>Valor Recebido</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="data_pagamento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Data</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy") : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="forma_pagamento" render={({ field }) => (<FormItem><FormLabel>Forma de Pagamento</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="conta_id" render={({ field }) => (
                    <FormItem>
                        <FormLabel>Conta/Caixa de Destino</FormLabel>
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
                    </FormItem>
                )} />
            </div>
            
            {isPagamentoParcial && (
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold text-destructive">Saldo restante: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoRestante)}</h3>
                <FormField control={form.control} name="acao_saldo_restante" render={({ field }) => (
                  <FormItem><FormLabel>O que fazer com o saldo restante?</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="space-y-2"><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="desconto" /></FormControl><FormLabel className="font-normal">Conceder Desconto (Perdoar)</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="reprogramar" /></FormControl><FormLabel className="font-normal">Reprogramar Saldo</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="parcelar" /></FormControl><FormLabel className="font-normal">Parcelar Saldo</FormLabel></FormItem></RadioGroup></FormControl></FormItem>
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
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}><Loader2 className={cn("mr-2 h-4 w-4 animate-spin", !form.formState.isSubmitting && "hidden")} />Confirmar Recebimento</Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default RegistrarPagamentoDialog;