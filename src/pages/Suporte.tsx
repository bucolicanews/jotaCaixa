import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MessageSquare, PlusCircle, Filter, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormNovoTicket from '@/components/suporte/FormNovoTicket.tsx';
import TicketCard from '@/components/suporte/TicketCard.tsx';
import TicketDetalhe from '@/components/suporte/TicketDetalhe.tsx';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClienteProfile } from '@/types/usuario';
import { useTicketStatus } from '@/hooks/use-ticket-status'; // Importando o hook

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
}

const Suporte: React.FC = () => {
  const { perfil, role, carregando: carregandoSessao, usuario } = useSessao();
  const { ticketsAbertos, mensagensNaoLidas, refetch: refetchStatus } = useTicketStatus(); // Usando o hook
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [carregandoTickets, setCarregandoTickets] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ticketSelecionado, setTicketSelecionado] = useState<Ticket | null>(null);
  const [filtroStatus, setFiltroStatus] = useState('aberto');

  const isClientOrAdmin = role === 'Cliente' || role === 'Admin';

  const getEmpresaId = () => {
    // O destinatário (empresa_id) é sempre o Admin principal
    if (role === 'Cliente') return (perfil as ClienteProfile)?.admin_id || null;
    // Se for Admin, o ticket é para ele mesmo (Admin ID)
    if (role === 'Admin') return (perfil as any)?.id || null;
    
    return null;
  };
  
  const empresaId = getEmpresaId(); // ID do destinatário (Admin)

  const fetchTickets = useCallback(async () => {
    if (!empresaId || !usuario?.id) {
        setCarregandoTickets(false);
        return;
    }
    setCarregandoTickets(true);
    
    let query = supabase
      .from('tickets')
      .select(`
        *,
        mensagens_ticket_count:mensagens_ticket(count),
        ultima_mensagem:mensagens_ticket(remetente_id,destinatario_id,criado_em,ticket_id)
      `)
      .eq('empresa_id', empresaId) // Filtra pelo ID do Admin (destinatário)
      .order('atualizado_em', { ascending: false });
      
    // APLICAÇÃO CORRETA DE ORDER E LIMIT NA RELAÇÃO ANINHADA
    query = query
        .order('criado_em', { foreignTable: 'ultima_mensagem', ascending: false })
        .limit(1, { foreignTable: 'ultima_mensagem' });
      
    // Se for Cliente, filtra pelos tickets que ele criou
    if (role === 'Cliente') {
        query = query.eq('proprietario_id', (perfil as ClienteProfile)?.id);
    }
      
    if (filtroStatus !== 'todos') {
        query = query.in('status', filtroStatus === 'aberto' ? ['aberto', 'em_progresso', 'pausado'] : [filtroStatus]);
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar tickets: ' + error.message);
      setTickets([]);
    } else {
      // Mapeamento manual do nome do proprietário e da última mensagem
      const ticketsComNome = await Promise.all((data as any[]).map(async (t) => {
          let nome = 'N/A';
          // Tenta buscar o nome do proprietário na tbl_clientes ou tbl_admins
          const { data: perfilData } = await supabase.from('tbl_clientes').select('nome').eq('id', t.proprietario_id).single();
          if (perfilData) {
              nome = perfilData.nome;
          } else {
              const { data: adminData } = await supabase.from('tbl_admins').select('nome').eq('id', t.proprietario_id).single();
              nome = adminData?.nome || 'Admin';
          }
          
          // Extrai o ID do remetente e destinatário da última mensagem (o Supabase retorna um array)
          const ultimaMensagem = t.ultima_mensagem?.[0];
          
          return {
              ...t,
              // CORREÇÃO: Garante que o count seja um número
              mensagens_ticket_count: parseInt(t.mensagens_ticket_count?.[0]?.count || '0', 10),
              proprietario_perfil: { nome: nome },
              ultima_mensagem_remetente_id: ultimaMensagem?.remetente_id || null,
              ultima_mensagem_destinatario_id: ultimaMensagem?.destinatario_id || null, // NOVO CAMPO
          } as Ticket;
      }));
      
      setTickets(ticketsComNome);
    }
    setCarregandoTickets(false);
  }, [empresaId, filtroStatus, role, perfil, usuario?.id]);

  useEffect(() => {
    if (!carregandoSessao && empresaId) {
      fetchTickets();
    }
  }, [carregandoSessao, empresaId, fetchTickets]);
  
  const handleSaveComplete = () => {
    setDialogOpen(false);
    fetchTickets();
    refetchStatus(); // Atualiza o status do header
  };
  
  const handleOpenTicket = (ticket: Ticket) => {
      setTicketSelecionado(ticket);
  };
  
  const handleCloseDetalhe = () => {
      setTicketSelecionado(null);
      fetchTickets(); // Recarrega a lista para atualizar o status
      refetchStatus(); // Atualiza o status do header
  };
  
  const handleDeleteTicket = async (ticketId: string, titulo: string) => {
      if (!window.confirm(`Tem certeza que deseja excluir o ticket "${titulo}"? Esta ação é irreversível e só é permitida para tickets FECHADOS.`)) return;
      
      setCarregandoTickets(true);
      
      try {
          // A exclusão do ticket deve cascatear para as mensagens (RLS deve permitir)
          const { error } = await supabase
              .from('tickets')
              .delete()
              .eq('id', ticketId)
              .eq('proprietario_id', usuario?.id); // Garante que apenas o proprietário logado delete
              
          if (error) throw error;
          
          showSuccess(`Ticket "${titulo}" excluído com sucesso.`);
          fetchTickets();
      } catch (error: any) {
          showError('Falha ao excluir ticket: ' + error.message);
      } finally {
          setCarregandoTickets(false);
      }
  };

  if (carregandoSessao || carregandoTickets) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  // CORREÇÃO: Acesso negado se não for Admin ou Cliente
  if (!isClientOrAdmin || !empresaId) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Apenas clientes do sistema e administradores podem acessar o suporte.</p></CardContent></Card></LayoutPrincipal>;
  }
  
  if (ticketSelecionado) {
      return (
        <LayoutPrincipal>
            <TicketDetalhe 
                ticket={ticketSelecionado} 
                onClose={handleCloseDetalhe} 
                onUpdate={fetchTickets}
                isAdminView={false}
            />
        </LayoutPrincipal>
      );
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <MessageSquare className="w-6 h-6 mr-2" /> Meus Tickets de Suporte
        </h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setTicketSelecionado(null)} className="w-full sm:w-auto">
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Ticket
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Abrir Novo Ticket</DialogTitle>
            </DialogHeader>
            <FormNovoTicket onSaveComplete={handleSaveComplete} />
          </DialogContent>
        </Dialog>
      </div>
      
      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="border-l-4 border-red-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium flex items-center"><AlertTriangle className="w-4 h-4 mr-2" /> Tickets Abertos</CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold text-red-600">{ticketsAbertos}</div>
                  <p className="text-xs text-muted-foreground">Tickets em aberto, em progresso ou pausados.</p>
              </CardContent>
          </Card>
          <Card className="border-l-4 border-green-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium flex items-center"><CheckCircle2 className="w-4 h-4 mr-2" /> Mensagens Não Lidas</CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold text-green-600">{mensagensNaoLidas}</div>
                  <p className="text-xs text-muted-foreground">Mensagens aguardando sua resposta.</p>
              </CardContent>
          </Card>
          <Card className="border-l-4 border-primary">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium flex items-center"><MessageSquare className="w-4 h-4 mr-2" /> Total de Tickets</CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold">{tickets.length}</div>
                  <p className="text-xs text-muted-foreground">Total de tickets no histórico.</p>
              </CardContent>
          </Card>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros</CardTitle>
        </CardHeader>
        <CardContent>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="Filtrar por Status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="todos">Todos os Status</SelectItem>
                    <SelectItem value="aberto">Aberto/Em Progresso</SelectItem>
                    <SelectItem value="pausado">Pausado</SelectItem>
                    <SelectItem value="fechado">Fechado</SelectItem>
                </SelectContent>
            </Select>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {tickets.length === 0 ? (
          <Card><CardContent className="text-center py-8 text-muted-foreground">Nenhum ticket encontrado.</CardContent></Card>
        ) : (
          tickets.map(ticket => (
            <TicketCard 
                key={ticket.id} 
                ticket={ticket} 
                onClick={handleOpenTicket} 
                onDelete={handleDeleteTicket} // PASSANDO O HANDLER DE DELETE
                isAdminView={false}
                isOwner={ticket.proprietario_id === usuario?.id} // PASSANDO SE É O DONO
            />
          ))
        )}
      </div>
    </LayoutPrincipal>
  );
};

export default Suporte;