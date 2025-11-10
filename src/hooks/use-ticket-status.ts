import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from './use-sessao';

interface TicketStatus {
  ticketsAbertos: number;
  mensagensNaoLidas: number;
  carregando: boolean;
  refetch: () => void;
}

/**
 * Hook para buscar o status dos tickets de suporte para o usuário logado.
 * - Admin: Conta todos os tickets com status 'aberto' ou 'em_progresso'.
 * - Cliente: Conta tickets com status 'aberto' ou 'em_progresso' onde ele é o proprietário.
 * - Mensagens Não Lidas: Conta mensagens onde o destinatário é o usuário logado e 'lido' é false.
 */
export function useTicketStatus(): TicketStatus {
  const { usuario, role, carregando: carregandoSessao } = useSessao();
  const [ticketsAbertos, setTicketsAbertos] = useState(0);
  const [mensagensNaoLidas, setMensagensNaoLidas] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!usuario?.id || carregandoSessao) {
      setCarregando(false);
      return;
    }

    setCarregando(true);
    const userId = usuario.id;
    
    try {
      // --- 1. Contagem de Tickets Abertos/Em Progresso ---
      let ticketsQuery = supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .in('status', ['aberto', 'em_progresso', 'pausado']);

      if (role === 'Cliente') {
        // Cliente só vê os tickets que ele criou
        ticketsQuery = ticketsQuery.eq('proprietario_id', userId);
      } else if (role === 'Admin') {
        // Admin vê todos os tickets onde ele é o destinatário (empresa_id)
        ticketsQuery = ticketsQuery.eq('empresa_id', userId);
      }
      
      const { count: openCount, error: openError } = await ticketsQuery;
      if (openError) throw openError;
      setTicketsAbertos(openCount || 0);

      // --- 2. Contagem de Mensagens Não Lidas ---
      const { count: unreadCount, error: unreadError } = await supabase
        .from('mensagens_ticket')
        .select('id', { count: 'exact', head: true })
        .eq('destinatario_id', userId)
        .eq('lido', false);
        
      if (unreadError) throw unreadError;
      setMensagensNaoLidas(unreadCount || 0);

    } catch (error) {
      console.error('Erro ao buscar status do ticket:', error);
      setTicketsAbertos(0);
      setMensagensNaoLidas(0);
    } finally {
      setCarregando(false);
    }
  }, [usuario, role, carregandoSessao, refreshKey]);

  useEffect(() => {
    fetchStatus();
    
    // Opcional: Adicionar listener de tempo real para novas mensagens
    const channel = supabase.channel('ticket_status_changes')
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
  }, [fetchStatus, usuario?.id, refetch]);

  return { ticketsAbertos, mensagensNao Lidas, carregando, refetch };
}