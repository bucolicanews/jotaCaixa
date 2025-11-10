import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MessageSquare, PlusCircle, Filter } from 'lucide-react';
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
  // Propriedade que estava causando o conflito de tipos
  ultima_mensagem_remetente_id: string | null; 
}

const Suporte: React.FC = () => {
  const { perfil, role, carregando: carregandoSessao, usuario } = useSessao();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [carregandoTickets, setCarregandoTickets] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [ticketSelecionado, setTicketSelecionado] = useState<Ticket | null>(null);
  const [filtroStatus, setFiltroStatus] = useState('aberto');

  const isClientOrAdmin = role === 'Cliente' || role === 'Admin';

  const getEmpresaId = () => {
    // Se for Cliente, o ticket é para o Admin (Admin ID)
    if (role === 'Cliente') return (perfil as ClienteProfile)?.admin_id || null;
    // Se for Admin, o ticket é para ele mesmo (Admin ID)
    if (role === 'Admin') return (perfil as any)?.id || null;
    
    return null;
  };
  
  const empresaId = getEmpresaId(); // ID do destinatário (Admin)

  const fetchTickets = useCallback(async () => {
    if (!empresaId) {
        setCarregandoTickets(false);
        return;
    }
    setCarregandoTickets(true);
    
    let query = supabase
      .from('tickets')
      .select(`
        *,
        mensagens_ticket_count:mensagens_ticket(count),
        ultima_mensagem:mensagens_ticket(remetente_id, criado_em, ticket_id)
      `)
      .eq('empresa_id', empresaId) // Filtra pelo ID do Admin (destinatário)
      .order('atualizado_em', { ascending: false });
      
    // Se for Cliente, filtra pelos tickets que ele criou
    if (role === 'Cliente') {
        query = query.eq('proprietario_id', (perfil as ClienteProfile)?.id);
    }
      
    if (filtroStatus !== 'todos') {
        query = query.eq('status', filtroStatus);
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
          
          // Extrai o ID do remetente da última mensagem (o Supabase retorna um array)
          const ultimaMensagem = t.ultima_mensagem?.[0];
          
          return {
              ...t,
              mensagens_ticket_count: t.mensagens_ticket_count[0].count,
              proprietario_perfil: { nome: nome },
              ultima_mensagem_remetente_id: ultimaMensagem?.remetente_id || null,
          } as Ticket;
      }));
      
      setTickets(ticketsComNome);
    }
    setCarregandoTickets(false);
  }, [empresaId, filtroStatus, role, perfil]);

  useEffect(() => {
    if (!carregandoSessao && empresaId) {
      fetchTickets();
    }
  }, [carregandoSessao, empresaId, fetchTickets]);
  
  const handleSaveComplete = () => {
    setDialogOpen(false);
    fetchTickets();
  };
  
  const handleOpenTicket = (ticket: Ticket) => {
      setTicketSelecionado(ticket);
  };
  
  const handleCloseDetalhe = () => {
      setTicketSelecionado(null);
      fetchTickets(); // Recarrega a lista para atualizar o status
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
                    <SelectItem value="aberto">Aberto</SelectItem>
                    <SelectItem value="em_progresso">Em Progresso</SelectItem>
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