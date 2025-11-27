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

// Função local para formatar moeda
const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Nome do bucket de armazenamento para comprovantes
const COMPROVANTE_BUCKET = 'comprovantes-financeiros'; 

interface ParcelaParaRecebimento {
    id: string;
    conta_receber_id: string;
    empresa_id: string; // ID do Admin/Cliente
    valor_parcela: number;
    valor_pago: number;
    cliente_id: string | null;
}

interface RecebimentoDetalhe {
    conta_id: string;
    valor_recebido: number;
}

interface FormExtratoManualCRProps {
    parcela: ParcelaParaRecebimento;
    recebimentoDetalhes: RecebimentoDetalhe; // Simplificado para um único recebimento
    formaPagamento: string;
    dataPagamento: Date;
    historicoId: string | null;
    contaPatrimonialId: string | null;
    contasDestino: SaldoCalculado[];
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

const FormExtratoManualCR: React.FC<FormExtratoManualCRProps> = ({
    parcela,
    recebimentoDetalhes,
    formaPagamento,
    dataPagamento,
    historicoId,
    contaPatrimonialId,
    contasDestino,
    onSaveComplete,
    onClose,
}) => {
    const { role, usuario, perfil } = useSessao();
    const isAdmin = role === 'Admin';
    
    const [loading, setLoading] = useState(false);
    const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    
    // CORREÇÃO: O ownerId para RLS é o ID do usuário logado (Admin/Cliente) ou o cliente_id (Usuário)
    const ownerId = usuario?.id;
    const proprietarioDaSessao = isAdmin ? usuario?.id : (perfil as any)?.cliente_id || (perfil as any)?.id;

    const valorRecebido = recebimentoDetalhes.valor_recebido;
    const contaDestinoId = recebimentoDetalhes.conta_id;
    
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            descricao_extrato: `Recebimento CR: ${parcela.id.substring(0, 8)} - ${formaPagamento}`,
            identificacao: '',
            observacao: '',
            comprovante_url: '',
        },
    });
    
    const uploadComprovante = async (file: File, parcelaId: string): Promise<string> => {
        setIsUploading(true);
        
        const fileExt = file.name.split('.').pop();
        const fileName = `${ownerId}/${parcelaId}/comprovantes-cr/${Date.now()}.${fileExt}`;
        
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
        if (!proprietarioDaSessao) {
            showError('ID do proprietário da sessão não encontrado.');
            return;
        }
        
        setLoading(true);

        const tabelaRecebimentos = isAdmin ? 'admin_recebimentos' : 'recebimentos';
        const tabelaParcelas = isAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
        const tabelaContasReceber = isAdmin ? 'admin_contas_receber' : 'contas_receber';
        
        const valorPagoAnterior = parcela.valor_pago || 0;
        const novoValorPagoTotal = valorPagoAnterior + valorRecebido;
        const saldoRestanteCalculado = parcela.valor_parcela - novoValorPagoTotal;
        const quitouComPagamentoAtual = novoValorPagoTotal >= parcela.valor_parcela;
        
        try {
            let comprovanteUrl: string | null = values.comprovante_url || null;

            // 1. Upload do comprovante (se houver arquivo)
            if (comprovanteFile) {
                comprovanteUrl = await uploadComprovante(comprovanteFile, parcela.id);
            }
            
            // 2. Buscar a Conta Sintética para obter a conta de Receita (DRE)
            const { data: contaSintetica, error: csError } = await supabase
                .from(tabelaContasReceber)
                .select('descricao, id_conta_resultado')
                .eq('id', parcela.conta_receber_id)
                .single();
                
            if (csError) throw csError;
            const descricaoContaSintetica = contaSintetica?.descricao || 'Recebimento';
            const contaReceitaResultado = contaSintetica?.id_conta_resultado; // Conta de Receita (DRE)
            
            const dataPagamentoISO = format(dataPagamento, 'yyyy-MM-dd') + 'T12:00:00Z';
            
            // 3. Inserir o registro na tabela 'extratos' (apenas para contas do tipo 'Banco')
            const contaDestinoDetalhe = contasDestino.find(c => c.id === contaDestinoId);
            
            const extratosPayload = [];
            
            // CRÍTICO: Apenas se for uma conta de BANCO
            if (contaDestinoDetalhe?.plano_contas?.is_banco) { 
                // O valor no extrato é sempre o valor real (positivo para Entrada)
                const valorExtrato = Math.abs(valorRecebido); 
                
                // Busca a conta contábil de recebimento (se for Admin)
                const contaContabilRecebimento = isAdmin 
                    ? (await supabase.from('configuracao_contas_receber').select('conta_contabil_id').eq('proprietario_id', proprietarioDaSessao).eq('tipo_registro', 'recebimento').single()).data?.conta_contabil_id 
                    : null;
                
                extratosPayload.push({
                    empresa_id: proprietarioDaSessao, // CORREÇÃO: Usando o ID do proprietário da sessão
                    id_saldo_contas: contaDestinoId,
                    data: format(dataPagamento, 'yyyy-MM-dd'),
                    descricao: values.descricao_extrato,
                    valor: valorExtrato,
                    tipo: 'Entrada' as const,
                    identificacao: values.identificacao || null,
                    conciliado: false, // Começa como não conciliado
                    conta_contabil_id: contaContabilRecebimento, // Mapeia para a conta de Recebimento (Ativo/Passivo)
                });
            }
            
            if (extratosPayload.length > 0) {
                const { error: extratoError } = await supabase.from('extratos').insert(extratosPayload);
                if (extratoError) throw extratoError;
            }
            
            // 4. Continuar com o fluxo de recebimento (Registrar Recebimento e Lançamentos)
            
            // 4.1. Buscar contas contábeis necessárias para o lançamento
            const contaRecebimento = isAdmin 
                ? (await supabase.from('configuracao_contas_receber').select('conta_contabil_id').eq('proprietario_id', proprietarioDaSessao).eq('tipo_registro', 'recebimento').single()).data?.conta_contabil_id 
                : null;
            const contaParcela = isAdmin 
                ? (await supabase.from('configuracao_contas_receber').select('conta_contabil_id').eq('proprietario_id', proprietarioDaSessao).eq('tipo_registro', 'parcela').single()).data?.conta_contabil_id 
                : null;
            
            // 4.2. Registrar o recebimento (Histórico)
            let recebimentoBasePayload;
            if (isAdmin) {
                recebimentoBasePayload = { 
                    parcela_id: parcela.id, 
                    admin_id: proprietarioDaSessao, 
                    valor_recebido: valorRecebido, 
                    cliente_id: parcela.cliente_id || parcela.empresa_id,
                    conta_id: contaDestinoId,
                    id_conta_contabil: contaRecebimento,
                    historico_id: historicoId,
                    id_conta_resultado: contaReceitaResultado,
                    observacao: values.observacao || null,
                    anexo_url: comprovanteUrl, // Adiciona a URL do comprovante
                };
            } else {
                recebimentoBasePayload = { 
                    parcela_id: parcela.id, 
                    empresa_id: proprietarioDaSessao, 
                    valor_recebido: valorRecebido,
                    conta_id: contaDestinoId,
                    id_conta_resultado: contaReceitaResultado,
                    observacao: values.observacao || null,
                    anexo_url: comprovanteUrl, // Adiciona a URL do comprovante
                };
            }
            
            const { error: recebimentoError } = await supabase.from(tabelaRecebimentos).insert({
                ...recebimentoBasePayload,
                data_recebimento: dataPagamentoISO,
                forma_pagamento: formaPagamento,
                tipo_recebimento: quitouComPagamentoAtual ? 'total' : 'parcial',
            });
            
            if (recebimentoError) throw recebimentoError;
            
            // 4.3. Atualizar a parcela
            await supabase.from(tabelaParcelas).update({
                status: 'paga',
                valor_pago: novoValorPagoTotal,
                data_pagamento: format(dataPagamento, 'yyyy-MM-dd'),
                ...(isAdmin && { id_conta_contabil: contaParcela })
            }).eq('id', parcela.id);
            
            // 4.4. Lançamento no Ativo (Caixa/Banco) - DÉBITO (Entrada)
            const contaContabilCaixaBanco = contaDestinoDetalhe?.plano_contas?.id;
            if (!contaContabilCaixaBanco) throw new Error('Conta de destino não possui vínculo contábil.');
            
            const lancamentoAtivoPayload = {
                proprietario_id: proprietarioDaSessao,
                data_movimentacao: dataPagamentoISO,
                descricao: `Recebimento Parcela ${parcela.id} - ${formaPagamento}`,
                valor: valorRecebido,
                tipo: 'Entrada' as const,
                conta_bancaria_id: contaDestinoId,
                conta_contabil_id: contaContabilCaixaBanco,
                historico_id: historicoId,
                origem: 'recebimento_manual',
            };
            await supabase.from('lancamentos').insert(lancamentoAtivoPayload);
            
            // 4.5. Lançamento de Estorno da Conta Patrimonial (Direito a Receber) - CRÉDITO (Passivo)
            if (contaPatrimonialId) {
                const lancamentoPatrimonialPayload = {
                    proprietario_id: proprietarioDaSessao,
                    data_movimentacao: dataPagamentoISO,
                    descricao: `Estorno Patrimonial CR: ${descricaoContaSintetica} (CR ID: ${parcela.conta_receber_id.substring(0, 8)})`,
                    valor: valorRecebido,
                    tipo: 'Saida' as const,
                    conta_bancaria_id: null,
                    conta_contabil_id: contaPatrimonialId,
                    historico_id: historicoId,
                    origem: 'recebimento_manual',
                };
                await supabase.from('lancamentos').insert(lancamentoPatrimonialPayload);
            }

            showSuccess('Recebimento e Extrato registrados com sucesso!');
            onSaveComplete();
            onClose();

        } catch (error: any) {
            console.error('Erro no fluxo de recebimento/extrato:', error);
            showError(`Falha ao registrar recebimento: ${error.message}`);
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
                        <p className="text-sm font-medium">Conta de Destino</p>
                        <p className="text-xs font-mono">{contasDestino.find(c => c.id === contaDestinoId)?.nome}</p>
                    </div>
                    <div className="space-y-2 p-3 bg-secondary rounded-md">
                        <p className="text-sm font-medium">Data / Valor Recebido</p>
                        <p className="text-xs font-mono">{format(dataPagamento, 'dd/MM/yyyy')}</p>
                        <p className="text-lg font-bold text-green-600">{formatCurrency(valorRecebido)}</p>
                    </div>
                </div>
                
                <FormField control={form.control} name="descricao_extrato" render={({ field }) => (
                    <FormItem><FormLabel>Descrição no Extrato</FormLabel><FormControl><Input placeholder="Ex: Recebimento Cliente X" {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
                )} />
                
                <FormField control={form.control} name="identificacao" render={({ field }) => (
                    <FormItem><FormLabel>Identificação / Documento (Opcional)</FormLabel><FormControl><Input placeholder="Ex: PIX 12345" {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
                )} />
                
                <FormField control={form.control} name="observacao" render={({ field }) => (
                    <FormItem><FormLabel>Observação (Opcional)</FormLabel><FormControl><Textarea rows={2} placeholder="Observações sobre o recebimento..." {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
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
                    <Save className="mr-2 h-4 w-4" /> Confirmar Recebimento e Extrato
                </Button>
            </form>
        </Form>
    );
};

export default FormExtratoManualCR;