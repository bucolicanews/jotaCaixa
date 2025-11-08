import React, { useState, useEffect, useCallback } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile } from '@/types/usuario';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isFuture } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Plano } from '@/types/plano';

interface PlanoInfo extends Plano {}

const TrialBanner: React.FC = () => {
    const { perfil, role, carregando } = useSessao();
    const [planoInfo, setPlanoInfo] = useState<PlanoInfo | null>(null);
    const [dataFimAcesso, setDataFimAcesso] = useState<Date | null>(null);
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
            .select('*')
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
        
        // 2. Determinar se é Trial (Simplificado: Acesso futuro)
        // A lógica de isTrial foi movida para a condição de renderização final.
        
        setLoading(false);

    }, [isClient, clienteProfile]);

    useEffect(() => {
        if (!carregando) {
            fetchPlanoDetails();
        }
    }, [carregando, fetchPlanoDetails]);

    // O banner só é exibido se for um cliente E o acesso for futuro
    if (loading || carregando || !isClient || !planoInfo || !dataFimAcesso || !isFuture(dataFimAcesso)) {
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
                Aproveite seu teste gratuito com acesso completo até <span className="font-bold">{dataCobranca}</span>! Depois, o plano <span className="font-bold">{planoInfo.nome}</span> será ativado e a cobrança de <span className="font-bold">{precoFormatado}</span> será aplicada a partir desta data.
            </p>
        </div>
    );
};

export default TrialBanner;