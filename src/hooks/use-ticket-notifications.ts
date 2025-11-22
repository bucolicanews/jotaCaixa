import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from './use-sessao';
import { ClienteProfile } from '@/types/usuario';

interface TicketNotifications {
  ticketsAbertos: number;
  ticketsEmProgresso: number;
  ticketsPausados: number;
  ticketsFechados: number;
  mensagensParaResponder: number;
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
  const [ticketsFechados, setTicketsFechados] = useState(0);
  const [mensagensParaResponder, setMensagensParaResponder] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);
  
  // Define as variáveis de escopo que serão usadas no useEffect
  const userId = usuario?.id;
  
  let targetEmpresaId: string | null = null;
  let targetProprietarioId: string | null = null;

  if (role === 'Cliente') {
      // Cliente: empresa_id é o Admin ID, proprietario_id é o Cliente ID
      targetEmpresaId = (perfil as ClienteProfile)?.admin_id || null;
      targetProprietarioId = (perfil as ClienteProfile)?.id || null;
  } else if (role === 'Admin') {
      // Admin: empresa_id é o próprio Admin ID
      targetEmpresaId = userId || null;
  }


  const fetchNotifications = useCallback(async () => {
    if (!userId || carregandoSessao) {
      setCarregando(false);
      return;
    }

    setCarregando(true);
    
    if (!targetEmpresaId) {
        setCarregando(false);
        return;
    }
    
    // Base query: Select tickets filtered by the Admin ID (empresa_id)
    let query = supabase
        .from('tickets')
        .select('status, proprietario_id, empresa_id, mensagens_ticket_count:mensagens_ticket(count), ultima_mensagem:mensagens_ticket(destinatario_id)', { count: 'exact', head: false })
        .eq('empresa_id', targetEmpresaId);
    
    // If Client, filter by proprietario_id (the client's ID)
    if (targetProprietarioId) {
        query = query.eq('proprietario_id', targetProprietarioId);
    }
    
    // Apply limit to the nested relation (to get only the last message info)
    query = query.order('criado_em', { foreignTable: 'ultima_mensagem', ascending: false }).limit(1, { foreignTable: 'ultima_mensagem' });

    try {
      // 1. Fetch Tickets and Last Message Info
      const { data: ticketsData, error: ticketsError } = await query;
      if (ticketsError) throw ticketsError;
      
      let abertos = 0;
      let emProgresso = 0;
      let pausados = 0;
      let fechados = 0;
      let paraResponder = 0;
      
      (ticketsData || []).forEach((t: any) => {
          // Count by status
          switch (t.status) {
              case 'aberto': abertos++; break;
              case 'em_progresso': emProgresso++; break;
              case 'pausado': pausados++; break;
              case 'fechado': fechados++; break;
          }
          
          // Count 'Para Responder'
          const ultimaMensagem = t.ultima_mensagem?.[0];
          let proximoRespondenteId: string | null = null;
          
          if (t.status !== 'fechado') {
              // Se houver mensagens, o próximo respondente é o destinatário da última mensagem.
              if (ultimaMensagem) {
                  proximoRespondenteId = ultimaMensagem.destinatario_id;
              } else {
                  // Se não houver mensagens (ticket recém-criado), o destinatário é o Admin (empresa_id)
                  // Nota: O campo empresa_id armazena o ID do Admin (destinatário)
                  proximoRespondenteId = t.empresa_id;
              }
              
              if (proximoRespondenteId === userId) {
                  paraResponder++;
              }
          }
      });
      
      setTicketsAbertos(abertos);
      setTicketsEmProgresso(emProgresso);
      setTicketsPausados(pausados);
      setTicketsFechados(fechados);
      setMensagensParaResponder(paraResponder);

    } catch (error) {
      console.error('Erro ao buscar notificações de ticket:', error);
      setTicketsAbertos(0);
      setTicketsEmProgresso(0);
      setTicketsPausados(0);
      setTicketsFechados(0);
      setMensagensParaResponder(0);
    } finally {
      setCarregando(false);
    }
  }, [userId, carregandoSessao, refreshKey, targetEmpresaId, targetProprietarioId]);

  useEffect(() => {
    fetchNotifications();
    
    // Real-time subscription
    const channel = supabase.channel('ticket_notifications')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'mensagens_ticket',
            filter: `destinatario_id=eq.${usuario?.id}`,
        }, () => {
            refetch();
        })
        .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'tickets',
            filter: `proprietario_id=eq.${usuario?.id}`,
        }, () => {
            refetch();
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
  }, [fetchNotifications, refetch, usuario?.id]);

  return { ticketsAbertos, ticketsEmProgresso, ticketsPausados, ticketsFechados, mensagensParaResponder, carregando, refetch };
}