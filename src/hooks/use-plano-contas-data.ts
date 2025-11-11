import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { PlanoContas } from '@/types/plano-contas';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { useDebounce } from './use-debounce';

// Tipo para inicializar o formulário de nova conta
interface NovaContaInicial {
    Conta: string;
    Analitica: 'Sim' | 'Não';
}

export const usePlanoContasData = () => {
    const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
    const [contas, setContas] = useState<PlanoContas[]>([]);
    const [carregandoContas, setCarregandoContas] = useState(true);
    const [proprietarioId, setProprietarioId] = useState<string | null>(null);
    const [mascaraAtiva, setMascaraAtiva] = useState<string | null>(null);

    // Estados de Filtro
    const [filtroTexto, setFiltroTexto] = useState('');
    const filtroTextoDebounced = useDebounce(filtroTexto, 500);
    const [filtroTipoConta, setFiltroTipoConta] = useState('todos');
    const [filtroAnalitica, setFiltroAnalitica] = useState('todos');

    // Estados para Ações
    const [contaSelecionada, setContaSelecionada] = useState<PlanoContas | null>(null);
    const [novaContaInicial, setNovaContaInicial] = useState<NovaContaInicial | null>(null);
    const [dialogAberto, setDialogAberto] = useState(false);
    const [contaClicada, setContaClicada] = useState<PlanoContas | null>(null);
    const [popoverOpen, setPopoverOpen] = useState(false);

    // --- Funções de Fetch ---

    const fetchMascara = useCallback(async (id: string) => {
        const { data, error } = await supabase
            .from('configuracao_plano_contas')
            .select('mascara_codigo')
            .eq('proprietario_id', id)
            .limit(1)
            .maybeSingle();
            
        if (error) {
            console.error('Erro ao buscar máscara:', error);
        }
        setMascaraAtiva(data?.mascara_codigo || null);
    }, []);

    const buscarPlanoContas = useCallback(async (id: string) => {
        setCarregandoContas(true);
        let query = supabase
            .from('plano_contas')
            .select('*')
            .eq('proprietario_id', id);

        // Aplicar filtro de texto
        if (filtroTextoDebounced) {
            const searchTerm = `%${filtroTextoDebounced}%`;
            query = query.or(
                `Conta.ilike.${searchTerm},codigo_reduzido.ilike.${searchTerm},Descricao.ilike.${searchTerm}`
            );
        }

        // Aplicar filtro de tipo de conta
        if (filtroTipoConta !== 'todos') {
            let prefix = '';
            if (filtroTipoConta === 'ativo') prefix = '1';
            if (filtroTipoConta === 'passivo') prefix = '2';
            if (filtroTipoConta === 'receita') prefix = '3';
            if (filtroTipoConta === 'despesa') prefix = '4';
            query = query.like('Conta', `${prefix}.%`);
        }

        // Aplicar filtro de analítica
        if (filtroAnalitica !== 'todos') {
            query = query.eq('Analitica', filtroAnalitica);
        }

        query = query.order('Conta', { ascending: true });

        const { data, error } = await query;

        if (error) {
            showError('Erro ao carregar Plano de Contas: ' + error.message);
            setContas([]);
        } else {
            setContas(data as PlanoContas[]);
        }
        setCarregandoContas(false);
    }, [filtroTextoDebounced, filtroTipoConta, filtroAnalitica]);

    // --- Efeitos de Inicialização e Filtro ---

    useEffect(() => {
        if (!carregandoSessao && usuario) {
            let ownerId: string | null = null;

            if (role === 'Admin') {
                ownerId = usuario.id;
            } else if (role === 'Cliente') {
                ownerId = (perfil as ClienteProfile)?.id || null;
            } else if (role === 'Usuario') {
                ownerId = (perfil as UsuarioProfile)?.cliente_id || null;
            }
            
            if (ownerId) {
                setProprietarioId(ownerId);
                fetchMascara(ownerId);
            } else {
                setCarregandoContas(false);
            }
        } else if (!carregandoSessao && !usuario) {
            setCarregandoContas(false);
        }
    }, [carregandoSessao, usuario, perfil, role, fetchMascara]);

    useEffect(() => {
        if (proprietarioId) {
            buscarPlanoContas(proprietarioId);
        }
    }, [proprietarioId, buscarPlanoContas]);

    // --- Handlers de Ação ---

    const refreshData = useCallback(() => {
        if (proprietarioId) {
            buscarPlanoContas(proprietarioId);
        }
    }, [proprietarioId, buscarPlanoContas]);

    const handleSaveComplete = () => {
        setDialogAberto(false);
        setContaSelecionada(null);
        setNovaContaInicial(null);
        refreshData();
    };

    const handleEdit = (conta: PlanoContas) => {
        setContaSelecionada(conta);
        setNovaContaInicial(null);
        setDialogAberto(true);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir esta conta?')) return;

        try {
            // 1. Anular referências em tabelas dependentes
            await supabase.from('saldo_contas').update({ conta_contabil_id: null }).eq('conta_contabil_id', id);
            await supabase.from('lancamentos').update({ conta_contabil_id: null }).eq('conta_contabil_id', id);
            await supabase.from('configuracao_contas_receber').update({ conta_contabil_id: null }).eq('conta_contabil_id', id);
            await supabase.from('configuracao_contas_pagar').update({ conta_contabil_id: null }).eq('conta_contabil_id', id);
            
            // 2. Deletar a conta
            const { error: deleteError } = await supabase
                .from('plano_contas')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;

            showSuccess('Conta excluída com sucesso.');
            refreshData();
        } catch (error: any) {
            console.error('Erro ao excluir conta:', error);
            showError('Falha ao excluir conta: ' + error.message);
        }
    };

    const handleContaClick = (conta: PlanoContas) => {
        if (conta.Analitica === 'Não') {
            setContaClicada(conta);
            setPopoverOpen(true);
        } else {
            handleEdit(conta);
        }
    };
    
    const handleNovaContaAbaixo = (contaPai: PlanoContas) => {
        setNovaContaInicial({
            Conta: contaPai.Conta + '.', 
            Analitica: 'Sim', 
        });
        setContaSelecionada(null);
        setDialogAberto(true);
        setPopoverOpen(false);
    };
    
    const handleNovaContaNivel = (contaIrma: PlanoContas) => {
        const partes = contaIrma.Conta.split('.');
        partes.pop(); 
        const prefixo = partes.join('.');
        
        setNovaContaInicial({
            Conta: prefixo + '.', 
            Analitica: contaIrma.Analitica, 
        });
        setContaSelecionada(null);
        setDialogAberto(true);
        setPopoverOpen(false);
    };

    return {
        // Dados
        contas,
        carregandoContas,
        proprietarioId,
        mascaraAtiva,
        
        // Filtros
        filtroTexto, setFiltroTexto,
        filtroTipoConta, setFiltroTipoConta,
        filtroAnalitica, setFiltroAnalitica,
        
        // Ações de Formulário
        contaSelecionada,
        setContaSelecionada, // Adicionado
        novaContaInicial,
        setNovaContaInicial, // Adicionado
        dialogAberto, setDialogAberto,
        handleSaveComplete,
        handleEdit,
        handleDelete,
        refreshData,
        
        // Ações Hierárquicas
        contaClicada,
        popoverOpen, setPopoverOpen,
        handleContaClick,
        handleNovaContaAbaixo,
        handleNovaContaNivel,
    };
};