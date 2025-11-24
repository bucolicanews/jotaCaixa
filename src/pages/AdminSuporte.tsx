import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MessageSquare, Filter, Building2, AlertTriangle, Clock, Pause, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import TicketCard from '@/components/suporte/TicketCard.tsx';
import TicketDetalhe from '@/components/suporte/TicketDetalhe.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import { useTicketNotifications } from '@/hooks/use-ticket-notifications'; // Importando o hook
import { UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario'; // Importando tipos de usuário

interface Ticket {
  id: string;
  titulo: string;
  status: 'aberto' | 'em_progresso' | 'pausado' | 'fechado';
  prioridade: 'baixa' | 'media' | 'alta';
  criado_em: string;
  atualizado_em: string;
  proprietario_id: string;
  empresa_id: string;
  proprietario_perfil: { nome: string } | null;
  mensagens_ticket_count: number;
  ultima_mensagem_remetente_id: string | null;
  ultima_mensagem_destinatario_id: string | null; // NOVO CAMPO
  ultima_mensagem?: { remetente_id: string, destinatario_id: string | null, criado_em: string, ticket_id: string }[] | null; 
}

interface EmpresaFiltro {
    id: string;
    nome: string;
}

const AdminSuporte: React.FC = () => {
  const { role, carregando: carregandoSessao, usuario, perfil } = useSessao(); // Adicionado perfil
  const { ticketsAbertos, ticketsEmProgresso, ticketsPausados, ticketsFechados, mensagensParaResponder, carregando: carregandoNotificacoes, refetch: refetchNotifications } = useTicketNotifications(); // Usando o hook
  
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [carregandoTickets, setCarregandoTickets] = useState(true);
  const [ticketSelecionado, setTicketSelecionado] = useState<Ticket | null>(null);
  
  // Filtros
  const [filtroStatus, setFiltroStatus] = useState('aberto');
  const [filtroEmpresaId, setFiltroEmpresaId] = useState('todos');
  const [empresasFiltro, setEmpresasFiltro] = useState<EmpresaFiltro[]>([]);
  const [filtroTexto, setFiltroTexto] = useState('');
  const filtroTextoDebounced = useDebounce(filtroTexto, 500);

  const isAdmin = role === 'Admin';
  const isUsuarioComPermissao = role === 'Usuario' && (perfil as UsuarioProfile | AdminUsuarioProfile)?.permissoes?.gestao_suporte === true;
  const canAccessPage = isAdmin || isUsuarioComPermissao;

  const fetchEmpresasFiltro = useCallback(async () => {
    if (!isAdmin) return;
    
    const { data, error } = await supabase
        .from('tbl_clientes')
        .select('id, nome')
        .eq('aprovado', true)
        .order('nome');

    if (error) {
        console.error('Erro ao carregar lista de empresas:', error);
        setEmpresasFiltro([]);
    } else {
        setEmpresasFiltro(data as EmpresaFiltro[]);
    }
  }, [isAdmin]);

  const fetchTickets = useCallback(async () => {
    if (!canAccessPage || !usuario?.id) { 
        setCarregandoTickets(false);
        return;
    }
    setCarregandoTickets(true);
    
    // O Admin (ou Usuário com permissão) sempre gerencia tickets onde ele é o destinatário (empresa_id)
    const targetEmpresaId = isAdmin ? usuario.id : (perfil as AdminUsuarioProfile)?.admin_id;
    
    if (!targetEmpresaId) {
        setCarregandoTickets(false);
        return;
    }
    
    let query = supabase
      .from('tickets')
      .select(`
        id,
        titulo,
        status,
        prioridade,
        criado_em,
        atualizado_em,
        proprietario_id,
        empresa_id,
        mensagens_ticket_count:mensagens_ticket(count),
        ultima_mensagem:mensagens_ticket(remetente_id,destinatario_id,criado_em,ticket_id)
      `)
      .eq('empresa_id', targetEmpresaId) // Filtra pelo ID do Admin (destinatário)
      .order('atualizado_em', { ascending: false });
      
    // APLICAÇÃO CORRETA DE ORDER E LIMIT NA RELAÇÃO ANINHADA
    query = query
        .order('criado_em', { foreignTable: 'ultima_mensagem', ascending: false })
        .limit(1, { foreignTable: 'ultima_mensagem' });
      
    
    if (filtroStatus !== 'todos') {
        query = query.eq('status', filtroStatus);
    }
    
    if (filtroEmpresaId !== 'todos') {
        // Filtra por tickets criados por um cliente específico
        query = query.eq('proprietario_id', filtroEmpresaId);
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar tickets: ' + error.message);
      setTickets([]);
    } else {
      let rawTickets = (data as any[]).map(t => ({
          ...t,
          // CORREÇÃO: Garante que o count seja um número
          mensagens_ticket_count: parseInt(t.mensagens_ticket_count?.[0]?.count || '0', 10),
      })) as Ticket[];
      
      // 1. Coletar todos os proprietario_id únicos
      const proprietarioIds = Array.from(new Set(rawTickets.map(t => t.proprietario_id)));
      
      // 2. Buscar nomes dos proprietários (tentando em tbl_clientes e tbl_admins)
      const [clientesRes, adminsRes] = await Promise.all([
          supabase.from('tbl_clientes').select('id, nome').in('id', proprietarioIds),
          supabase.from('tbl_admins').select('id, nome').in('id', proprietarioIds),
      ]);
      
      const nomeMap: Record<string, string> = {};
      (clientesRes.data || []).forEach(c => nomeMap[c.id] = c.nome);
      (adminsRes.data || []).forEach(a => nomeMap[a.id] = a.nome);
      
      // 3. Mapear nomes de volta para os tickets
      let mappedData = rawTickets.map(t => {
          const ultimaMensagem = t.ultima_mensagem?.[0];
          return {
              ...t,
              proprietario_perfil: { nome: nomeMap[t.proprietario_id] || 'N/A' },
              ultima_mensagem_remetente_id: ultimaMensagem?.remetente_id || null,
              ultima_mensagem_destinatario_id: ultimaMensagem?.destinatario_id || null, // NOVO CAMPO
          } as Ticket;
      });
      
      // 4. Filtro de texto no frontend
      if (filtroTextoDebounced) {
          const termo = filtroTextoDebounced.toLowerCase();
          mappedData = mappedData.filter(t => 
              t.titulo.toLowerCase().includes(termo) ||
              t.proprietario_perfil?.nome.toLowerCase().includes(termo) ||
              t.id.toLowerCase().includes(termo)
          );
      }
      
      setTickets(mappedData);
    }
    setCarregandoTickets(false);
  }, [canAccessPage, filtroStatus, filtroEmpresaId, filtroTextoDebounced, usuario?.id, isAdmin, perfil]);

  useEffect(() => {
    if (!carregandoSessao && isAdmin) {
      fetchEmpresasFiltro();
    }
    if (!carregandoSessao && canAccessPage) {
        fetchTickets();
    }
  }, [carregandoSessao, isAdmin, canAccessPage, fetchEmpresasFiltro, fetchTickets]);
  
  const handleOpenTicket = (ticket: Ticket) => {
      setTicketSelecionado(ticket);
  };
  
  const handleCloseDetalhe = () => {
      setTicketSelecionado(null);
      fetchTickets(); // Recarrega a lista para atualizar o status
      refetchNotifications(); // Atualiza as notificações
  };
  
  const handleDeleteTicket = async (ticketId: string, titulo: string) => {
      if (!window.confirm(`Tem certeza que deseja excluir o ticket "${titulo}"? Esta ação é irreversível.`)) return;
      
      setCarregandoTickets(true);
      
      try {
          // Admin pode deletar qualquer ticket, mas a RLS deve ser configurada para permitir isso.
          const { error } = await supabase
              .from('tickets')
              .delete()
              .eq('id', ticketId);
              
          if (error) throw error;
          
          showSuccess(`Ticket "${titulo}" excluído com sucesso.`);
          fetchTickets();
          refetchNotifications();
      } catch (error: any) {
          showError('Falha ao excluir ticket: ' + error.message);
          setCarregandoTickets(false);
      }
  };

  if (carregandoSessao || carregandoTickets || carregandoNotificacoes) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!canAccessPage) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para acessar a gestão de suporte.</p></CardContent></Card></LayoutPrincipal>;
  }
  
  if (ticketSelecionado) {
      return (
        <LayoutPrincipal>
            <TicketDetalhe 
                ticket={ticketSelecionado} 
                onClose={handleCloseDetalhe} 
                onUpdate={fetchTickets}
                isAdminView={true}
            />
        </LayoutPrincipal>
      );
  }

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold flex items-center mb-6">
        <MessageSquare className="w-6 h-6 mr-2" /> Gestão de Tickets (Admin)
      </h1>
      
      {/* CARDS DE RESUMO (5 Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="border-l-4 border-destructive">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-destructive">Abertos (Novos)</CardTitle>
                  <AlertTriangle className="w-4 h-4 text-destructive" />
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold">{ticketsAbertos}</div>
              </CardContent>
          </Card>
          <Card className="border-l-4 border-primary">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Em Progresso</CardTitle>
                  <Clock className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold">{ticketsEmProgresso}</div>
              </CardContent>
          </Card>
          <Card className="border-l-4 border-warning">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-yellow-600">Pausados</CardTitle>
                  <Pause className="w-4 h-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold">{ticketsPausados}</div>
              </CardContent>
          </Card>
          <Card className="border-l-4 border-secondary">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Fechados</CardTitle>
                  <CheckCircle2 className="w-4 h-4 text-secondary" />
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold">{ticketsFechados}</div>
              </CardContent>
          </Card>
          <Card className="border-l-4 border-green-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-green-600">Para Responder</CardTitle>
                  <MessageSquare className="w-4 h-4 text-green-500" />
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold">{mensagensParaResponder}</div>
              </CardContent>
          </Card>
      </div>
      {/* FIM CARDS DE RESUMO */}

      <Card className="mb-6">
        <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-4">
            <Input
                placeholder="Buscar por título, criador ou ID..."
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                className="w-full md:max-w-xs"
            />
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="Filtrar por Status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="todos">Todos os Status</SelectItem>
                    <SelectItem value="aberto">Aberto</SelectItem>
                    <SelectItem value="em_progresso">Em Progresso</SelectItem>
                    <SelectItem value="pausado">Pausado</SelectItem>
                    <SelectItem value="fechado">Fechado</SelectItem>
                </SelectContent>
            </Select>
            {isAdmin && (
                <Select value={filtroEmpresaId} onValueChange={setFiltroEmpresaId}>
                    <SelectTrigger className="w-full md:w-[250px]">
                        <Building2 className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Filtrar por Empresa" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todos">Todas as Empresas</SelectItem>
                        {empresasFiltro.map(e => (
                            <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {tickets.length === 0 ? (
          <Card><CardContent className="text-center py-8 text-muted-foreground">Nenhum ticket encontrado com os filtros aplicados.</CardContent></Card>
        ) : (
          tickets.map(ticket => (
            <TicketCard 
                key={ticket.id} 
                ticket={ticket} 
                onClick={handleOpenTicket} 
                onDelete={handleDeleteTicket} // PASSANDO O HANDLER DE DELETE
                isAdminView={true}
                isOwner={ticket.proprietario_id === usuario?.id} // Admin é o 'dono' para fins de gerenciamento/exclusão
            />
          ))
        )}
      </div>
    </LayoutPrincipal>
  );
};

export default AdminSuporte;