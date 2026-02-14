import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useOwner } from './use-owner';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { NotaFiscal, NFConfig, ParcelaNF } from '@/types/nota-fiscal';
import { v4 as uuidv4 } from 'uuid';
import { formatCurrency } from '@/utils/formatters';

interface NotasFiscaisHook {
    parcelasParaNF: ParcelaNF[];
    notasFiscais: Record<string, NotaFiscal>;
    configNF: NFConfig | null;
    carregando: boolean;
    loadingConfig: boolean;
    refetch: () => void;
    handleUploadNF: (parcela: ParcelaNF, file: File | undefined, numeroNota: string, dataEmissao: Date) => Promise<void>;
    handleSendNF: (nota: NotaFiscal, tipo: 'whatsapp' | 'email' | 'webhook') => Promise<void>;
}

const NF_BUCKET = 'notas-fiscais';

export function useNotasFiscais(
    filtroPeriodo: DateRange | undefined,
    filtroStatus: string,
    filtroTexto: string
): NotasFiscaisHook {
    const { ownerId, ownerType } = useOwner();
    const [parcelasParaNF, setParcelasParaNF] = useState<ParcelaNF[]>([]);
    const [notasFiscais, setNotasFiscais] = useState<Record<string, NotaFiscal>>({});
    const [configNF, setConfigNF] = useState<NFConfig | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const refetch = useCallback(() => {
        setRefreshKey(prev => prev + 1);
    }, []);

    const fetchConfig = useCallback(async () => {
        if (!ownerId) return;
        setLoadingConfig(true);
        
        const { data, error } = await supabase
            .from('configuracoes_emissao_nf')
            .select('*')
            .eq('proprietario_id', ownerId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.error('Erro ao carregar config NF:', error);
        } else if (data) {
            setConfigNF(data as NFConfig);
        } else {
            setConfigNF(null);
        }
        setLoadingConfig(false);
    }, [ownerId]);

    const fetchDados = useCallback(async () => {
        if (!ownerId) return;
        setCarregando(true);

        const tabelaParcelas = ownerType === 'Admin' || ownerType === 'AdminUsuario' ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
        const tabelaContas = ownerType === 'Admin' || ownerType === 'AdminUsuario' ? 'admin_contas_receber' : 'contas_receber';
        const tabelaClientes = ownerType === 'Admin' || ownerType === 'AdminUsuario' ? 'tbl_clientes' : 'clientes';
        const tabelaRecebimentos = ownerType === 'Admin' || ownerType === 'AdminUsuario' ? 'admin_recebimentos' : 'recebimentos';
        const ownerKey = ownerType === 'Admin' || ownerType === 'AdminUsuario' ? 'admin_id' : 'empresa_id';

        try {
            let parcelasQuery = supabase
                .from(tabelaParcelas)
                .select(`
                    id,
                    valor_parcela,
                    data_pagamento,
                    data_vencimento,
                    conta_receber_id,
                    ${tabelaContas} (
                        descricao,
                        cliente_id,
                        clientes: ${tabelaClientes} ( nome, razao_social, documento, telefone, email, id_grupo )
                    )
                `)
                .eq(ownerKey, ownerId)
                .eq('status', 'paga') // Apenas parcelas pagas
                .order('data_pagamento', { ascending: false });

            if (filtroPeriodo?.from) {
                parcelasQuery = parcelasQuery.gte('data_pagamento', format(filtroPeriodo.from, 'yyyy-MM-dd'));
            }
            if (filtroPeriodo?.to) {
                parcelasQuery = parcelasQuery.lte('data_pagamento', format(filtroPeriodo.to, 'yyyy-MM-dd'));
            }

            const { data: parcelasData, error: pError } = await parcelasQuery;
            if (pError) throw pError;

            const parcelasBrutas = (parcelasData || []) as any[];
            const parcelaIds = parcelasBrutas.map(p => p.id);

            if (parcelaIds.length === 0) {
                setParcelasParaNF([]);
                setNotasFiscais({});
                setCarregando(false);
                return;
            }

            // 1. Buscar Notas Fiscais existentes
            const { data: notasData, error: nError } = await supabase
                .from('notas_fiscais')
                .select('*')
                .eq('proprietario_id', ownerId)
                .in('parcela_id', parcelaIds);
            if (nError) throw nError;

            const notasMap = (notasData || []).reduce((acc, nf) => {
                acc[nf.parcela_id] = nf;
                return acc;
            }, {} as Record<string, NotaFiscal>);
            setNotasFiscais(notasMap);
            
            // 2. Buscar dados de recebimento (forma de pagamento)
            const { data: recebimentosData, error: rError } = await supabase
                .from(tabelaRecebimentos)
                .select('parcela_id, forma_pagamento, data_recebimento')
                .in('parcela_id', parcelaIds)
                .order('data_recebimento', { ascending: false });
            if (rError) throw rError;
            
            const recebimentosMap = (recebimentosData || []).reduce((acc, r) => {
                // Mapeia apenas o recebimento mais recente por parcela
                if (!acc[r.parcela_id]) {
                    acc[r.parcela_id] = r;
                }
                return acc;
            }, {} as Record<string, { parcela_id: string, forma_pagamento: string, data_recebimento: string }>);


            let finalParcelas: ParcelaNF[] = [];

            for (const p of parcelasBrutas) {
                const notaExistente = notasMap[p.id];
                const recebimentoInfo = recebimentosMap[p.id];
                
                let shouldInclude = false;

                // --- LÓGICA DE FILTRO ---
                if (filtroStatus === 'todos') {
                    shouldInclude = true;
                } else if (filtroStatus === 'pendente') {
                    if (!notaExistente && !(recebimentoInfo && (
                        recebimentoInfo.forma_pagamento === 'Dinheiro' || 
                        recebimentoInfo.forma_pagamento === 'Bens'
                    ))) {
                        shouldInclude = true;
                    }
                } else if (filtroStatus === 'emitida') {
                    if (notaExistente && notaExistente.status === 'Nota Emitida' && !notaExistente.enviado_email && !notaExistente.enviado_whatsapp) {
                        shouldInclude = true;
                    }
                } else if (filtroStatus === 'enviada') {
                    if (notaExistente && (
                        notaExistente.status === 'Enviada Cliente' || 
                        notaExistente.status === 'Enviada com Sucesso' || 
                        notaExistente.status === 'Erro Envio' ||
                        notaExistente.enviado_email === true || 
                        notaExistente.enviado_whatsapp === true
                    )) {
                        shouldInclude = true;
                    }
                } else if (filtroStatus === 'nao-emitidas') {
                    if (!notaExistente && recebimentoInfo && (
                        recebimentoInfo.forma_pagamento === 'Dinheiro' || 
                        recebimentoInfo.forma_pagamento === 'Bens'
                    )) {
                        shouldInclude = true;
                    }
                } else if (filtroStatus === 'nao-emitir') {
                    if (notaExistente && notaExistente.status === 'NaoEmitir') {
                        shouldInclude = true;
                    }
                }
                // --- FIM LÓGICA DE FILTRO ---

                if (shouldInclude) {
                    const contaReceber = p[tabelaContas];
                    const cliente = contaReceber?.clientes;
                    const clienteNome = cliente?.razao_social || cliente?.nome || 'N/A';
                    const descricao = contaReceber?.descricao || 'N/A';

                    if (!filtroTexto || clienteNome.toLowerCase().includes(filtroTexto) || descricao.toLowerCase().includes(filtroTexto)) {
                        finalParcelas.push({
                            id: p.id,
                            valor_parcela: p.valor_parcela,
                            data_pagamento: p.data_pagamento,
                            data_vencimento: p.data_vencimento,
                            descricao_conta: descricao,
                            cliente_id: contaReceber?.cliente_id,
                            cliente_nome: clienteNome,
                            cliente_telefone: cliente?.telefone,
                            cliente_email: cliente?.email,
                            cliente_id_grupo: cliente?.id_grupo,
                            
                            // NOVOS DADOS
                            forma_pagamento: recebimentoInfo?.forma_pagamento || null,
                            data_recebimento: recebimentoInfo?.data_recebimento || null,
                        });
                    }
                }
            }

            setParcelasParaNF(finalParcelas);

        } catch (error) {
            console.error('Erro ao buscar dados de NF:', error);
            showError('Falha ao carregar dados de Notas Fiscais: ' + (error as Error).message);
            setParcelasParaNF([]);
        } finally {
            setCarregando(false);
        }
    }, [ownerId, ownerType, filtroPeriodo, filtroStatus, filtroTexto, refreshKey]);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    useEffect(() => {
        fetchDados();
    }, [fetchDados]);

    const handleSendNF = useCallback(async (nota: NotaFiscal, tipo: 'whatsapp' | 'email' | 'webhook') => {
        if (!ownerId || !configNF || !nota.anexo_url) return;

        const parcela = parcelasParaNF.find(p => p.id === nota.parcela_id);
        if (!parcela) {
            showError('Dados da parcela não encontrados.');
            return;
        }

        const tags = {
            '{cliente_nome}': parcela.cliente_nome,
            '{numero_nota}': nota.numero_nota || 'N/A',
            '{valor}': formatCurrency(nota.valor),
            '{empresa_nome}': ownerType === 'Admin' ? 'Administrador' : 'Minha Empresa',
            '{link_anexo}': nota.anexo_url,
        };

        try {
            if (tipo === 'webhook' && configNF.webhook_n8n_url) {
                
                const supabaseUrl = supabase.supabaseUrl;
                const urlConfirmacao = `${supabaseUrl}/functions/v1/confirm-nf-delivery`;

                const webhookPayload = {
                    parcela_id: nota.parcela_id,
                    nota_fiscal_id: nota.id,
                    proprietario_id: ownerId,
                    cliente_id: parcela.cliente_id,
                    cliente_nome: parcela.cliente_nome,
                    cliente_email: parcela.cliente_email,
                    cliente_telefone: parcela.cliente_telefone,
                    cliente_id_grupo: parcela.cliente_id_grupo,
                    numero_nota: nota.numero_nota,
                    valor: nota.valor,
                    data_emissao: nota.data_emissao,
                    anexo_url: nota.anexo_url,
                    url_confirmacao: urlConfirmacao,
                };

                const { data, error: invokeError } = await supabase.functions.invoke('send-n8n-webhook', {
                    body: {
                        webhookUrl: configNF.webhook_n8n_url,
                        payload: webhookPayload,
                    },
                });

                if (invokeError) throw invokeError;
                if (!data.success) throw new Error(data.error || 'Erro desconhecido na Edge Function.');
                
                showSuccess('Webhook N8N enviado com sucesso! Aguardando confirmação de envio.');
                
                await supabase.from('notas_fiscais').update({ status: 'Enviada Cliente' }).eq('id', nota.id);

            } else if (tipo === 'whatsapp') {
                if (!parcela.cliente_telefone) throw new Error('Telefone do cliente não cadastrado.');
                
                let message = configNF.template_whatsapp || 'Olá {cliente_nome}! Sua Nota Fiscal Nº {numero_nota} no valor de {valor} foi emitida. Segue o anexo.';
                Object.keys(tags).forEach(tag => {
                    message = message.replace(new RegExp(tag, 'g'), tags[tag as keyof typeof tags] || '');
                });
                
                const telefone = parcela.cliente_telefone.replace(/\D/g, '');
                const url = `https://wa.me/55${telefone}?text=${encodeURIComponent(message)}`;
                
                window.open(url, '_blank');
                showSuccess('Abrindo WhatsApp. Confirme o envio manualmente.');
                
                await supabase.from('notas_fiscais').update({ enviado_whatsapp: true, status: 'Enviada Cliente' }).eq('id', nota.id);

            } else if (tipo === 'email') {
                if (!parcela.cliente_email) throw new Error('Email do cliente não cadastrado.');
                
                let subject = `Nota Fiscal Nº ${nota.numero_nota} - ${formatCurrency(nota.valor)}`;
                let body = configNF.template_email || 'Prezado(a) {cliente_nome},\n\nSua Nota Fiscal Nº {numero_nota} no valor de {valor} foi emitida. Segue o anexo em PDF.\n\nAtenciosamente,\n{empresa_nome}';
                Object.keys(tags).forEach(tag => {
                    body = body.replace(new RegExp(tag, 'g'), tags[tag as keyof typeof tags] || '');
                });
                
                const mailtoLink = `mailto:${parcela.cliente_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                window.open(mailtoLink, '_blank');
                showSuccess('Abrindo cliente de e-mail. Anexe o PDF e envie manualmente.');
                
                await supabase.from('notas_fiscais').update({ enviado_email: true, status: 'Enviada Cliente' }).eq('id', nota.id);
            }
            
            refetch();
        } catch (error: any) {
            showError('Falha no envio: ' + error.message);
        }
    }, [ownerId, configNF, parcelasParaNF, ownerType, refetch]);

    const handleUploadNF = useCallback(async (parcela: ParcelaNF, file: File | undefined, numeroNota: string, dataEmissao: Date) => {
        if (!ownerId) return;

        setCarregando(true);
        try {
            let finalAnexoUrl = notasFiscais[parcela.id]?.anexo_url || null;
            
            if (file) {
                const fileExt = file.name.split('.').pop();
                const filePath = `${ownerId}/${parcela.id}/nf-${numeroNota}-${uuidv4().substring(0, 4)}.${fileExt}`;
                
                const { error: uploadError } = await supabase.storage
                    .from(NF_BUCKET)
                    .upload(filePath, file, { upsert: true });

                if (uploadError) throw uploadError;

                const { data: { publicUrl: newUrl } } = supabase.storage.from(NF_BUCKET).getPublicUrl(filePath);
                finalAnexoUrl = `${newUrl}?t=${Date.now()}`;
            }

            if (!finalAnexoUrl) {
                throw new Error('Nenhum arquivo anexado e nenhuma URL anterior encontrada.');
            }
            
            const dataToSave: Partial<NotaFiscal> = {
                proprietario_id: ownerId,
                parcela_id: parcela.id,
                status: 'Nota Emitida',
                numero_nota: numeroNota,
                valor: parcela.valor_parcela,
                data_emissao: format(dataEmissao, 'yyyy-MM-dd'),
                anexo_url: finalAnexoUrl,
                editada: !!notasFiscais[parcela.id],
            };

            const { data: notaSalva, error: dbError } = await supabase
                .from('notas_fiscais')
                .upsert(dataToSave, { onConflict: 'parcela_id' })
                .select()
                .single();
            
            if (dbError) throw dbError;

            showSuccess('Nota Fiscal anexada e status atualizado para "Nota Emitida"!');
            
            if (configNF?.webhook_n8n_url) {
                // **A CORREÇÃO:** Em vez de passar o `notaSalva` que pode estar obsoleto,
                // criamos um novo objeto com a URL garantidamente correta.
                const notaParaEnvio: NotaFiscal = {
                    ...(notaSalva as NotaFiscal),
                    anexo_url: finalAnexoUrl,
                };
                await handleSendNF(notaParaEnvio, 'webhook');
            }
            
            refetch();
        } catch (error: any) {
            showError('Falha ao anexar NF: ' + error.message);
        } finally {
            setCarregando(false);
        }
    }, [ownerId, refetch, configNF, handleSendNF, notasFiscais]);

    return {
        parcelasParaNF,
        notasFiscais,
        configNF,
        carregando,
        loadingConfig,
        refetch,
        handleUploadNF,
        handleSendNF,
    };
}