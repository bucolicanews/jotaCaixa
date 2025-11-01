import React, { useState, useEffect, useCallback } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile } from '@/types/usuario';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isFuture, addDays, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Plano } from '@/types/plano'; // Importando a interface Plano atualizada

interface PlanoInfo extends Plano {} // Usando a interface Plano diretamente

const TrialBanner: React.FC = () => {
    const { perfil, role, carregando } = useSessao();
    const [planoInfo, setPlanoInfo] = useState<PlanoInfo | null>(null);
    const [dataFimAcesso, setDataFimAcesso] = useState<Date | null>(null);
    const [isTrial, setIsTrial] = useState(false);
    const [loading, setLoading] = useState(true);

    const isClient = role === 'Cliente';
    const clienteProfile = perfil as ClienteProfile;

    const fetchPlanoDetails = useCallback(async () => {
        if (!isClient || !clienteProfile?.plano_id || !clienteProfile.data_fim_acesso || !clienteProfile.criado_em) {
            setLoading(false);
            return;
        }

        setLoading(true);

        // 1. Buscar detalhes do Plano
        const { data: planoData, error: planoError } = await supabase
            .from('planos')
            .select('*') // Busca todas as colunas
            .eq('id', clienteProfile.plano_id)
            .single();

        if (planoError) {
            console.error('Erro ao buscar plano:', planoError);
            setLoading(false);
            return;
        }
        
        const dataFim = parseISO(clienteProfile.data_fim_acesso);
        const dataCriacao = parseISO(clienteProfile.criado_em);
        setDataFimAcesso(dataFim);
        setPlanoInfo(planoData as PlanoInfo);
        
        // 2. Determinar se é Trial (Regra: Acesso futuro E data_fim_acesso <= (criado_em + 7 dias))
        const isFutureAccess = isFuture(dataFim);
        const dataLimiteTrial = addDays(dataCriacao, 7);
        
        // Compara se a data de fim de acesso é igual ou anterior à data limite do trial (criado_em + 7 dias)
        // Usamos isSameDay para evitar problemas de fuso horário na comparação de datas
        const isWithinTrialPeriod = isSameDay(dataFim, dataLimiteTrial) || dataFim < dataLimiteTrial;

        // O banner só aparece se o acesso for futuro E estiver dentro do período de trial inicial
        setIsTrial(isFutureAccess && isWithinTrialPeriod);
        setLoading(false);

    }, [isClient, clienteProfile]);

    useEffect(() => {
        if (!carregando) {
            fetchPlanoDetails();
        }
    }, [carregando, fetchPlanoDetails]);

    // O banner só é exibido se for um cliente E estiver em período de trial (curto prazo)
    if (loading || carregando || !isClient || !planoInfo || !dataFimAcesso || !isTrial) {
        return null; 
    }

    const dataCobranca = format(dataFimAcesso, 'dd/MM/yyyy', { locale: ptBR });
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