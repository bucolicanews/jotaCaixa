import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from './use-sessao';
import { ClienteProfile } from '@/types/usuario';

interface TicketNotifications {
  totalTicketsAbertos: number;
  mensagensNaoLidas: number;
  carregando: boolean;
  refetch: () => void;
}

/**
 * Hook para buscar o status de notificação de tickets para o usuário logado.
 */
export function useTicketNotifications(): TicketNotifications {
  const { usuario, role, perfil, carregando: carregandoSessao } = useSessao();
  const [totalTicketsAbertos, setTotalTicketsAbertos] = useState(0);
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
    let empresaId: string | null = null; // ID do Admin (destinatário) ou Cliente (proprietário)

    if (role === 'Cliente') {
        empresaId = (perfil as ClienteProfile)?.admin_id || null;
    } else if (role === 'Admin') {
        empresaId = userId;
    }

    if (!empresaId) {
        setCarregando(false);
        return;
    }

    try {
      // 1. Contar Tickets Abertos (Status: aberto, em_progresso, pausado)
      let ticketsQuery = supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .in('status', ['aberto', 'em_progresso', 'pausado']);
        
      if (role === 'Cliente') {
          // Cliente só conta os tickets que ele criou
          ticketsQuery = ticketsQuery.eq('proprietario_id', userId);
      } else if (role === 'Admin') {
          // Admin conta todos os tickets onde ele é a empresa_id
          ticketsQuery = ticketsQuery.eq('empresa_id', userId);
      }
      
      const { count: abertosCount, error: abertosError } = await ticketsQuery;
      if (abertosError) throw abertosError;
      setTotalTicketsAbertos(abertosCount || 0);

      // 2. Contar Mensagens Não Lidas (Onde o usuário logado é o destinatário E lido=false)
      const { count: naoLidasCount, error: naoLidasError } = await supabase
        .from('mensagens_ticket')
        .select('id', { count: 'exact', head: true })
        .eq('destinatario_id', userId)
        .eq('lido', false);

      if (naoLidasError) throw naoLidasError;
      setMensagensNaoLidas(naoLidasCount || 0);

    } catch (error) {
      console.error('Erro ao buscar notificações de ticket:', error);
      setTotalTicketsAbertos(0);
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

  return { totalTicketsAbertos, mensagensNaoLidas, carregando, refetch };
}