import React, { useState, useEffect, useCallback } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile } from '@/types/usuario';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isFuture, differenceInDays } from 'date-fns';
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
    
    // Lógica de Trial:
    // 1. Se o preço for zero, é um plano de teste/gratuito.
    // 2. Se o preço for maior que zero, só exibe o banner se o período de acesso
    //    for menor que 30 dias (indicando o período de trial inicial).
    
    const diasDesdeCriacao = differenceInDays(new Date(), parseISO(clienteProfile.criado_em));
    const isInitialTrial = diasDesdeCriacao <= 30; // Considera os primeiros 30 dias como trial
    
    // Se o plano for pago E o período de trial inicial já passou, não exibe o banner.
    if (planoInfo.preco_mensal > 0 && !isInitialTrial) {
        return null;
    }

    const dataCobranca = format(dataFimAcesso, 'dd/MM/yyyy', { locale: ptBR });
    const precoFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(planoInfo.preco_mensal);
    
    let message: string;

    if (planoInfo.preco_mensal > 0) {
        // Cenário 1: Plano pago (Mensagem de cobrança futura)
        message = `Aproveite seu teste gratuito com acesso completo até <span class="font-bold">${dataCobranca}</span>! Depois, o plano <span class="font-bold">${planoInfo.nome}</span> será ativado e a cobrança de <span class="font-bold">${precoFormatado}</span> será aplicada a partir desta data.`;
    } else {
        // Cenário 2: Plano de teste (Preço zero, usa a descrição do plano)
        message = `Aproveite seu teste gratuito com acesso completo até <span class="font-bold">${dataCobranca}</span>! ${planoInfo.descricao || 'O acesso será desativado após esta data.'}`;
    }

    return (
        <div className={cn(
            "w-full bg-yellow-100 dark:bg-yellow-900/30 border-b border-yellow-500 p-3 text-sm",
            "flex items-center justify-center text-center text-yellow-800 dark:text-yellow-300"
        )}>
            <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
            <p className="font-medium" dangerouslySetInnerHTML={{ __html: message }} />
        </div>
    );
};

export default TrialBanner;