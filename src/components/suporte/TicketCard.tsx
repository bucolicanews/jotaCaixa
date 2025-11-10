import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquare,
  Clock,
  AlertTriangle,
  User,
  Trash2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useSessao } from '@/hooks/use-sessao';

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
  ultima_mensagem_remetente_id: string | null;
  ultima_mensagem_destinatario_id: string | null;
}

interface TicketCardProps {
  ticket: Ticket;
  onClick: (ticket: Ticket) => void;
  onDelete: (ticketId: string, titulo: string) => void;
  isAdminView: boolean;
  isOwner: boolean;
}

const getStatusVariant = (
  status: Ticket['status']
): 'default' | 'secondary' | 'warning' | 'success' | 'destructive' => {
  switch (status) {
    case 'aberto':
      return 'destructive';
    case 'em_progresso':
      return 'default';
    case 'pausado':
      return 'warning';
    case 'fechado':
      return 'secondary';
    default:
      return 'secondary';
  }
};

const getPriorityColor = (prioridade: Ticket['prioridade']) => {
  switch (prioridade) {
    case 'alta':
      return 'text-red-500';
    case 'media':
      return 'text-yellow-500';
    case 'baixa':
      return 'text-green-500';
    default:
      return 'text-muted-foreground';
  }
};

const TicketCard: React.FC<TicketCardProps> = ({
  ticket,
  onClick,
  onDelete,
  isAdminView,
  isOwner,
}) => {
  const { usuario } = useSessao();
  const dataAtualizacao = parseISO(ticket.atualizado_em);
  const proprietarioNome = ticket.proprietario_perfil?.nome || 'N/A';

  const canDelete = isOwner && ticket.status === 'fechado';
  const isClosed = ticket.status === 'fechado';

  // --- Lógica de Responsabilidade ---
  const destinatarioUltimaMensagem = ticket.ultima_mensagem_destinatario_id;
  const isMyTurn = destinatarioUltimaMensagem === usuario?.id;
  
  let responsavelText = null;
  let responsavelColor = 'text-muted-foreground';

  if (!isClosed) {
    if (isMyTurn) {
      responsavelText = 'Sua vez de responder.';
      responsavelColor = 'text-green-500';
    } else if (destinatarioUltimaMensagem === ticket.empresa_id) {
      responsavelText = 'Aguardando Admin.';
      responsavelColor = 'text-blue-500';
    } else if (destinatarioUltimaMensagem === ticket.proprietario_id) {
      responsavelText = `Aguardando resposta do(a) ${proprietarioNome}.`;
      responsavelColor = 'text-yellow-500';
    }
  }

  return (
    <Card
      className={cn(
        'cursor-pointer hover:shadow-lg transition-shadow border border-yellow-700/50 dark:border-yellow-500/30 bg-[#020617] text-white relative',
        isMyTurn && !isClosed && 'bg-green-900/20 border-green-500/40'
      )}
    >
      {/* Botão de deletar (somente se for o dono e o ticket estiver fechado) */}
      {canDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-8 w-8 text-red-500 hover:text-red-700 z-10"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(ticket.id, ticket.titulo);
          }}
          title="Excluir Ticket"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}

      {/* Conteúdo clicável */}
      <div onClick={() => onClick(ticket)} className="p-4">
        <CardHeader className="flex flex-col space-y-2 pb-2">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg font-semibold truncate max-w-[80%]">
              {ticket.titulo}
            </CardTitle>
            <div className="flex items-center space-x-2">
                <Badge variant={getStatusVariant(ticket.status)}>
                    {ticket.status.replace('_', ' ')}
                </Badge>
                {/* Indicador de Responsabilidade no Header */}
                {responsavelText && (
                    <span className={cn("text-xs font-medium hidden sm:inline", responsavelColor)}>
                        {responsavelText}
                    </span>
                )}
            </div>
          </div>
          
          {/* Indicador de Responsabilidade em Mobile (abaixo do título) */}
          {responsavelText && (
              <span className={cn("text-xs font-medium sm:hidden", responsavelColor)}>
                  {responsavelText}
              </span>
          )}
        </CardHeader>

        <CardContent className="p-6 pt-0 space-y-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center space-x-3">
              <span
                className={cn('flex items-center', getPriorityColor(ticket.prioridade))}
              >
                <AlertTriangle className="w-4 h-4 mr-1" />
                {ticket.prioridade.toUpperCase()}
              </span>
              <span className="flex items-center">
                <MessageSquare className="w-4 h-4 mr-1" />{' '}
                {ticket.mensagens_ticket_count} Mensagens
              </span>
            </div>
            <span className="flex items-center text-xs">
              <Clock className="w-3 h-3 mr-1" />
              {format(dataAtualizacao, 'dd/MM/yy HH:mm', { locale: ptBR })}
            </span>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-yellow-900/30">
            {isAdminView && (
              <p className="text-xs text-muted-foreground flex items-center">
                <User className="w-3 h-3 mr-1" /> Criado por: {proprietarioNome}
              </p>
            )}
            
            {/* Removido o indicador de responsabilidade daqui */}
          </div>
        </CardContent>
      </div>
    </Card>
  );
};

export default TicketCard;