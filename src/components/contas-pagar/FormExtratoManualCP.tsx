import React, { useState, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Save, Upload, FileText, XCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { AdminParcelaPagar } from '@/types/contas-pagar'; // Reutilizando o tipo de parcela
import { SaldoCalculado } from '@/hooks/use-saldo-conta-calculado';
import { Textarea } from '../ui/textarea';
import { Separator } from "@/components/ui/separator";
import { useSessao } from '@/hooks/use-sessao';
import { PlanoContas } from '@/types/plano-contas';

// Função local para formatar moeda (caso não exista)
const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Nome do bucket de armazenamento para comprovantes
const COMPROVANTE_BUCKET = 'comprovantes-financeiros'; 

interface ParcelaParaPagamento extends AdminParcelaPagar {
    fornecedor: string;
}

interface PagamentoDetalhe {
    conta_id: string;
    valor_pago: number;
}

interface FormExtratoManualCPProps {
    parcela: ParcelaParaPagamento;
    pagamentoDetalhes: PagamentoDetalhe[];
    formaPagamento: string;
    dataPagamento: Date;
    historicoId: string | null;
    contaPatrimonialId: string | null;
    contasOrigem: SaldoCalculado[];
    mapeamentoContabil: Record<string, string | null>;
    onSaveComplete: () => void;
    onClose: () => void;
}

const formSchema = z.object({
    descricao_extrato: z.string().min(1, 'A descrição é obrigatória.'),
    identificacao: z.string().optional().or(z.literal('')),
    observacao: z.string().optional().or(z.literal('')),
    comprovante_url: z.string().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

const FormExtratoManualCP: React.FC<FormExtratoManualCPProps> = ({
    parcela,
    pagamentoDetalhes,
    formaPagamento,
    dataPagamento,
    historicoId,
    contaPatrimonialId,
    contasOrigem,
    mapeamentoContabil,
    onSaveComplete,
    onClose,
}) => {
    const { role, usuario } = useSessao();
    const isAdmin = role === 'Admin';
    
    const [loading, setLoading] = useState(false);
    const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    
    const adminId = parcela.admin_id;
    const totalPago = pagamentoDetalhes.reduce((sum, p) => sum + p.valor_pago, 0);
    
    const contaPagamento = mapeamentoContabil['pagamento']; // Conta de Pagamento (Resultado)
    const contaParcelaPagar = mapeamentoContabil['parcela_pagar'];
    const contaDescontoObtido = mapeamentoContabil['desconto_obtido']; // NOVO CAMPO
    
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            descricao_extrato: `Pagamento CP: ${parcela.fornecedor} - ${parcela.descricao}`,
            identificacao: parcela.documento || '',
            observacao: '',
            comprovante_url: '',
        },
    });
    
    const uploadComprovante = async (file: File, parcelaId: string): Promise<string> => {
        setIsUploading(true);
        
        const fileExt = file.name.split('.').pop();
        // Usando uma subpasta 'comprovantes-cp' dentro do bucket
        const fileName = `${adminId}/${parcelaId}/comprovantes-cp/${Date.now()}.${fileExt}`;
        
        try {
            const { data, error: uploadError } = await supabase.storage
                .from(COMPROVANTE_BUCKET)
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false,
                });

            if (uploadError) throw new Error(uploadError.message);
            
            const { data: publicUrlData } = supabase.storage.from(COMPROVANTE_BUCKET).getPublicUrl(data.path);
            
            showSuccess('Comprovante enviado com sucesso!');
            return publicUrlData.publicUrl;
            
        } catch (error: any) {
            showError('Falha ao fazer upload do comprovante: ' + error.message);
            throw error;
        } finally {
            setIsUploading(false);
        }
    };

    const onSubmit = async (values: FormValues) => {
        setLoading(true);

        const tabelaPagamentos = 'admin_pagamentos';
        const tabelaParcelas = 'admin_parcelas_pagar';
        const tabelaContasPagar = 'admin_contas_pagar';
        
        const valorPagoTotal = totalPago;
        const saldoRestanteCalculado = parcela.valor_parcela - (parcela.valor_pago || 0) - totalPago;
        const isPagamentoParcial = saldoRestanteCalculado > 0.01;
        
        try {
            let comprovanteUrl: string | null = values.comprovante_url || null;

            // 1. Upload do comprovante (se houver arquivo)
            if (comprovanteFile) {
                comprovanteUrl = await uploadComprovante(comprovanteFile, parcela.id);
            }
            
            // 2. Buscar a Conta Sintética para obter a conta de Despesa/Custo (DRE)
            const { data: contaSintetica, error: csError } = await supabase
                .from('admin_contas_pagar')
                .select('id_conta_patrimonial, descricao, id_conta_resultado')
                .eq('id', parcela.conta_pagar_id)
                .single();
                
            if (csError) throw csError;
            const contaPatrimonial = contaSintetica?.id_conta_patrimonial;
            const descricaoContaSintetica = contaSintetica?.descricao || 'Pagamento';
            const contaDespesaCriacao = contaSintetica?.id_conta_resultado;
            
            const dataPagamento = dataPagamento;
            const dataNoonUTC = new Date(Date.UTC(dataPagamento.getFullYear(), dataPagamento.getMonth(), dataPagamento.getDate(), 12, 0, 0));
            const dataPagamentoISO = dataNoonUTC.toISOString();
            
            // 3. Inserir o registro na tabela 'extratos' (apenas para contas do tipo 'Banco')
            const extratosPayload = pagamentoDetalhes
                .map(p => {
                    const contaOrigem = contasOrigem.find(c => c.id === p.conta_id);
                    
                    // CRÍTICO: Apenas se for uma conta de BANCO
                    if (!contaOrigem?.plano_contas?.is_banco) return null; 
                    
                    // O valor no extrato é sempre o valor real (negativo para Saída)
                    const valorExtrato = -Math.abs(p.valor_pago); 
                    
                    // Busca a conta contábil de pagamento (se for Admin)
                    const contaContabilPagamento = isAdmin 
                        ? mapeamentoContabil['pagamento']
                        : null;
                    
                    return {
                        empresa_id: adminId,
                        id_saldo_contas: p.conta_id,
                        data: format(dataPagamento, 'yyyy-MM-dd'),
                        descricao: values.descricao_extrato,
                        valor: valorExtrato,
                        tipo: 'Saida' as const,
                        identificacao: values.identificacao || null,
                        conciliado: false, // Começa como não conciliado
                        conta_contabil_id: contaContabilPagamento, // Mapeia para a conta de Pagamento (Resultado)
                    };
                })
                .filter(e => e !== null);
                
            if (extratosPayload.length > 0) {
                const { error: extratoError } = await supabase.from('extratos').insert(extratosPayload);
                if (extratoError) throw extratoError;
            }
            
            // 4. Continuar com o fluxo de pagamento (Registrar Pagamento e Lançamentos)
            
            const lancamentosPayload: any[] = [];
            const origemVincular = `pagamento_cp:${parcela.id}`;

            for (const pagamento of pagamentoDetalhes) {
                // 4.1. Registrar Pagamento (Histórico)
                const pagamentoPayload = { 
                    parcela_id: parcela.id, 
                    admin_id: adminId, 
                    valor_pago: pagamento.valor_pago, 
                    conta_id: pagamento.conta_id,
                    id_conta_contabil: contaPagamento,
                    data_pagamento: dataPagamentoISO,
                    forma_pagamento: values.forma_pagamento,
                    tipo_pagamento: isPagamentoParcial ? 'parcial' : 'total',
                    historico_id: historicoId,
                    id_conta_resultado: contaDespesaCriacao,
                    observacao: values.observacao || null,
                    // Adiciona a URL do comprovante ao registro de pagamento
                    anexo_url: comprovanteUrl, 
                };
                
                const { error: pagamentoError } = await supabase.from(tabelaPagamentos).insert(pagamentoPayload);
                if (pagamentoError) throw pagamentoError;
                
                // 4.2. Registrar o Lançamento no Ativo (Caixa/Banco) - CRÉDITO (Saída)
                const contaDestinoDetalhe = contasOrigem.find(c => c.id === pagamento.conta_id);
                const contaContabilCaixaBanco = contaDestinoDetalhe?.plano_contas?.id;
                
                if (!contaContabilCaixaBanco) throw new Error('Conta de origem não possui vínculo contábil.');
                
                // CRÍTICO: Geração de IDs e Referência Cruzada
                const idAtivo = crypto.randomUUID();
                const idPatrimonial = crypto.randomUUID();
                
                // Lançamento 1: C: Ativo (Caixa/Banco) - CRÉDITO (Saída)
                const lancamentoAtivoPayload = {
                    id: idAtivo,
                    proprietario_id: adminId,
                    data_movimentacao: dataPagamentoISO,
                    descricao: `Pagamento Parcela ${parcela.id.substring(0, 8)} - ${parcela.fornecedor}`, 
                    valor: pagamento.valor_pago,
                    tipo: 'Saida' as const, // Crédito é 'Saida' no Ativo
                    conta_bancaria_id: pagamento.conta_id,
                    conta_contabil_id: contaContabilCaixaBanco,
                    origem: origemVincular, // MODELO A: VINCULAÇÃO PELA PARCELA
                    historico_id: values.historico_id,
                    conta_resultado_id: idPatrimonial, // Ativo aponta para Passivo
                };
                lancamentosPayload.push(lancamentoAtivoPayload);
                
                // Lançamento 2: D: Passivo (Obrigação a Pagar) - DÉBITO (Entrada)
                if (contaPatrimonial) {
                    const lancamentoPatrimonialPayload = {
                        id: idPatrimonial,
                        proprietario_id: adminId,
                        data_movimentacao: dataPagamentoISO,
                        descricao: `Baixa Passivo CP: ${descricaoContaSintetica} (CP ID: ${parcela.conta_pagar_id.substring(0, 8)})`,
                        valor: pagamento.valor_pago,
                        tipo: 'Entrada' as const, // Débito é 'Entrada' no Passivo
                        conta_bancaria_id: null,
                        conta_contabil_id: contaPatrimonial,
                        origem: origemVincular, // MODELO A: VINCULAÇÃO PELA PARCELA
                        historico_id: values.historico_id,
                        conta_resultado_id: idAtivo, // Passivo aponta para Ativo
                    };
                    lancamentosPayload.push(lancamentoPatrimonialPayload);
                }
            }
            
            // 4.3. Lidar com o Saldo Restante (Pagamento Parcial)
            let finalStatus: AdminParcelaPagar['status'] = 'paga';
            let observacaoFinal: string | null = null;
            
            if (isPagamentoParcial) {
                const acaoSaldoRestante = (form.getValues('acao_saldo_restante') || 'desconto'); // Lendo do RHF
                
                if (acaoSaldoRestante === 'desconto') {
                    finalStatus = 'paga';
                    observacaoFinal = `Pago R$ ${valorPagoTotal.toFixed(2)} com R$ ${saldoRestanteCalculado.toFixed(2)} de desconto.`;
                    
                    // --- INÍCIO CORREÇÃO: LANÇAMENTOS DE DESCONTO ---
                    if (contaDescontoObtido && contaPatrimonial) {
                        
                        // Geração de IDs e Referência Cruzada para o Desconto
                        const idDescontoResultado = crypto.randomUUID();
                        const idDescontoPatrimonial = crypto.randomUUID();

                        // Lançamento 3: C: Receita (Desconto Obtido) - CRÉDITO (Saída)
                        const lancamentoDescontoResultadoPayload = {
                            id: idDescontoResultado,
                            proprietario_id: adminId,
                            data_movimentacao: dataPagamentoISO,
                            descricao: `Desconto Obtido: ${descricaoContaSintetica} (CP ID: ${parcela.conta_pagar_id.substring(0, 8)})`,
                            valor: saldoRestanteCalculado,
                            tipo: 'Saida' as const, // Saída na Receita (Crédito)
                            conta_bancaria_id: null,
                            conta_contabil_id: contaDescontoObtido, // Conta de Desconto Obtido (Receita)
                            origem: 'pagamento_manual',
                            historico_id: values.historico_id,
                            conta_resultado_id: idDescontoPatrimonial, // Link para o débito no Passivo
                        };
                        lancamentosPayload.push(lancamentoDescontoResultadoPayload);
                        
                        // Lançamento 4: D: Passivo (Obrigação a Pagar) - DÉBITO (Entrada) para o valor do DESCONTO
                        const lancamentoDescontoPatrimonialPayload = {
                            id: idDescontoPatrimonial,
                            proprietario_id: adminId,
                            data_movimentacao: dataPagamentoISO,
                            descricao: `Baixa Passivo CP (Desconto): ${descricaoContaSintetica} (CP ID: ${parcela.conta_pagar_id.substring(0, 8)})`,
                            valor: saldoRestanteCalculado,
                            tipo: 'Entrada' as const, // Débito é 'Entrada' no Passivo
                            conta_bancaria_id: null,
                            conta_contabil_id: contaPatrimonial,
                            origem: 'pagamento_manual',
                            historico_id: values.historico_id,
                            conta_resultado_id: idDescontoResultado, // Link para o crédito na Receita
                        };
                        lancamentosPayload.push(lancamentoDescontoPatrimonialPayload);
                    }
                    // --- FIM CORREÇÃO: LANÇAMENTOS DE DESCONTO ---
                    
                } else if (acaoSaldoRestante === 'reprogramar' || acaoSaldoRestante === 'parcelar') {
                    finalStatus = 'paga';
                    observacaoFinal = `Pago R$ ${valorPagoTotal.toFixed(2)}. Saldo de R$ ${saldoRestanteCalculado.toFixed(2)} ${acaoSaldoRestante === 'reprogramar' ? 'reprogramado' : 'parcelado'}.`;
                    
                    // Cria novas parcelas pendentes
                    const baseParcelaPayload = { admin_id: adminId, id_conta_contabil: contaParcelaPagar };
                    
                    if (acaoSaldoRestante === 'reprogramar') {
                        await supabase.from(tabelaParcelas).insert({
                            conta_pagar_id: parcela.conta_pagar_id,
                            ...baseParcelaPayload,
                            numero_parcela: 99,
                            valor_parcela: saldoRestanteCalculado,
                            data_vencimento: format(form.getValues('nova_data_vencimento')!, 'yyyy-MM-dd'),
                            status: 'reprogramada'
                        });
                    } else { // Parcelar
                        const numero_novas_parcelas = form.getValues('numero_novas_parcelas')!;
                        const intervalo_dias_novas_parcelas = form.getValues('intervalo_dias_novas_parcelas')!;
                        const nova_data_vencimento = form.getValues('nova_data_vencimento')!;
                        
                        const valorNovaParcela = saldoRestanteCalculado / numero_novas_parcelas;
                        const novasParcelas = Array.from({ length: numero_novas_parcelas }).map((_, i) => ({
                            conta_pagar_id: parcela.conta_pagar_id,
                            ...baseParcelaPayload,
                            numero_parcela: 100 + i,
                            valor_parcela: valorNovaParcela,
                            data_vencimento: format(addDays(nova_data_vencimento, i * intervalo_dias_novas_parcelas), 'yyyy-MM-dd'),
                            status: 'reprogramada',
                        }));
                        await supabase.from(tabelaParcelas).insert(novasParcelas);
                    }
                } else {
                    // Se não escolheu ação, mantém como parcial (embora o superRefine deva impedir isso)
                    finalStatus = 'parcial';
                }
            }
            
            // 4.4. Inserir todos os lançamentos de uma vez
            const { error: lancamentoError } = await supabase.from('lancamentos').insert(lancamentosPayload);
            if (lancamentoError) throw lancamentoError;

            // 5. Atualizar a parcela e a conta sintética
            await supabase.from(tabelaParcelas).update({
              status: finalStatus,
              valor_pago: (parcela.valor_pago || 0) + valorPagoTotal,
              data_pagamento: format(dataPagamento, 'yyyy-MM-dd'),
              id_conta_contabil: contaParcelaPagar,
              observacao: observacaoFinal,
            }).eq('id', parcela.id);
            
            const { count: parcelasPendentesCount } = await supabase
                .from(tabelaParcelas)
                .select('id', { count: 'exact', head: true })
                .eq('conta_pagar_id', parcela.conta_pagar_id)
                .in('status', ['aberta', 'parcial', 'reprogramada']);
                
            if (parcelasPendentesCount === 0) {
                await supabase.from(tabelaContasPagar).update({ status: 'pago' }).eq('id', parcela.conta_pagar_id);
            }
            
            // 6. Salvar Histórico Padrão (se marcado)
            if (isAdmin && values.salvar_como_padrao && values.historico_id) {
                await supabase.from('configuracao_historico_padrao').upsert({
                    proprietario_id: adminId,
                    tipo_registro: 'pagamento_padrao',
                    historico_id: values.historico_id,
                }, { onConflict: 'proprietario_id, tipo_registro' });
            }

            showSuccess('Pagamento registrado com sucesso!');
            onSaveComplete();
            onOpenChange(false);

        } catch (error: any) {
            showError(`Falha ao registrar pagamento: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };


    const onSubmit = async (values: FormValues) => {
        if (!parcela || !adminId) {
            showError('Dados da parcela ou administrador estão incompletos.');
            return;
        }
        
        if (Math.abs(restante) > 0.01 && !isPagamentoParcial) {
            showError('O valor total pago deve ser igual ao saldo devedor da parcela.');
            return;
        }
        
        // 1. Validação de Saldo
        for (const pagamento of values.pagamentos) {
            const contaSelecionada = contasOrigem.find(c => c.id === pagamento.conta_id);
            if (!contaSelecionada) {
                showError(`Conta de origem com ID ${pagamento.conta_id} não encontrada.`);
                return;
            }
            if (contaSelecionada.saldo_atual < pagamento.valor_pago) {
                showError(`Saldo insuficiente na conta "${contaSelecionada.nome}". Saldo: ${formatCurrency(contaSelecionada.saldo_atual)}, Tentativa de Pagar: ${formatCurrency(pagamento.valor_pago)}`);
                return;
            }
        }
        
        // 2. Verificar se alguma conta de origem é um BANCO
        const hasBankPayment = values.pagamentos.some(p => {
            const conta = contasOrigem.find(c => c.id === p.conta_id);
            return conta?.plano_contas?.is_banco === true;
        });
        
        // 3. Se houver pagamento via Banco, abre o modal de Extrato Manual
        if (hasBankPayment) {
            setPendingPaymentData(values);
            setExtratoManualDialog(true);
            return;
        }
        
        // 4. Se for apenas Caixa ou outras contas (não Banco), salva diretamente
        await saveDirectPayment(values);
    };

    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    // Habilita o botão se o pagamento for total OU se for parcial e a ação de saldo restante for válida
    const isSubmitDisabled = loading || form.formState.isSubmitting || (isPagamentoParcial && !form.formState.isValid);

    return (
      <>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Registrar Pagamento</DialogTitle>
              <DialogDescription>Saldo devedor da parcela: {formatCurrency(saldoDevedor)}</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="data_pagamento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Data do Pagamento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy", { locale: ptBR }) : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="forma_pagamento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Forma de Pagamento</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                    <FormLabel>Fontes de Pagamento (Ativo)</FormLabel>
                    {fields.map((item, index) => {
                        const conta = contasOrigem.find(c => c.id === item.conta_id);
                        const isBank = conta?.plano_contas?.is_banco;
                        
                        return (
                            <div key={item.id} className="flex items-end space-x-2 p-2 border rounded-md">
                                <FormField
                                    control={control}
                                    name={`pagamentos.${index}.conta_id`}
                                    render={({ field }) => (
                                        <FormItem className="flex-1">
                                            <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingContas}>
                                                <FormControl><SelectTrigger className={cn(isBank && 'border-blue-500')}><SelectValue placeholder="Selecione a conta" /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    {contasOrigem.map(c => (
                                                        <SelectItem key={c.id} value={c.id}>
                                                            {c.nome} ({formatCurrency(c.saldo_atual)})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={control}
                                    name={`pagamentos.${index}.valor_pago`}
                                    render={({ field }) => (
                                        <FormItem className="w-1/3">
                                            <FormControl><Input type="number" step="0.01" placeholder="Valor" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}>
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        );
                    })}
                    <Button type="button" variant="outline" size="sm" onClick={() => append({ conta_id: '', valor_pago: 0 })}>
                        <PlusCircle className="w-4 h-4 mr-2" /> Adicionar Fonte de Pagamento
                    </Button>
                </div>
                
                <Separator />
                
                {/* Conta Patrimonial (Obrigação a Pagar) */}
                <FormField
                    control={form.control}
                    name="conta_patrimonial_id"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Conta Patrimonial (Obrigação a Pagar)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingContasPatrimoniais}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={loadingContasPatrimoniais ? "Carregando Contas..." : `Selecione a conta de Passivo (${configMap.Passivo}.x.x)`} />
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
                                    Nenhuma conta Patrimonial marcada como Contas a Pagar no Plano de Contas.
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
                                    <FormLabel>Histórico do Pagamento (Opcional)</FormLabel>
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
                                                    {h.codigo && `[${h.codigo}] `}{h.descricao}
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
                                            Definir este Histórico como Padrão para Pagamentos
                                        </FormLabel>
                                    </div>
                                </FormItem>
                            )}
                        />
                    </div>
                )}
                
                {/* Lógica de Pagamento Parcial (NOVA) */}
                {isPagamentoParcial && (
                    <div className="space-y-4 pt-4 border-t">
                        <h3 className="font-semibold text-destructive">Saldo restante: {formatCurrency(restante)}</h3>
                        <FormField control={form.control} name="acao_saldo_restante" render={({ field }) => (
                            <FormItem>
                                <FormLabel>O que fazer com o saldo restante?</FormLabel>
                                <FormControl>
                                    <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="space-y-2">
                                        <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="desconto" /></FormControl><FormLabel className="font-normal">Conceder Desconto Obtido (Receita)</FormLabel></FormItem>
                                        <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="reprogramar" /></FormControl><FormLabel className="font-normal">Reprogramar Saldo</FormLabel></FormItem>
                                        <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="parcelar" /></FormControl><FormLabel className="font-normal">Parcelar Saldo</FormLabel></FormItem>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        
                        {acaoSaldoRestante === 'reprogramar' && <FormField control={form.control} name="nova_data_vencimento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Nova Data de Vencimento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent></Popover><FormMessage /></FormItem>)} />}
                        {acaoSaldoRestante === 'parcelar' && (
                            <div className="grid grid-cols-3 gap-4 items-end">
                                <FormField control={control} name="numero_novas_parcelas" render={({ field }) => (<FormItem><FormLabel>Nº Parcelas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={control} name="intervalo_dias_novas_parcelas" render={({ field }) => (<FormItem><FormLabel>Intervalo</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={control} name="nova_data_vencimento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>1º Venc.</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy", { locale: ptBR }) : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                            </div>
                        )}
                    </div>
                )}
                
                <div className="p-4 bg-secondary rounded-md space-y-2 text-sm">
                    <div className="flex justify-between font-medium"><p>Total Informado:</p><p>{formatCurrency(totalPago)}</p></div>
                    <Separator />
                    <div className={cn("flex justify-between font-bold text-lg", Math.abs(restante) > 0.01 ? 'text-red-600' : 'text-green-600')}>
                        <p>Restante a Pagar:</p>
                        <p>{formatCurrency(restante)}</p>
                    </div>
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitDisabled}>
                  <Loader2 className={cn("mr-2 h-4 w-4 animate-spin", (loading || form.formState.isSubmitting) && "hidden")} />
                  Confirmar Pagamento
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        
        {/* NOVO MODAL DE EXTRATO MANUAL */}
        {extratoManualDialog && pendingPaymentData && parcela && (
            <Dialog open={extratoManualDialog} onOpenChange={setExtratoManualDialog}>
                <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Registro de Extrato Manual</DialogTitle>
                        <DialogDescription>
                            Confirme os detalhes do extrato para evitar duplicidade na conciliação.
                        </DialogDescription>
                    </DialogHeader>
                    <FormExtratoManualCP
                        parcela={parcela}
                        pagamentoDetalhes={pendingPaymentData.pagamentos.map(p => ({ conta_id: p.conta_id, valor_pago: p.valor_pago }))}
                        formaPagamento={pendingPaymentData.forma_pagamento}
                        dataPagamento={pendingPaymentData.data_pagamento}
                        historicoId={pendingPaymentData.historico_id}
                        contaPatrimonialId={pendingPaymentData.conta_patrimonial_id}
                        contasOrigem={contasOrigem}
                        mapeamentoContabil={mapeamentoContabil}
                        onSaveComplete={onSaveComplete}
                        onClose={() => setExtratoManualDialog(false)}
                    />
                </DialogContent>
            </Dialog>
        )}
      </>
    );
};

export default RegistrarPagamentoCPDialog;