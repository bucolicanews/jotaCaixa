import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Clock, AlertTriangle, User } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Ticket {
  id: string;
  titulo: string;
  status: 'aberto' | 'em_progresso' | 'pausado' | 'fechado';
  prioridade: 'baixa' | 'media' | 'alta';
  criado_em: string;
  atualizado_em: string;
  proprietario_id: string;
  empresa_id: string;
  
  // Relações
  proprietario_perfil: { nome: string } | null;
  mensagens_ticket_count: number;
}

interface TicketCardProps {
  ticket: Ticket;
  onClick: (ticket: Ticket) => void;
  isAdminView: boolean;
}

const getStatusVariant = (status: Ticket['status']): 'default' | 'secondary' | 'warning' | 'success' | 'destructive' => {
  switch (status) {
    case 'aberto': return 'destructive';
    case 'em_progresso': return 'default';
    case 'pausado': return 'warning';
    case 'fechado': return 'secondary';
    default: return 'secondary';
  }
};

const getPriorityColor = (prioridade: Ticket['prioridade']) => {
  switch (prioridade) {
    case 'alta': return 'text-red-500';
    case 'media': return 'text-yellow-500';
    case 'baixa': return 'text-green-500';
    default: return 'text-muted-foreground';
  }
};

const TicketCard: React.FC<TicketCardProps> = ({ ticket, onClick, isAdminView }) => {
  const dataAtualizacao = parseISO(ticket.atualizado_em);
  const proprietarioNome = ticket.proprietario_perfil?.nome || 'N/A';

  return (
    <Card 
      className={cn(
        "cursor-pointer hover:shadow-lg transition-shadow border-l-4",
        ticket.prioridade === 'alta' ? 'border-red-500' : 'border-primary/50'
      )}
      onClick={() => onClick(ticket)}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-semibold truncate max-w-[80%]">
          {ticket.titulo}
        </CardTitle>
        <Badge variant={getStatusVariant(ticket.status)}>{ticket.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center space-x-3">
            <span className={cn("flex items-center", getPriorityColor(ticket.prioridade))}>
              <AlertTriangle className="w-4 h-4 mr-1" /> {ticket.prioridade.toUpperCase()}
            </span>
            <span className="flex items-center">
              <MessageSquare className="w-4 h-4 mr-1" /> {ticket.mensagens_ticket_count} Mensagens
            </span>
          </div>
          <span className="flex items-center text-xs">
            <Clock className="w-3 h-3 mr-1" /> {format(dataAtualizacao, 'dd/MM/yy HH:mm', { locale: ptBR })}
          </span>
        </div>
        
        {isAdminView && (
            <p className="text-xs text-muted-foreground flex items-center pt-1 border-t">
                <User className="w-3 h-3 mr-1" /> Criado por: {proprietarioNome}
            </p>
        )}
      </CardContent>
    </Card>
  );
};

export default TicketCard;