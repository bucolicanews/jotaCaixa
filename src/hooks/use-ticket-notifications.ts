import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from './use-sessao';

interface TicketNotifications {
  ticketsAbertos: number;
  ticketsEmProgresso: number;
  ticketsPausados: number;
  mensagensNaoLidas: number;
  carregando: boolean;
  refetch: () => void;
}

/**
 * Hook para buscar o status de notificação de tickets para o usuário logado.
 */
export function useTicketNotifications(): TicketNotifications {
  const { usuario, role, perfil, carregando: carregandoSessao } = useSessao();
  const [ticketsAbertos, setTicketsAbertos] = useState(0);
  const [ticketsEmProgresso, setTicketsEmProgresso] = useState(0);
  const [ticketsPausados, setTicketsPausados] = useState(0);
  const [mensagensNaoLidas, setMensagensNaoLidas] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!usuario?.id || carregandoSessao) {
      setCarregando(false);
      return;
    }

    setCarregando(true);
    
    const userId = usuario.id;
    
    let ticketsQuery = supabase
        .from('tickets')
        .select('status', { count: 'exact', head: false });
        
    if (role === 'Cliente') {
        ticketsQuery = ticketsQuery.eq('proprietario_id', userId);
    } else if (role === 'Admin') {
        ticketsQuery = ticketsQuery.eq('empresa_id', userId);
    }
    
    try {
      // 1. Contar Tickets por Status
      const { data: ticketsData, error: ticketsError } = await ticketsQuery;
      if (ticketsError) throw ticketsError;
      
      const counts = (ticketsData || []).reduce((acc, t) => {
          acc[t.status] = (acc[t.status] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);
      
      setTicketsAbertos(counts['aberto'] || 0);
      setTicketsEmProgresso(counts['em_progresso'] || 0);
      setTicketsPausados(counts['pausado'] || 0);

      // 2. Contar Mensagens Não Lidas
      const { count: naoLidasCount, error: naoLidasError } = await supabase
        .from('mensagens_ticket')
        .select('id', { count: 'exact', head: true })
        .eq('destinatario_id', userId)
        .eq('lido', false);

      if (naoLidasError) throw naoLidasError;
      setMensagensNaoLidas(naoLidasCount || 0);

    } catch (error) {
      console.error('Erro ao buscar notificações de ticket:', error);
      setTicketsAbertos(0);
      setTicketsEmProgresso(0);
      setTicketsPausados(0);
      setMensagensNaoLidas(0);
    } finally {
      setCarregando(false);
    }
  }, [usuario, role, perfil, carregandoSessao, refreshKey]);

  useEffect(() => {
    fetchNotifications();
    
    // Opcional: Adicionar subscription para real-time updates
    const channel = supabase.channel('ticket_notifications')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'mensagens_ticket',
            filter: `destinatario_id=eq.${usuario?.id}`,
        }, () => {
            // Força o refetch quando uma nova mensagem chega para o usuário logado
            refetch();
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
  }, [fetchNotifications, refetch, usuario?.id]);

  return { ticketsAbertos, ticketsEmProgresso, ticketsPausados, mensagensNaoLidas, carregando, refetch };
}