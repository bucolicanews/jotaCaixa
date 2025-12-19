import React, { useState, useEffect, useCallback } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile } from '@/types/usuario';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isFuture } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Plano } from '@/types/plano';

import { Link } from 'react-router-dom';
import { Button } from './ui/button';

interface PlanoInfo extends Plano {}

const TrialBanner: React.FC = () => {
    const { perfil, role, carregando } = useSessao();
    const [planoInfo, setPlanoInfo] = useState<PlanoInfo | null>(null);
    const [dataFimAcesso, setDataFimAcesso] = useState<Date | null>(null);
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
    
    // REGRA PRINCIPAL: Ocultar o banner se o plano for pago (preço > 0).
    if (planoInfo.preco_mensal > 0) {
        return null;
    }

    // Se chegou aqui, o plano é gratuito (preço 0) e o acesso é futuro.
    const dataCobranca = format(dataFimAcesso, 'dd/MM/yyyy', { locale: ptBR });
    
    let message: string;

    // Cenário: Plano gratuito (Preço zero)
    message = `Aproveite seu teste gratuito com acesso completo até <span class="font-bold">${dataCobranca}</span>!`;

    return (
        <div className={cn(
            "w-full bg-yellow-100 dark:bg-yellow-900/30 border-b border-yellow-500 p-2 text-sm",
            "flex items-center justify-center text-center text-yellow-800 dark:text-yellow-300"
        )}>
            <div className="flex items-center justify-center flex-wrap gap-2">
                <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
                <p className="font-medium" dangerouslySetInnerHTML={{ __html: message }} />
                <Button asChild size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground h-7">
                    <Link to="/vendas">Atualizar Plano</Link>
                </Button>
            </div>
        </div>
    );
};

export default TrialBanner;