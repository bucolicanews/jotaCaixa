import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useOwner } from './use-owner';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { NotaFiscal, NFConfig, ParcelaNF } from '@/types/nota-fiscal'; // Importando tipos
import { v4 as uuidv4 } from 'uuid';

interface NotasFiscaisHook {
    parcelasParaNF: ParcelaNF[];
    notasFiscais: NotaFiscal[];
    configNF: NFConfig | null;
    carregando: boolean;
    loadingConfig: boolean;
    refetch: () => void;
    handleUploadNF: (parcela: ParcelaNF, file: File, numeroNota: string, dataEmissao: Date) => Promise<void>;
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
    const [notasFiscais, setNotasFiscais] = useState<NotaFiscal[]>([]);
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
        const ownerKey = ownerType === 'Admin' || ownerType === 'AdminUsuario' ? 'admin_id' : 'empresa_id';

        try { // <-- ABRINDO O BLOCO TRY
            // 1. Buscar todas as parcelas PAGAS
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
                        clientes: ${tabelaClientes} ( nome, razao_social, documento, telefone, email )
                    )
                `)
                .eq(ownerKey, ownerId)
                .eq('status', 'paga')
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

            // 2. Buscar Notas Fiscais existentes para essas parcelas
            let notasQuery = supabase
                .from('notas_fiscais')
                .select('*')
                .eq('proprietario_id', ownerId)
                .in('parcela_id', parcelaIds);

            if (filtroStatus !== 'todos') {
                if (filtroStatus === 'pendente') {
                    notasQuery = notasQuery.eq('status', 'Pendente Emissão');
                } else if (filtroStatus === 'emitida') {
                    notasQuery = notasQuery.eq('status', 'Nota Emitida');
                } else if (filtroStatus === 'enviada') {
                    notasQuery = notasQuery.eq('enviado_email', true).eq('enviado_whatsapp', true);
                }
            }

            const { data: notasData, error: nError } = await notasQuery;
            if (nError) throw nError;

            const notasMap = (notasData || []).reduce((acc, nf) => {
                acc[nf.parcela_id] = nf;
                return acc;
            }, {} as Record<string, NotaFiscal>);
            setNotasFiscais(notasMap as any);

            // 3. Mapear e filtrar as parcelas
            let finalParcelas: ParcelaNF[] = [];

            for (const p of parcelasBrutas) {
                const notaExistente = notasMap[p.id];
                
                // Se o filtro for 'pendente', só inclui se não houver nota
                if (filtroStatus === 'pendente' && notaExistente) continue;
                
                // Se o filtro for 'emitida', só inclui se o status for 'Nota Emitida'
                if (filtroStatus === 'emitida' && notaExistente?.status !== 'Nota Emitida') continue;
                
                // Se o filtro for 'enviada', só inclui se ambos os flags forem true
                if (filtroStatus === 'enviada' && (!notaExistente || !notaExistente.enviado_email || !notaExistente.enviado_whatsapp)) continue;

                const contaReceber = p[tabelaContas];
                const cliente = contaReceber?.clientes;
                
                const clienteNome = cliente?.razao_social || cliente?.nome || 'N/A';
                const descricao = contaReceber?.descricao || 'N/A';

                if (filtroTexto && !clienteNome.toLowerCase().includes(filtroTexto) && !descricao.toLowerCase().includes(filtroTexto)) {
                    continue;
                }

                finalParcelas.push({
                    id: p.id,
                    valor_parcela: p.valor_parcela,
                    data_pagamento: p.data_pagamento,
                    descricao_conta: descricao,
                    cliente_id: contaReceber?.cliente_id,
                    cliente_nome: clienteNome,
                    cliente_telefone: cliente?.telefone,
                    cliente_email: cliente?.email,
                });
            }

            setParcelasParaNF(finalParcelas);

        } catch (error) { // <-- FECHANDO O BLOCO TRY E ABRINDO O CATCH
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

    // --- Mutação: Upload de NF ---
    const handleUploadNF = useCallback(async (parcela: ParcelaNF, file: File, numeroNota: string, dataEmissao: Date) => {
        if (!ownerId) return;

        setCarregando(true);
        try {
            // 1. Upload do arquivo
            const fileExt = file.name.split('.').pop();
            const filePath = `${ownerId}/${parcela.id}/nf-${numeroNota}-${uuidv4().substring(0, 4)}.${fileExt}`;
            
            const { error: uploadError } = await supabase.storage
                .from(NF_BUCKET)
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from(NF_BUCKET).getPublicUrl(filePath);

            // 2. Inserir/Atualizar registro na tabela notas_fiscais
            const dataToSave: Partial<NotaFiscal> = {
                proprietario_id: ownerId,
                parcela_id: parcela.id,
                status: 'Nota Emitida',
                numero_nota: numeroNota,
                valor: parcela.valor_parcela,
                data_emissao: format(dataEmissao, 'yyyy-MM-dd'),
                anexo_url: publicUrl,
                enviado_whatsapp: false,
                enviado_email: false,
            };

            const { error: dbError } = await supabase
                .from('notas_fiscais')
                .upsert(dataToSave, { onConflict: 'parcela_id' });

            if (dbError) throw dbError;

            showSuccess('Nota Fiscal anexada e status atualizado para "Nota Emitida"!');
            refetch();
        } catch (error: any) {
            showError('Falha ao anexar NF: ' + error.message);
        } finally {
            setCarregando(false);
        }
    }, [ownerId, refetch]);

    // --- Mutação: Envio de NF ---
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
                // 1. Envio via Webhook N8N
                const webhookPayload = {
                    parcela_id: nota.parcela_id,
                    nota_fiscal_id: nota.id,
                    proprietario_id: ownerId,
                    cliente_id: parcela.cliente_id,
                    cliente_nome: parcela.cliente_nome,
                    cliente_email: parcela.cliente_email,
                    cliente_telefone: parcela.cliente_telefone,
                    numero_nota: nota.numero_nota,
                    valor: nota.valor,
                    data_emissao: nota.data_emissao,
                    anexo_url: nota.anexo_url,
                };

                const response = await fetch(configNF.webhook_n8n_url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(webhookPayload),
                });

                if (!response.ok) {
                    throw new Error(`Webhook N8N falhou com status: ${response.status}`);
                }
                
                // O webhook N8N deve retornar 200 OK para confirmar o envio
                showSuccess('Webhook N8N enviado com sucesso! Aguardando confirmação de envio.');
                
                // Atualiza status para 'Enviada Cliente'
                await supabase.from('notas_fiscais').update({ status: 'Enviada Cliente' }).eq('id', nota.id);

            } else if (tipo === 'whatsapp') {
                // 2. Envio via WhatsApp
                if (!parcela.cliente_telefone) throw new Error('Telefone do cliente não cadastrado.');
                
                let message = configNF.template_whatsapp || DEFAULT_CONFIG.template_whatsapp || '';
                Object.keys(tags).forEach(tag => {
                    message = message.replace(new RegExp(tag, 'g'), tags[tag as keyof typeof tags] || '');
                });
                
                const telefone = parcela.cliente_telefone.replace(/\D/g, '');
                const url = `https://wa.me/55${telefone}?text=${encodeURIComponent(message)}`;
                
