import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MessageSquare, Filter, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import TicketCard from '@/components/suporte/TicketCard.tsx';
import TicketDetalhe from '@/components/suporte/TicketDetalhe.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';

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
}

interface EmpresaFiltro {
    id: string;
    nome: string;
}

const AdminSuporte: React.FC = () => {
  const { role, carregando: carregandoSessao } = useSessao();
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
    if (!isAdmin) {
        setCarregandoTickets(false);
        return;
    }
    setCarregandoTickets(true);
    
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
        mensagens_ticket_count:mensagens_ticket(count)
      `)
      .order('atualizado_em', { ascending: false });
      
    if (filtroStatus !== 'todos') {
        query = query.eq('status', filtroStatus);
    }
    
    if (filtroEmpresaId !== 'todos') {
        query = query.eq('empresa_id', filtroEmpresaId);
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar tickets: ' + error.message);
      setTickets([]);
    } else {
      let rawTickets = (data as any[]).map(t => ({
          ...t,
          mensagens_ticket_count: t.mensagens_ticket_count[0].count,
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
      let mappedData = rawTickets.map(t => ({
          ...t,
          proprietario_perfil: { nome: nomeMap[t.proprietario_id] || 'N/A' }
      }));
      
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
  }, [isAdmin, filtroStatus, filtroEmpresaId, filtroTextoDebounced]);

  useEffect(() => {
    if (!carregandoSessao && isAdmin) {
      fetchEmpresasFiltro();
      fetchTickets();
    }
  }, [carregandoSessao, isAdmin, fetchEmpresasFiltro, fetchTickets]);
  
  const handleOpenTicket = (ticket: Ticket) => {
      setTicketSelecionado(ticket);
  };
  
  const handleCloseDetalhe = () => {
      setTicketSelecionado(null);
      fetchTickets(); // Recarrega a lista para atualizar o status
  };
  
  const handleDeleteTicket = async (ticketId: string, titulo: string) => {
      if (!window.confirm(`Tem certeza que deseja excluir o ticket "${titulo}"? Esta ação é irreversível.`)) return;
      
      setCarregandoTickets(true);
      
      try {
          // Admin pode deletar qualquer ticket, mas a RLS deve ser configurada para permitir isso.
          // A RLS atual permite que o Admin gerencie todos os tickets.
          const { error } = await supabase
              .from('tickets')
              .delete()
              .eq('id', ticketId);
              
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
  
  if (!isAdmin) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Apenas administradores podem acessar esta página.</p></CardContent></Card></LayoutPrincipal>;
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
                isOwner={true} // Admin é o 'dono' para fins de gerenciamento/exclusão
            />
          ))
        )}
      </div>
    </LayoutPrincipal>
  );
};

export default AdminSuporte;