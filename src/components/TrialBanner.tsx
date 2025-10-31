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
        
        // 2. Determinar se é Trial
        const daysRemaining = differenceInDays(dataFim, new Date());
        
        // O cliente está em Trial se:
        // a) A data de fim de acesso for futura.
        // b) E a duração restante for próxima ao período de trial (ex: 7 dias)
        //    OU a duração for menor que 30 dias (para pegar trials de 7 ou 20 dias).
        //    Se o pagamento for feito, o acesso é estendido para 30 dias, o que não é um trial.
        
        // Vamos considerar Trial se a data de fim de acesso for menor que 30 dias no futuro.
        // Se o pagamento for feito, o acesso é estendido para 30 dias, mas o TrialButton
        // só é usado quando o cliente está PENDENTE.
        
        // Se o cliente pagou, o data_fim_acesso é 30 dias. Se ele está no fluxo de TrialButton,
        // o data_fim_acesso é 7 dias.
        
        // Vamos usar uma heurística mais simples: se o acesso for maior que 30 dias, não é trial.
        const isTrialPeriod = isFuture(dataFim) && daysRemaining < 30; 
        
        setIsTrial(isTrialPeriod);
        setLoading(false);

    }, [isClient, clienteProfile]);

    useEffect(() => {
        if (!carregando) {
            fetchPlanoDetails();
        }
    }, [carregando, fetchPlanoDetails]);

    // O banner só é exibido se for um cliente E estiver em período de trial
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