                window.open(url, '_blank');
                showSuccess('Abrindo WhatsApp. Confirme o envio manualmente.');
                
                // Atualiza flag de envio
                await supabase.from('notas_fiscais').update({ enviado_whatsapp: true }).eq('id', nota.id);

            } else if (tipo === 'email') {
                // 3. Envio via Email (Simulação)
                if (!parcela.cliente_email) throw new Error('Email do cliente não cadastrado.');
                
                let subject = `Nota Fiscal Nº ${nota.numero_nota} - ${formatCurrency(nota.valor)}`;
                let body = configNF.template_email || DEFAULT_CONFIG.template_email || '';
                Object.keys(tags).forEach(tag => {
                    body = body.replace(new RegExp(tag, 'g'), tags[tag as keyof typeof tags] || '');
                });
                
                const mailtoLink = `mailto:${parcela.cliente_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                window.open(mailtoLink, '_blank');
                showSuccess('Abrindo cliente de e-mail. Anexe o PDF e envie manualmente.');
                
                // Atualiza flag de envio
                await supabase.from('notas_fiscais').update({ enviado_email: true }).eq('id', nota.id);
            }
            
            refetch();
        } catch (error: any) {
            showError('Falha no envio: ' + error.message);
        }
    }, [ownerId, configNF, parcelasParaNF, ownerType, refetch]);

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