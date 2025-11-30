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
import { format, addDays } from 'date-fns';
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
    
    const contaPagamento = mapeamentoContabil['pagamento']; // Conta de Resultado (Despesa/Custo)
    const contaParcelaPagar = mapeamentoContabil['parcela_pagar'];
    const contaDescontoObtido = mapeamentoContabil['desconto_obtido']; // NOVO
    
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
        
        const valorPagoAnterior = parcela.valor_pago || 0;
        const novoValorPagoTotal = valorPagoAnterior + totalPago;
        const saldoRestanteCalculado = parcela.valor_parcela - novoValorPagoTotal;
        const isPagamentoParcial = saldoRestanteCalculado > 0.01;
        
        // Lógica de Pagamento Parcial (lida no componente pai)
        const parentValues = (form.getValues() as any).parentValues as any; // Usando 'any' para acessar campos do form pai
        const acaoSaldoRestante = parentValues?.acao_saldo_restante;
        
        try {
            let comprovanteUrl: string | null = values.comprovante_url || null;

            // 1. Upload do comprovante (se houver arquivo)
            if (comprovanteFile) {
                comprovanteUrl = await uploadComprovante(comprovanteFile, parcela.id);
            }
            
            // 2. Buscar a Conta Sintética para obter a descrição e contas contábeis
            const { data: contaSintetica, error: csError } = await supabase
                .from(tabelaContasPagar)
                .select('id_conta_patrimonial, descricao, id_conta_resultado')
                .eq('id', parcela.conta_pagar_id)
                .single();
                
            if (csError) throw csError;
            const contaPatrimonial = contaSintetica?.id_conta_patrimonial;
            const descricaoContaSintetica = contaSintetica?.descricao || 'Pagamento';
            const contaDespesaCriacao = contaSintetica?.id_conta_resultado;
            
            const dataPagamento = parentValues.data_pagamento;
            const dataNoonUTC = new Date(Date.UTC(dataPagamento.getFullYear(), dataPagamento.getMonth(), dataPagamento.getDate(), 12, 0, 0));
            const dataPagamentoISO = dataNoonUTC.toISOString();
            
            // 3. Inserir o registro na tabela 'extratos' (apenas para contas do tipo 'Banco')
            const extratosPayload = pagamentoDetalhes
                .map(p => {
                    const contaOrigem = contasOrigem.find(c => c.id === p.conta_id);
                    
                    if (!contaOrigem?.plano_contas?.is_banco) return null; 
                    
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
                    forma_pagamento: parentValues.forma_pagamento,
                    tipo_pagamento: isPagamentoParcial ? 'parcial' : 'total',
                    historico_id: parentValues.historico_id,
                    id_conta_resultado: contaDespesaCriacao,
                    anexo_url: comprovanteUrl,
                    observacao: values.observacao || null,
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
                    origem: origemVincular,
                    historico_id: parentValues.historico_id,
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
                        origem: origemVincular,
                        historico_id: parentValues.historico_id,
                        conta_resultado_id: idAtivo, // Passivo aponta para Ativo
                    };
                    lancamentosPayload.push(lancamentoPatrimonialPayload);
                }
            }
            
            // 5. Lidar com o Saldo Restante (Pagamento Parcial)
            let finalStatus: AdminParcelaPagar['status'] = 'paga';
            let observacaoFinal: string | null = values.observacao || null;
            
            if (isPagamentoParcial) {
                if (acaoSaldoRestante === 'desconto') {
                    finalStatus = 'paga';
                    observacaoFinal = `Pago R$ ${valorPagoTotal.toFixed(2)} com R$ ${saldoRestanteCalculado.toFixed(2)} de desconto. ${values.observacao || ''}`;
                    
                    // LANÇAMENTO DE DESCONTO OBTIDO (CRÉDITO na Receita)
                    if (contaDescontoObtido && contaPatrimonial) {
                        const idDescontoReceita = crypto.randomUUID();
                        const idDescontoPassivo = crypto.randomUUID();

                        // Lançamento 3: D: Passivo (Obrigação a Pagar) - DÉBITO (Entrada) - Para zerar o saldo restante
                        const lancamentoDescontoPassivoPayload = {
                            id: idDescontoPassivo,
                            proprietario_id: adminId,
                            data_movimentacao: dataPagamentoISO,
                            descricao: `Baixa Passivo Desconto CP: ${descricaoContaSintetica} (CP ID: ${parcela.conta_pagar_id.substring(0, 8)})`,
                            valor: saldoRestanteCalculado,
                            tipo: 'Entrada' as const, // Débito no Passivo (Credora)
                            conta_bancaria_id: null,
                            conta_contabil_id: contaPatrimonial, // Conta Patrimonial (Passivo)
                            origem: 'pagamento_manual',
                            historico_id: parentValues.historico_id,
                            conta_resultado_id: idDescontoReceita, // Referência cruzada
                        };
                        lancamentosPayload.push(lancamentoDescontoPassivoPayload);

                        // Lançamento 4: C: Receita (Desconto Obtido) - CRÉDITO (Saída) - Para reconhecer o ganho
                        const lancamentoDescontoReceitaPayload = {
                            id: idDescontoReceita,
                            proprietario_id: adminId,
                            data_movimentacao: dataPagamentoISO,
                            descricao: `Desconto Obtido: ${descricaoContaSintetica} (CP ID: ${parcela.conta_pagar_id.substring(0, 8)})`,
                            valor: saldoRestanteCalculado,
                            tipo: 'Saida' as const, // Crédito na Receita (Credora)
                            conta_bancaria_id: null,
                            conta_contabil_id: contaDescontoObtido, // Conta de Desconto Obtido (Receita)
                            origem: 'pagamento_manual',
                            historico_id: parentValues.historico_id,
                            conta_resultado_id: idDescontoPassivo, // Referência cruzada
                        };
                        lancamentosPayload.push(lancamentoDescontoReceitaPayload);
                    }
                    
                } else if (acaoSaldoRestante === 'reprogramar' || acaoSaldoRestante === 'parcelar') {
                    finalStatus = 'paga';
                    observacaoFinal = `Pago R$ ${valorPagoTotal.toFixed(2)} com R$ ${saldoRestanteCalculado.toFixed(2)} ${acaoSaldoRestante === 'reprogramar' ? 'reprogramado' : 'parcelado'}. ${values.observacao || ''}`;
                    
                    // Cria novas parcelas pendentes
                    const baseParcelaPayload = { admin_id: adminId, id_conta_contabil: contaParcelaPagar };
                    
                    if (acaoSaldoRestante === 'reprogramar') {
                        await supabase.from(tabelaParcelas).insert({
                            conta_pagar_id: parcela.conta_pagar_id,
                            ...baseParcelaPayload,
                            numero_parcela: 99,
                            valor_parcela: saldoRestanteCalculado,
                            data_vencimento: format(parentValues.nova_data_vencimento!, 'yyyy-MM-dd'),
                            status: 'reprogramada'
                        });
                    } else { // Parcelar
                        const valorNovaParcela = saldoRestanteCalculado / parentValues.numero_novas_parcelas!;
                        const novasParcelas = Array.from({ length: parentValues.numero_novas_parcelas! }).map((_, i) => ({
                            conta_pagar_id: parcela.conta_pagar_id,
                            ...baseParcelaPayload,
                            numero_parcela: 100 + i,
                            valor_parcela: valorNovaParcela,
                            data_vencimento: format(addDays(parentValues.nova_data_vencimento!, i * parentValues.intervalo_dias_novas_parcelas!), 'yyyy-MM-dd'),
                            status: 'reprogramada',
                        }));
                        await supabase.from(tabelaParcelas).insert(novasParcelas);
                    }
                } else {
                    finalStatus = 'parcial';
                }
            }
            
            // 6. Inserir todos os lançamentos de uma vez
            const { error: lancamentoError } = await supabase.from('lancamentos').insert(lancamentosPayload);
            if (lancamentoError) throw lancamentoError;

            // 7. Atualizar a parcela e a conta sintética
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
            
            // 8. Salvar Histórico Padrão (se marcado)
            if (isAdmin && parentValues.salvar_como_padrao && parentValues.historico_id) {
                await supabase.from('configuracao_historico_padrao').upsert({
                    proprietario_id: adminId,
                    tipo_registro: 'pagamento_padrao',
                    historico_id: parentValues.historico_id,
                }, { onConflict: 'proprietario_id, tipo_registro' });
            }

            showSuccess('Pagamento registrado com sucesso!');
            onSaveComplete();
            onClose();

        } catch (error: any) {
            showError(`Falha ao registrar pagamento: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setComprovanteFile(e.target.files?.[0] || null);
    };
    
    const handleRemoveFile = () => {
        setComprovanteFile(null);
        form.setValue('comprovante_url', '');
    };
    
    const isSubmitting = loading || isUploading;

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <h3 className="text-lg font-semibold">Detalhes do Extrato Bancário</h3>
                <p className="text-sm text-muted-foreground">
                    Confirme os dados que serão registrados na tabela `extratos` para evitar duplicidade na conciliação.
                </p>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2 p-3 bg-secondary rounded-md">
                        <p className="text-sm font-medium">Conta de Origem</p>
                        {pagamentoDetalhes.map((p, i) => {
                            const conta = contasOrigem.find(c => c.id === p.conta_id);
                            return (
                                <p key={i} className="text-xs font-mono">
                                    {conta?.nome}: {formatCurrency(p.valor_pago)}
                                </p>
                            );
                        })}
                    </div>
                    <div className="space-y-2 p-3 bg-secondary rounded-md">
                        <p className="text-sm font-medium">Data / Valor Total</p>
                        <p className="text-xs font-mono">{format(dataPagamento, 'dd/MM/yyyy')}</p>
                        <p className="text-lg font-bold text-red-600">{formatCurrency(totalPago)}</p>
                    </div>
                </div>
                
                <FormField control={form.control} name="descricao_extrato" render={({ field }) => (
                    <FormItem><FormLabel>Descrição no Extrato</FormLabel><FormControl><Input placeholder="Ex: Pagamento Fornecedor X" {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
                )} />
                
                <FormField control={form.control} name="identificacao" render={({ field }) => (
                    <FormItem><FormLabel>Identificação / Documento (Opcional)</FormLabel><FormControl><Input placeholder="Ex: DOC 12345" {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
                )} />
                
                <FormField control={form.control} name="observacao" render={({ field }) => (
                    <FormItem><FormLabel>Observação (Opcional)</FormLabel><FormControl><Textarea rows={2} placeholder="Observações sobre o pagamento..." {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
                )} />
                
                <Separator />
                
                <h3 className="text-lg font-semibold flex items-center"><FileText className="w-5 h-5 mr-2" /> Comprovante (Opcional)</h3>
                <div className="space-y-2">
                    <Input 
                        type="file" 
                        accept="image/*, application/pdf" 
                        onChange={handleFileChange} 
                        disabled={isSubmitting}
                    />
                    {comprovanteFile && (
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-green-600 flex items-center"><CheckCircle2 className="w-4 h-4 mr-1" /> {comprovanteFile.name}</span>
                            <Button variant="link" size="sm" onClick={handleRemoveFile} disabled={isSubmitting}>
                                <XCircle className="w-4 h-4 mr-1" /> Remover
                            </Button>
                        </div>
                    )}
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" /> Confirmar Pagamento e Extrato
                </Button>
            </form>
        </Form>
    );
};

export default FormExtratoManualCP;