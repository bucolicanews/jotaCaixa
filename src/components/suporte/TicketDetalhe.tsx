import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Send, MessageSquare, AlertTriangle, User, Download, X, Pause, CheckCircle2, Undo2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

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
  ultima_mensagem_remetente_id: string | null;
}

interface Mensagem {
  id: string;
  remetente_id: string;
  conteudo: string;
  anexo_url: string | null;
  criado_em: string;
  remetente_perfil: { nome: string } | null;
}

interface TicketDetalheProps {
  ticket: Ticket;
  onClose: () => void;
  onUpdate: () => void;
  isAdminView: boolean;
}

const TicketDetalhe: React.FC<TicketDetalheProps> = ({ ticket, onClose, onUpdate, isAdminView }) => {
  const { usuario } = useSessao();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [loadingMensagens, setLoadingMensagens] = useState(true);
  const [loadingAcao, setLoadingAcao] = useState(false);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [anexoFile, setAnexoFile] = useState<File | null>(null);
  const [currentStatus, setCurrentStatus] = useState(ticket.status);
  const [currentPrioridade, setCurrentPrioridade] = useState(ticket.prioridade);
  const scrollRef = useRef<HTMLDivElement>(null);

  const remetenteId = usuario?.id;
  const clienteId = ticket.proprietario_id;
  const adminId = ticket.empresa_id;
  
  const canManage = isAdminView || remetenteId === clienteId;
  const isClosed = currentStatus === 'fechado';
  
  // Lógica de Responsabilidade
  const ultimaMensagemId = ticket.ultima_mensagem_remetente_id || clienteId;
  
  const lastSenderIsAdmin = ultimaMensagemId === adminId;
  const lastSenderIsClient = ultimaMensagemId === clienteId;
  
  // Quem é o responsável pela próxima ação?
  const isWaitingForAdmin = lastSenderIsClient; // Se o cliente enviou por último, Admin deve responder
  const isWaitingForClient = lastSenderIsAdmin; // Se o admin enviou por último, Cliente deve responder
  
  // É a vez do usuário logado responder?
  const isMyTurn = (isAdminView && isWaitingForAdmin) || (!isAdminView && isWaitingForClient);
  
  // A resposta está desabilitada se o ticket estiver fechado OU não for a vez do usuário
  const isReplyDisabled = isClosed || !isMyTurn;
  
  const responsavelNome = isWaitingForAdmin ? 'Administrador' : (ticket.proprietario_perfil?.nome || 'Cliente');


  const fetchMensagens = useCallback(async () => {
    setLoadingMensagens(true);
    
    const { data, error } = await supabase
      .from('mensagens_ticket')
      .select(`
        id,
        remetente_id,
        conteudo,
        anexo_url,
        criado_em
      `)
      .eq('ticket_id', ticket.id)
      .order('criado_em', { ascending: true });

    if (error) {
      showError('Erro ao carregar mensagens: ' + error.message);
      setMensagens([]);
    } else {
      // Mapeamento manual do nome do remetente (simplificado)
      const mensagensComNome = await Promise.all((data as any[]).map(async (msg) => {
          let nome = 'N/A';
          // Se o remetente for o Admin (empresa_id)
          if (msg.remetente_id === adminId) {
              nome = 'Admin'; 
          } else if (msg.remetente_id === clienteId) {
              nome = ticket.proprietario_perfil?.nome || 'Cliente';
          } else {
              // Tenta buscar o nome do usuário/cliente
              const { data: userData } = await supabase.from('tbl_usuarios').select('nome').eq('id', msg.remetente_id).single();
              nome = userData?.nome || 'Usuário';
          }
          
          return {
              ...msg,
              remetente_perfil: { nome: nome }
          } as Mensagem;
      }));
      
      setMensagens(mensagensComNome);
    }
    setLoadingMensagens(false);
  }, [ticket.id, adminId, clienteId, ticket.proprietario_perfil?.nome]);

  useEffect(() => {
    fetchMensagens();
    setCurrentStatus(ticket.status);
    setCurrentPrioridade(ticket.prioridade);
  }, [ticket, fetchMensagens]);
  
  // Scroll para o final das mensagens
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagens]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAnexoFile(e.target.files?.[0] || null);
  };

  const uploadAnexo = async (file: File, ticketId: string): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const filePath = `tickets/${ticketId}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

    const { error } = await supabase.storage
      .from('suporte-anexos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error("Erro de upload:", error);
      throw new Error('Falha ao fazer upload do anexo: ' + error.message);
    }

    const { data: publicUrlData } = supabase.storage.from('suporte-anexos').getPublicUrl(filePath);
    return publicUrlData.publicUrl;
  };

  const handleSendMensagem = async () => {
    if (!remetenteId || (!novaMensagem.trim() && !anexoFile)) {
      showError('Digite uma mensagem ou anexe um arquivo.');
      return;
    }
    setLoadingAcao(true);

    try {
      let anexoUrl: string | null = null;
      if (anexoFile) {
        anexoUrl = await uploadAnexo(anexoFile, ticket.id);
      }

      const mensagemPayload = {
        ticket_id: ticket.id,
        remetente_id: remetenteId,
        conteudo: novaMensagem.trim() || 'Anexo enviado.',
        anexo_url: anexoUrl,
      };

      const { error: mensagemError } = await supabase
        .from('mensagens_ticket')
        .insert(mensagemPayload);

      if (mensagemError) throw mensagemError;
      
      // 1. Atualiza o status do ticket para 'em_progresso' se estiver 'aberto'
      if (currentStatus === 'aberto') {
          await handleUpdateStatus('em_progresso');
      } else {
          // 2. Apenas atualiza o campo 'atualizado_em'
          await supabase.from('tickets').update({ atualizado_em: new Date().toISOString() }).eq('id', ticket.id);
      }

      showSuccess('Mensagem enviada!');
      setNovaMensagem('');
      setAnexoFile(null);
      fetchMensagens();
      onUpdate(); // Notifica o pai para recarregar a lista
      
    } catch (error: any) {
      showError(`Falha ao enviar mensagem: ${error.message}`);
    } finally {
      setLoadingAcao(false);
    }
  };
  
  const handleUpdateStatus = async (newStatus: Ticket['status']) => {
      if (!canManage || loadingAcao) return;
      setLoadingAcao(true);
      
      try {
          const { error } = await supabase
              .from('tickets')
              .update({ status: newStatus, atualizado_em: new Date().toISOString() })
              .eq('id', ticket.id);
              
          if (error) throw error;
          
          setCurrentStatus(newStatus);
          showSuccess(`Status atualizado para: ${newStatus}`);
          onUpdate();
      } catch (error: any) {
          showError('Falha ao atualizar status: ' + error.message);
      } finally {
          setLoadingAcao(false);
      }
  };
  
  const handleUpdatePrioridade = async (newPrioridade: Ticket['prioridade']) => {
      if (!canManage || loadingAcao) return;
      setLoadingAcao(true);
      
      try {
          const { error } = await supabase
              .from('tickets')
              .update({ prioridade: newPrioridade, atualizado_em: new Date().toISOString() })
              .eq('id', ticket.id);
              
          if (error) throw error;
          
          setCurrentPrioridade(newPrioridade);
          showSuccess(`Prioridade atualizada para: ${newPrioridade}`);
          onUpdate();
      } catch (error: any) {
          showError('Falha ao atualizar prioridade: ' + error.message);
      } finally {
          setLoadingAcao(false);
      }
  };
  
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
  

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="border-b p-4">
        <div className="flex justify-between items-start">
          <CardTitle className="text-2xl flex items-center">
            <MessageSquare className="w-6 h-6 mr-2" /> {ticket.titulo}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
        </div>
        <div className="flex items-center space-x-4 text-sm mt-2">
            <Badge variant={getStatusVariant(currentStatus)}>{currentStatus.toUpperCase()}</Badge>
            <span className={cn("flex items-center font-medium", getPriorityColor(currentPrioridade))}>
                <AlertTriangle className="w-4 h-4 mr-1" /> {currentPrioridade.toUpperCase()}
            </span>
            <span className="flex items-center text-muted-foreground">
                <User className="w-4 h-4 mr-1" /> {ticket.proprietario_perfil?.nome || 'N/A'}
            </span>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 p-4 overflow-y-auto flex flex-col">
        
        {/* Ações de Gestão (Apenas Admin ou Proprietário) */}
        {canManage && (
            <div className="flex flex-wrap gap-2 mb-4 p-3 border rounded-md bg-secondary/50">
                <Select value={currentStatus} onValueChange={(v: Ticket['status']) => handleUpdateStatus(v)} disabled={loadingAcao}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Mudar Status" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="aberto">Aberto</SelectItem>
                        <SelectItem value="em_progresso">Em Progresso</SelectItem>
                        <SelectItem value="pausado">Pausado</SelectItem>
                        <SelectItem value="fechado">Fechado</SelectItem>
                    </SelectContent>
                </Select>
                
                {isAdminView && (
                    <Select value={currentPrioridade} onValueChange={(v: Ticket['prioridade']) => handleUpdatePrioridade(v)} disabled={loadingAcao}>
                        <SelectTrigger className="w-[150px]"><SelectValue placeholder="Mudar Prioridade" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="baixa">Baixa</SelectItem>
                            <SelectItem value="media">Média</SelectItem>
                            <SelectItem value="alta">Alta</SelectItem>
                        </SelectContent>
                    </Select>
                )}
                
                {isClosed && (
                    <Button variant="outline" size="sm" onClick={() => handleUpdateStatus('aberto')} disabled={loadingAcao}>
                        <Undo2 className="w-4 h-4 mr-1" /> Reabrir
                    </Button>
                )}
                {!isClosed && currentStatus !== 'pausado' && (
                    <Button variant="outline" size="sm" onClick={() => handleUpdateStatus('pausado')} disabled={loadingAcao}>
                        <Pause className="w-4 h-4 mr-1" /> Pausar
                    </Button>
                )}
                {!isClosed && (
                    <Button variant="default" size="sm" onClick={() => handleUpdateStatus('fechado')} disabled={loadingAcao}>
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Fechar
                    </Button>
                )}
            </div>
        )}

        {/* Histórico de Mensagens */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-2">
          {loadingMensagens ? (
            <div className="flex justify-center items-center h-40"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            mensagens.map((msg) => {
              const isMyMessage = msg.remetente_id === remetenteId;
              const remetenteNome = msg.remetente_perfil?.nome || 'N/A';
              
              return (
                <div 
                  key={msg.id} 
                  className={cn(
                    "flex",
                    isMyMessage ? "justify-end" : "justify-start"
                  )}
                >
                  <div 
                    className={cn(
                      "max-w-[80%] p-3 rounded-lg shadow-md",
                      isMyMessage ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                    )}
                  >
                    <div className="flex justify-between items-center mb-1">
                        <span className={cn("font-semibold text-sm", isMyMessage ? "text-white/80" : "text-primary")}>
                            {isMyMessage ? 'Você' : remetenteNome}
                        </span>
                        <span className={cn("text-xs ml-2", isMyMessage ? "text-white/60" : "text-muted-foreground")}>
                            {format(parseISO(msg.criado_em), 'dd/MM HH:mm', { locale: ptBR })}
                        </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{msg.conteudo}</p>
                    {msg.anexo_url && (
                        <a 
                            href={msg.anexo_url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className={cn("text-xs mt-2 flex items-center hover:underline", isMyMessage ? "text-white/90" : "text-blue-600")}
                        >
                            <Download className="w-3 h-3 mr-1" /> Baixar Anexo
                        </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        
        {/* Área de Resposta */}
        <div className="mt-4 pt-4 border-t">
            {isClosed ? (
                <div className="p-4 bg-secondary rounded-md text-center text-muted-foreground">
                    Este ticket está fechado. Reabra-o para enviar novas mensagens.
                </div>
            ) : (
                <>
                    {/* Indicador de Responsabilidade */}
                    <div className={cn("p-2 rounded-md mb-3 text-sm font-medium", isReplyDisabled ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300" : "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300")}>
                        
                        {isReplyDisabled ? (
                            // BLOQUEADO / AGUARDANDO OUTRA PARTE
                            isAdminView ? (
                                <span>Aguardando resposta do(a) <span className="font-bold">{responsavelNome}</span>. Sua resposta está bloqueada.</span>
                            ) : (
                                <span>
                                    Aguardando resposta do(a) <span className="font-bold">Administrador</span>. Sua resposta está bloqueada.
                                </span>
                            )
                        ) : (
                            // LIBERADO / SUA VEZ
                            isAdminView ? (
                                <span>Sua vez de responder.</span>
                            ) : (
                                <span>
                                    Mensagem retornou do suporte. Sua vez de responder.
                                </span>
                            )
                        )}
                    </div>
                    
                    <h4 className="font-semibold mb-2">Responder</h4>
                    <Textarea 
                        placeholder="Digite sua mensagem..." 
                        value={novaMensagem}
                        onChange={(e) => setNovaMensagem(e.target.value)}
                        rows={3}
                        disabled={loadingAcao || isReplyDisabled}
                    />
                    <div className="flex items-center justify-between mt-2">
                        <Input type="file" onChange={handleFileChange} disabled={loadingAcao || isReplyDisabled} className="w-1/2" />
                        <Button 
                            onClick={handleSendMensagem} 
                            disabled={loadingAcao || isReplyDisabled || (!novaMensagem.trim() && !anexoFile)}
                        >
                            {loadingAcao ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Enviar
                        </Button>
                    </div>
                    {anexoFile && <p className="text-xs text-muted-foreground mt-1">Anexo pronto: {anexoFile.name}</p>}
                </>
            )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TicketDetalhe;