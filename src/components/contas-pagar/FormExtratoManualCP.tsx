import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Save, Upload, FileText, XCircle, CheckCircle2, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { AdminParcelaPagar } from '@/types/contas-pagar';
import { SaldoCalculado } from '@/hooks/use-saldo-conta-calculado';
import { Textarea } from '../ui/textarea';
import { Separator } from "@/components/ui/separator";
import { useSessao } from '@/hooks/use-sessao';
import { PlanoContas } from '@/types/plano-contas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useOwner } from '@/hooks/use-owner';

const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const COMPROVANTE_BUCKET = 'comprovantes-financeiros'; 

interface DescricaoExtrato {
    id: string;
    descricao: string;
    status: boolean;
    ordem: number;
}

interface IdentificacaoExtrato {
    id: string;
    descricao: string;
    status: boolean;
    ordem: number;
}

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
    conta_despesa_excedente_id?: string | null;
    descricao_excedente?: string;
    parentValues?: {
        acao_saldo_restante?: 'desconto' | 'reprogramar' | 'parcelar';
        nova_data_vencimento?: Date;
        numero_novas_parcelas?: number;
        intervalo_dias_novas_parcelas?: number;
        salvar_como_padrao?: boolean;
    };
}

const formSchema = z.object({
    descricao_extrato: z.string().min(1, 'A descrição é obrigatória.'),
    identificacao: z.string().optional().or(z.literal('')),
    observacao: z.string().optional().or(z.literal('')),
    comprovante_url: z.string().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

interface FormNovoItemProps {
    tipo: 'descricao' | 'identificacao';
    proprietarioId: string;
    isAdmin: boolean;
    proximaOrdem: number;
    onSaveComplete: (novoId: string) => void;
    onClose: () => void;
}

const FormNovoItem: React.FC<FormNovoItemProps> = ({ tipo, proprietarioId, isAdmin, proximaOrdem, onSaveComplete, onClose }) => {
    const [descricao, setDescricao] = useState('');
    const [status, setStatus] = useState(true);
    const [ordem, setOrdem] = useState(proximaOrdem);
    const [loading, setLoading] = useState(false);

    const tabela = isAdmin 
        ? (tipo === 'descricao' ? 'admin_descricao_extrato' : 'admin_identificacao_extrato')
        : (tipo === 'descricao' ? 'descricao_extrato' : 'identificacao_extrato');
    const campoId = isAdmin ? 'admin_id' : 'empresa_id';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!descricao.trim()) {
            showError('O campo é obrigatório.');
            return;
        }
        setLoading(true);

        const dataToSave = {
            descricao: descricao.trim(),
            status,
            ordem,
            [campoId]: proprietarioId,
        };

        const { data, error } = await supabase.from(tabela).insert(dataToSave).select('id').single();

        if (error) {
            showError(`Falha ao salvar: ${error.message}`);
        } else {
            showSuccess(`${tipo === 'descricao' ? 'Descrição' : 'Identificador'} salvo com sucesso!`);
            onSaveComplete(data.id);
        }
        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="descricao">{tipo === 'descricao' ? 'Descrição' : 'Identificador'}</Label>
                <Input
                    id="descricao"
                    placeholder={tipo === 'descricao' ? "Ex: Pagamento Fornecedor X" : "Ex: PIX, TED, DOC, Boleto"}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    disabled={loading}
                    autoFocus
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="ordem">Ordem</Label>
                    <Input
                        id="ordem"
                        type="number"
                        min={0}
                        value={ordem}
                        onChange={(e) => setOrdem(parseInt(e.target.value) || 0)}
                        disabled={loading}
                    />
                </div>
                <div className="flex items-center space-x-2 pt-6">
                    <Switch id="status" checked={status} onCheckedChange={setStatus} disabled={loading} />
                    <Label htmlFor="status">Ativo</Label>
                </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar'}
            </Button>
        </form>
    );
};

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
    conta_despesa_excedente_id,
    descricao_excedente,
    parentValues,
}) => {
    const { ownerId, ownerType } = useOwner();
    
    const [loading, setLoading] = useState(false);
    const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    
    const [descricoes, setDescricoes] = useState<DescricaoExtrato[]>([]);
    const [identificadores, setIdentificadores] = useState<IdentificacaoExtrato[]>([]);
    const [loadingDescricoes, setLoadingDescricoes] = useState(true);
    const [loadingIdentificadores, setLoadingIdentificadores] = useState(true);
    
    const [dialogNovaDescricao, setDialogNovaDescricao] = useState(false);
    const [dialogNovoIdentificador, setDialogNovoIdentificador] = useState(false);
    
    const adminId = parcela.admin_id;
    const proprietarioDaSessao = ownerId;
    const totalPago = pagamentoDetalhes.reduce((sum, p) => sum + p.valor_pago, 0);
    
    const contaPagamento = mapeamentoContabil['pagamento'];
    const contaParcelaPagar = mapeamentoContabil['parcela_pagar'];
    const contaDescontoObtido = mapeamentoContabil['desconto_obtido'];
    
    const isSupervisao = ownerType === 'Admin' || ownerType === 'AdminUsuario';
    const tabelaDescricao = isSupervisao ? 'admin_descricao_extrato' : 'descricao_extrato';
    const tabelaIdentificacao = isSupervisao ? 'admin_identificacao_extrato' : 'identificacao_extrato';
    
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            descricao_extrato: '',
            identificacao: '',
            observacao: '',
            comprovante_url: '',
            acao_saldo_restante: 'reprogramar',
            nova_data_vencimento: addDays(new Date(), 30),
            numero_novas_parcelas: 2,
            intervalo_dias_novas_parcelas: 30,
        },
    });
    
    const carregarDescricoes = useCallback(async () => {
        if (!proprietarioDaSessao) return;
        setLoadingDescricoes(true);
        const { data, error } = await supabase
            .from(tabelaDescricao)
            .select('*')
            .eq('status', true)
            .order('ordem', { ascending: true });
        if (!error) setDescricoes(data || []);
        setLoadingDescricoes(false);
    }, [proprietarioDaSessao, tabelaDescricao]);
    
    const carregarIdentificadores = useCallback(async () => {
        if (!proprietarioDaSessao) return;
        setLoadingIdentificadores(true);
        const { data, error } = await supabase
            .from(tabelaIdentificacao)
            .select('*')
            .eq('status', true)
            .order('ordem', { ascending: true });
        if (!error) setIdentificadores(data || []);
        setLoadingIdentificadores(false);
    }, [proprietarioDaSessao, tabelaIdentificacao]);
    
    useEffect(() => {
        carregarDescricoes();
        carregarIdentificadores();
    }, [carregarDescricoes, carregarIdentificadores]);
    
    const handleNovaDescricaoSalva = (novoId: string) => {
        setDialogNovaDescricao(false);
        carregarDescricoes();
        setTimeout(() => {
            supabase.from(tabelaDescricao).select('descricao').eq('id', novoId).single().then(({ data }) => {
                if (data) form.setValue('descricao_extrato', data.descricao);
            });
        }, 100);
    };
    
    const handleNovoIdentificadorSalvo = (novoId: string) => {
        setDialogNovoIdentificador(false);
        carregarIdentificadores();
        setTimeout(() => {
            supabase.from(tabelaIdentificacao).select('descricao').eq('id', novoId).single().then(({ data }) => {
                if (data) form.setValue('identificacao', data.descricao);
            });
        }, 100);
    };
    
    const uploadComprovante = async (file: File, parcelaId: string): Promise<string> => {
        setIsUploading(true);
        const fileExt = file.name.split('.').pop();
        const fileName = `${adminId}/${parcelaId}/comprovantes-cp/${Date.now()}.${fileExt}`;
        try {
            const { data, error: uploadError } = await supabase.storage
                .from(COMPROVANTE_BUCKET)
                .upload(fileName, file, { cacheControl: '3600', upsert: false });
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
        if (!values.descricao_extrato) {
            showError('Selecione uma descrição para o extrato.');
            return;
        }
        
        setLoading(true);

        const tabelaPagamentos = isSupervisao ? 'admin_pagamentos' : 'pagamentos';
        const tabelaParcelas = isSupervisao ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar';
        const tabelaContasPagar = isSupervisao ? 'admin_contas_pagar' : 'contas_pagar';
        
        const valorPagoAnterior = parcela.valor_pago || 0;
        const saldoDevedor = parcela.valor_parcela - valorPagoAnterior;
        const valorQuitado = Math.min(totalPago, saldoDevedor);
        const novoValorPagoTotal = valorPagoAnterior + valorQuitado;
        const saldoRestanteCalculado = parcela.valor_parcela - novoValorPagoTotal;
        const isPagamentoParcial = saldoRestanteCalculado > 0.01;
        
        const acaoSaldoRestante = parentValues?.acao_saldo_restante;
        
        try {
            let comprovanteUrl: string | null = values.comprovante_url || null;

            if (comprovanteFile) {
                comprovanteUrl = await uploadComprovante(comprovanteFile, parcela.id);
            }
            
            const { data: contaSintetica, error: csError } = await supabase
                .from(tabelaContasPagar)
                .select(`id_conta_patrimonial, descricao, id_conta_resultado`)
                .eq('id', parcela.conta_pagar_id)
                .single();
                
            if (csError) throw csError;
            const contaPatrimonial = contaSintetica?.id_conta_patrimonial;
            const descricaoContaSintetica = contaSintetica?.descricao || 'Pagamento';
            const contaDespesaCriacao = contaSintetica?.id_conta_resultado;
            
            const dataPagamentoLocal = dataPagamento;
            const dataNoonUTC = new Date(Date.UTC(dataPagamentoLocal.getFullYear(), dataPagamentoLocal.getMonth(), dataPagamentoLocal.getDate(), 12, 0, 0));
            const dataPagamentoISO = dataNoonUTC.toISOString();
            
            const ownerKey = isSupervisao ? 'admin_id' : 'empresa_id';
            
            const extratosPayload = pagamentoDetalhes
                .map(p => {
                    const contaOrigem = contasOrigem.find(c => c.id === p.conta_id);
                    if (!contaOrigem?.plano_contas?.is_banco) return null; 
                    const valorExtrato = -Math.abs(p.valor_pago); 
                    const contaContabilPagamento = isSupervisao ? mapeamentoContabil['pagamento'] : null;
                    return {
                        empresa_id: proprietarioDaSessao,
                        id_saldo_contas: p.conta_id,
                        data: format(dataPagamentoLocal, 'yyyy-MM-dd'),
                        descricao: values.descricao_extrato,
                        valor: valorExtrato,
                        tipo: 'Saida' as const,
                        identificacao: (values.identificacao && values.identificacao !== '__nenhum__') ? values.identificacao : null,
                        conciliado: false,
                        conta_contabil_id: contaContabilPagamento,
                        id_parcela_pg: parcela.id,
                    };
                })
                .filter(e => e !== null);
                
            if (extratosPayload.length > 0) {
                const { error: extratoError } = await supabase.from('extratos').insert(extratosPayload);
                if (extratoError) throw extratoError;
            }
            
            const valorExcedente = totalPago - valorQuitado;

            console.log('[DEBUG FormExtratoManualCP]', { totalPago, saldoDevedor, valorQuitado, valorExcedente, conta_despesa_excedente_id });

            const lancamentosPayload: any[] = [];
            const origemVincular = `pagamento_cp:${parcela.id}`;
            const idBancoCredito = crypto.randomUUID();

            for (const pagamento of pagamentoDetalhes) {
                const pagamentoPayload = { 
                    parcela_id: parcela.id, 
                    [ownerKey]: proprietarioDaSessao, 
                    valor_pago: valorQuitado, 
                    conta_id: pagamento.conta_id,
                    id_conta_contabil: contaPagamento,
                    data_pagamento: dataPagamentoISO,
                    forma_pagamento: formaPagamento,
                    tipo_pagamento: isPagamentoParcial ? 'parcial' : 'total',
                    historico_id: historicoId,
                    id_conta_resultado: contaDespesaCriacao,
                    anexo_url: comprovanteUrl,
                    observacao: values.observacao || null,
                };
                
                const { error: pagamentoError } = await supabase.from(tabelaPagamentos).insert(pagamentoPayload);
                if (pagamentoError) throw pagamentoError;
                
                const contaDestinoDetalhe = contasOrigem.find(c => c.id === pagamento.conta_id);
                const contaContabilCaixaBanco = contaDestinoDetalhe?.plano_contas?.id;
                
                if (!contaContabilCaixaBanco) throw new Error('Conta de origem não possui vínculo contábil.');
                
                const idPatrimonial = crypto.randomUUID();
                
                if (contaPatrimonial) {
                    lancamentosPayload.push({
                        id: idPatrimonial,
                        proprietario_id: proprietarioDaSessao,
                        data_movimentacao: dataPagamentoISO,
                        descricao: `Baixa Passivo CP: ${descricaoContaSintetica} (CP ID: ${parcela.conta_pagar_id.substring(0, 8)})`,
                        valor: valorQuitado,
                        tipo: 'Entrada' as const,
                        conta_bancaria_id: null,
                        conta_contabil_id: contaPatrimonial,
                        origem: origemVincular,
                        documento: parcela.id,
                        historico_id: historicoId,
                        conta_resultado_id: idBancoCredito,
                    });
                }

                if (valorExcedente > 0.01 && conta_despesa_excedente_id) {
                    const idDespesa = crypto.randomUUID();
                    lancamentosPayload.push({
                        id: idDespesa,
                        proprietario_id: proprietarioDaSessao,
                        data_movimentacao: dataPagamentoISO,
                        descricao: descricao_excedente?.trim() || `Excedente CP: ${parcela.fornecedor} (Parcela ${parcela.numero_parcela})`,
                        valor: valorExcedente,
                        tipo: 'Entrada' as const,
                        conta_bancaria_id: null,
                        conta_contabil_id: conta_despesa_excedente_id,
                        origem: `excedente_cp:${parcela.id}`,
                        documento: parcela.id,
                        historico_id: historicoId,
                        conta_resultado_id: idBancoCredito,
                    });
                }

                lancamentosPayload.push({
                    id: idBancoCredito,
                    proprietario_id: proprietarioDaSessao,
                    data_movimentacao: dataPagamentoISO,
                    descricao: `Pagamento Parcela ${parcela.id.substring(0, 8)} - ${parcela.fornecedor}`,
                    valor: totalPago,
                    tipo: 'Saida' as const,
                    conta_bancaria_id: pagamento.conta_id,
                    conta_contabil_id: contaContabilCaixaBanco,
                    origem: origemVincular,
                    documento: parcela.id,
                    historico_id: historicoId,
                    conta_resultado_id: lancamentosPayload.length > 0 ? lancamentosPayload[0].id : null,
                });
            }
            
            let finalStatus: AdminParcelaPagar['status'] = 'paga';
            let observacaoFinal: string | null = values.observacao || null;
            
            if (isPagamentoParcial) {
                if (acaoSaldoRestante === 'desconto') {
                    finalStatus = 'paga';
                    observacaoFinal = `Pago R$ ${novoValorPagoTotal.toFixed(2)} com R$ ${saldoRestanteCalculado.toFixed(2)} de desconto. ${values.observacao || ''}`;
                    
                    if (contaDescontoObtido && contaPatrimonial) {
                        const idDescontoReceita = crypto.randomUUID();
                        const idDescontoPassivo = crypto.randomUUID();

                        const lancamentoDescontoPassivoPayload = {
                            id: idDescontoPassivo,
                            proprietario_id: proprietarioDaSessao,
                            data_movimentacao: dataPagamentoISO,
                            descricao: `Baixa Passivo Desconto CP: ${descricaoContaSintetica} (CP ID: ${parcela.conta_pagar_id.substring(0, 8)})`,
                            valor: saldoRestanteCalculado,
                            tipo: 'Entrada' as const,
                            conta_bancaria_id: null,
                            conta_contabil_id: contaPatrimonial,
                            origem: `desconto_cp:${parcela.id}`,
                            documento: parcela.id,
                            historico_id: historicoId,
                            conta_resultado_id: idDescontoReceita,
                        };
                        lancamentosPayload.push(lancamentoDescontoPassivoPayload);

                        const lancamentoDescontoReceitaPayload = {
                            id: idDescontoReceita,
                            proprietario_id: proprietarioDaSessao,
                            data_movimentacao: dataPagamentoISO,
                            descricao: `Desconto Obtido: ${descricaoContaSintetica} (CP ID: ${parcela.conta_pagar_id.substring(0, 8)})`,
                            valor: saldoRestanteCalculado,
                            tipo: 'Saida' as const,
                            conta_bancaria_id: null,
                            conta_contabil_id: contaDescontoObtido,
                            origem: `desconto_cp:${parcela.id}`,
                            documento: parcela.id,
                            historico_id: historicoId,
                            conta_resultado_id: idDescontoPassivo,
                        };
                        lancamentosPayload.push(lancamentoDescontoReceitaPayload);
                    }
                    
                } else if (acaoSaldoRestante === 'reprogramar' || acaoSaldoRestante === 'parcelar') {
                    finalStatus = 'paga';
                    observacaoFinal = `Pago R$ ${novoValorPagoTotal.toFixed(2)} com R$ ${saldoRestanteCalculado.toFixed(2)} ${acaoSaldoRestante === 'reprogramar' ? 'reprogramado' : 'parcelado'}. ${values.observacao || ''}`;
                    
                    const baseParcelaPayload = { [ownerKey]: proprietarioDaSessao, id_conta_contabil: contaParcelaPagar };
                    
                    if (acaoSaldoRestante === 'reprogramar') {
                        await supabase.from(tabelaParcelas).insert({
                            conta_pagar_id: parcela.conta_pagar_id,
                            ...baseParcelaPayload,
                            numero_parcela: 99,
                            valor_parcela: saldoRestanteCalculado,
                            data_vencimento: format(parentValues?.nova_data_vencimento!, 'yyyy-MM-dd'),
                            status: 'reprogramada'
                        });
                    } else {
                        const valorNovaParcela = saldoRestanteCalculado / parentValues?.numero_novas_parcelas!;
                        const novasParcelas = Array.from({ length: parentValues?.numero_novas_parcelas! }).map((_, i) => ({
                            conta_pagar_id: parcela.conta_pagar_id,
                            ...baseParcelaPayload,
                            numero_parcela: 100 + i,
                            valor_parcela: valorNovaParcela,
                            data_vencimento: format(addDays(parentValues?.nova_data_vencimento!, i * parentValues?.intervalo_dias_novas_parcelas!), 'yyyy-MM-dd'),
                            status: 'reprogramada',
                        }));
                        await supabase.from(tabelaParcelas).insert(novasParcelas);
                    }
                } else {
                    finalStatus = 'parcial';
                }
            }
            
            const { error: lancamentoError } = await supabase.from('lancamentos').insert(lancamentosPayload);
            if (lancamentoError) throw lancamentoError;

            await supabase.from(tabelaParcelas).update({
                status: finalStatus,
                valor_pago: (parcela.valor_pago || 0) + totalPago,
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
            
            if (parentValues?.salvar_como_padrao && historicoId) {
                await supabase
                    .from('configuracao_historico_padrao')
                    .delete()
                    .eq('proprietario_id', proprietarioId)
                    .eq('tipo_registro', 'pagamento_padrao');
                    
                await supabase.from('configuracao_historico_padrao').insert({
                    proprietario_id: proprietarioId,
                    tipo_registro: 'pagamento_padrao',
                    historico_id: historicoId,
                });
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
    const proximaOrdemDescricao = descricoes.length > 0 ? Math.max(...descricoes.map(d => d.ordem)) + 1 : 0;
    const proximaOrdemIdentificador = identificadores.length > 0 ? Math.max(...identificadores.map(i => i.ordem)) + 1 : 0;

    return (
        <>
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
                            <p className="text-sm font-medium">Data / Valor Pago</p>
                            <p className="text-xs font-mono">{format(dataPagamento, 'dd/MM/yyyy')}</p>
                            <p className="text-lg font-bold text-red-600">{formatCurrency(totalPago)}</p>
                        </div>
                    </div>
                    
                    <FormField control={form.control} name="descricao_extrato" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Descrição no Extrato</FormLabel>
                            <div className="flex gap-2">
                                <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || loadingDescricoes}>
                                    <FormControl>
                                        <SelectTrigger className="flex-1">
                                            <SelectValue placeholder={loadingDescricoes ? "Carregando..." : "Selecione uma descrição"} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {descricoes.map(d => (
                                            <SelectItem key={d.id} value={d.descricao}>{d.descricao}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button type="button" variant="outline" size="icon" onClick={() => setDialogNovaDescricao(true)} disabled={isSubmitting}>
                                    <PlusCircle className="h-4 w-4" />
                                </Button>
                            </div>
                            <FormMessage />
                        </FormItem>
                    )} />
                    
                    <FormField control={form.control} name="identificacao" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Identificação / Documento (Opcional)</FormLabel>
                            <div className="flex gap-2">
                                <Select onValueChange={field.onChange} value={field.value || undefined} disabled={isSubmitting || loadingIdentificadores}>
                                    <FormControl>
                                        <SelectTrigger className="flex-1">
                                            <SelectValue placeholder={loadingIdentificadores ? "Carregando..." : "Selecione um identificador (opcional)"} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="__nenhum__">Nenhum</SelectItem>
                                        {identificadores.map(i => (
                                            <SelectItem key={i.id} value={i.descricao}>{i.descricao}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button type="button" variant="outline" size="icon" onClick={() => setDialogNovoIdentificador(true)} disabled={isSubmitting}>
                                    <PlusCircle className="h-4 w-4" />
                                </Button>
                            </div>
                            <FormMessage />
                        </FormItem>
                    )} />
                    
                    <FormField control={form.control} name="observacao" render={({ field }) => (
                        <FormItem><FormLabel>Observação (Opcional)</FormLabel><FormControl><Textarea rows={2} placeholder="Observações sobre o pagamento..." {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
                    )} />
                    
                    <Separator />
                    
                    <h3 className="text-lg font-semibold flex items-center"><FileText className="w-5 h-5 mr-2" /> Comprovante (Opcional)</h3>
                    <div className="space-y-2">
                        <Input type="file" accept="image/*, application/pdf" onChange={handleFileChange} disabled={isSubmitting} />
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
            
            <Dialog open={dialogNovaDescricao} onOpenChange={setDialogNovaDescricao}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Nova Descrição</DialogTitle></DialogHeader>
                    {proprietarioDaSessao && (
                        <FormNovoItem
                            tipo="descricao"
                            proprietarioId={proprietarioDaSessao}
                            isAdmin={isSupervisao}
                            proximaOrdem={proximaOrdemDescricao}
                            onSaveComplete={handleNovaDescricaoSalva}
                            onClose={() => setDialogNovaDescricao(false)}
                        />
                    )}
                </DialogContent>
            </Dialog>
            
            <Dialog open={dialogNovoIdentificador} onOpenChange={setDialogNovoIdentificador}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Novo Identificador</DialogTitle></DialogHeader>
                    {proprietarioDaSessao && (
                        <FormNovoItem
                            tipo="identificacao"
                            proprietarioId={proprietarioDaSessao}
                            isAdmin={isSupervisao}
                            proximaOrdem={proximaOrdemIdentificador}
                            onSaveComplete={handleNovoIdentificadorSalvo}
                            onClose={() => setDialogNovoIdentificador(false)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
};

export default FormExtratoManualCP;