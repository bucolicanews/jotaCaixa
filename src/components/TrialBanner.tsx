import React, { useState, useEffect, useCallback } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile } from '@/types/usuario';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isFuture, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlanoInfo {
    nome: string;
    dias_trial: number;
    preco_mensal: number;
}

const TrialBanner: React.FC = () => {
    const { perfil, role, carregando } = useSessao();
    const [planoInfo, setPlanoInfo] = useState<PlanoInfo | null>(null);
    const [dataFimAcesso, setDataFimAcesso] = useState<Date | null>(null);
    const [isTrial, setIsTrial] = useState(false);
    const [loading, setLoading] = useState(true);

    const isClient = role === 'Cliente';
    const clienteProfile = perfil as ClienteProfile;

    const fetchPlanoDetails = useCallback(async () => {
        if (!isClient || !clienteProfile?.plano_id || !clienteProfile.data_fim_acesso) {
            setLoading(false);
            return;
        }

        setLoading(true);

        // 1. Buscar detalhes do Plano
        const { data: planoData, error: planoError } = await supabase
            .from('planos')
            .select('nome, dias_trial, preco_mensal')
            .eq('id', clienteProfile.plano_id)
            .single();

        if (planoError) {
            console.error('Erro ao buscar plano:', planoError);
            setLoading(false);
            return;
        }
        
        const dataFim = parseISO(clienteProfile.data_fim_acesso);
        setDataFimAcesso(dataFim);
        setPlanoInfo(planoData as PlanoInfo);
        
        // 2. Determinar se é Trial (Regra: Apenas se for 7 dias de trial E a data de fim for futura)
        const isFutureAccess = isFuture(dataFim);
        const isSevenDayTrial = planoData.dias_trial === 7;
        
        // O banner só aparece se for um trial de 7 dias E o acesso ainda não expirou.
        setIsTrial(isSevenDayTrial && isFutureAccess);
        setLoading(false);

    }, [isClient, clienteProfile]);

    useEffect(() => {
        if (!carregando) {
            fetchPlanoDetails();
        }
    }, [carregando, fetchPlanoDetails]);

    // O banner só é exibido se for um cliente E estiver em período de trial (7 dias)
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