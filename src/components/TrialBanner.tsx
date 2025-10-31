import React, { useState, useEffect, useCallback } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile } from '@/types/usuario';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlanoInfo {
    nome: string;
    dias_trial: number;
    preco_mensal: number;
}

const TrialBanner: React.FC = () => {
    const { perfil, role, usuario, carregando } = useSessao();
    const [planoInfo, setPlanoInfo] = useState<PlanoInfo | null>(null);
    const [dataCadastro, setDataCadastro] = useState<Date | null>(null);
    const [loading, setLoading] = useState(true);

    const isClient = role === 'Cliente';
    const clienteProfile = perfil as ClienteProfile;

    const fetchPlanoDetails = useCallback(async () => {
        if (!isClient || !clienteProfile?.plano_id || !usuario) {
            setLoading(false);
            return;
        }

        // 1. Buscar detalhes do Plano
        const { data: planoData, error: planoError } = await supabase
            .from('planos')
            .select('nome, dias_trial, preco_mensal')
            .eq('id', clienteProfile.plano_id)
            .single();

        if (planoError) {
            console.error('Erro ao buscar plano:', planoError);
            // showError('Não foi possível carregar detalhes do plano.');
            setLoading(false);
            return;
        }
        
        // 2. Buscar data de criação do usuário (para calcular o fim do trial)
        // Usamos a data de criação do usuário no auth.users
        const createdAt = usuario.created_at;
        
        setPlanoInfo(planoData as PlanoInfo);
        setDataCadastro(parseISO(createdAt));
        setLoading(false);

    }, [isClient, clienteProfile, usuario]);

    useEffect(() => {
        if (!carregando) {
            fetchPlanoDetails();
        }
    }, [carregando, fetchPlanoDetails]);

    if (loading || carregando || !isClient || !planoInfo || !dataCadastro) {
        return null; // Não renderiza se não for cliente, estiver carregando ou faltar dados
    }

    const dataFimTrial = addDays(dataCadastro, planoInfo.dias_trial);
    const dataCobranca = format(dataFimTrial, 'dd/MM/yyyy', { locale: ptBR });
    const precoFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(planoInfo.preco_mensal);

    return (
        <div className={cn(
            "w-full bg-yellow-100 dark:bg-yellow-900/30 border-b border-yellow-500 p-3 text-sm",
            "flex items-center justify-center text-center text-yellow-800 dark:text-yellow-300"
        )}>
            <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
            <p className="font-medium">
                Você está no **TESTE GRÁTIS** do plano <span className="font-bold">{planoInfo.nome}</span>. 
                O trial termina em <span className="font-bold">{dataCobranca}</span>. 
                A cobrança de {precoFormatado} será aplicada a partir desta data.
            </p>
        </div>
    );
};

export default TrialBanner;