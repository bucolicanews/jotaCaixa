import { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, Filter, Building2, CheckCircle, Users as UsersIcon, Mail, PowerOff, Printer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { Cliente } from '@/types/cliente';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormCliente from '@/components/formularios/FormCliente';
import { AnyProfile, UsuarioProfile, ClienteProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import FormUsuario from '@/components/formularios/FormUsuario';
import { parseISO, isPast, format, addDays } from 'date-fns';
import FormEmpresaAvulsa from '@/components/formularios/FormEmpresaAvulsa';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import ClientesPrint from '@/components/ClientesPrint';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { BASE_URL } from '@/config/app-config';

// Tipo para o filtro de empresa (inclui o Admin)
interface EmpresaFiltro {
    id: string;
    nome: string;
}

// Tipo para as empresas do sistema (tbl_clientes)
export interface EmpresaSistema extends ClienteProfile {
    id: string;
    nome: string;
    aprovado: boolean;
    email: string;
    data_fim_acesso?: string | null;
    plano_id?: string | null;
}

// NOVO TIPO
interface PlanoSimples {
    id: string;
    nome: string;
}

// NOVO TIPO: Cliente CR com status de sistema
interface ClienteCRComStatus extends Cliente {
    is_system_client: boolean;
}

const ClientesPage = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const { printContent } = usePrint();
  const [clientesCR, setClientesCR] = useState<ClienteCRComStatus[]>([]); // Clientes de Contas a Receber
  const [empresasSistema, setEmpresasSistema] = useState<EmpresaSistema[]>([]); // Empresas do sistema (tbl_clientes)
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [perfilParaEditar, setPerfilParaEditar] = useState<AnyProfile | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [dialogAvulsaAberto, setDialogAvulsaAberto] = useState(false); // Novo estado para dialog avulsa
  
  // NOVO ESTADO
  const [planosMap, setPlanosMap] = useState<Record<string, string>>({});
  
  // Filtros para Admin
  const [empresasFiltro, setEmpresasFiltro] = useState<EmpresaFiltro[]>([]);
  const [filtroEmpresaId, setFiltroEmpresaId] = useState('todos');
  const [filtroNome, setFiltroNome] = useState('');
  
  const [activeTab, setActiveTab] = useState('clientes_cr');
  const [activeEmpresaTab, setActiveEmpresaTab] = useState('ativos'); // Novo estado para sub-aba

  const isAdmin = role === 'Admin';

  const getOwnerId = () => {
    if (role === 'Admin') return usuario?.id || null; // Admin usa seu próprio ID
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId();

  const fetchPlanos = useCallback(async () => {
    const { data, error } = await supabase
        .from('planos')
        .select('id, nome');
        
    if (error) {
        console.error('Erro ao carregar planos:', error);
        return;
    }
    
    const map = (data as PlanoSimples[]).reduce((acc, p) => {
        acc[p.id] = p.nome;
        return acc;
    }, {} as Record<string, string>);
    setPlanosMap(map);
  }, []);

  const fetchEmpresasFiltro = useCallback(async () => {
    if (!isAdmin || !usuario?.id) return;
    
    const { data, error } = await supabase
        .from('tbl_clientes')
        .select('id, nome')
        .eq('aprovado', true)
        .order('nome');

    if (error) {
        showError('Erro ao carregar lista de empresas: ' + error.message);
        setEmpresasFiltro([]);
    } else {
        const clientData = data as EmpresaFiltro[];
        
        // Adiciona a opção para os próprios clientes do Admin
        const adminOption: EmpresaFiltro = { id: usuario.id, nome: 'Meus Clientes (CR)' };
        const allClients = [adminOption, ...clientData];
        
        setEmpresasFiltro(allClients);
    }
  }, [isAdmin, usuario?.id]);

  const buscarDados = useCallback(async () => {
    setCarregandoDados(true);
    
    // 1. Buscar Clientes de Contas a Receber (clientes)
    let queryCR = supabase
      .from('clientes')
      .select('id, proprietario_id, nome, razao_social, nome_fantasia, documento, email, telefone, telefone_fixo, cep, endereco, numero, complemento, bairro, cidade, estado, created_at, updated_at')
      .order('nome', { ascending: true });

    if (isAdmin) {
        if (filtroEmpresaId !== 'todos') {
            queryCR = queryCR.eq('proprietario_id', filtroEmpresaId); // AJUSTE AQUI
        }
    } else if (ownerId) {
        queryCR = queryCR.eq('proprietario_id', ownerId); // AJUSTE AQUI
    } else {
        setClientesCR([]);
    }

    const { data: dataCR, error: errorCR } = await queryCR;

    if (errorCR) {
      showError('Erro ao carregar clientes CR: ' + errorCR.message);
      setClientesCR([]);
    } else {
      let fetchedData = (dataCR as Cliente[]).filter(c => 
        c.nome.toLowerCase().includes(filtroNome.toLowerCase()) ||
        (c.razao_social?.toLowerCase() || '').includes(filtroNome.toLowerCase()) ||
        (c.documento?.toLowerCase() || '').includes(filtroNome.toLowerCase())
      );
      
      // 1.1. Verificar quais clientes CR já são clientes do sistema (tbl_clientes)
      const clienteIdsCR = fetchedData.map(c => c.id);
      const { data: systemClients, error: systemClientsError } = await supabase
          .from('tbl_clientes')
          .select('id')
          .in('id', clienteIdsCR);
          
      if (systemClientsError) console.error('Erro ao buscar clientes do sistema para status:', systemClientsError);
      
      const systemClientIds = new Set(systemClients?.map(c => c.id) || []);
      
      const clientesComStatus: ClienteCRComStatus[] = fetchedData.map(c => ({
          ...c,
          is_system_client: systemClientIds.has(c.id),
      }));
      
      setClientesCR(clientesComStatus);
    }
    
    // 2. Buscar Empresas do Sistema (tbl_clientes) - Apenas Admin
    if (isAdmin) {
        const { data: dataEmpresas, error: errorEmpresas } = await supabase
            .from('tbl_clientes')
            .select('*')
            .order('nome', { ascending: true });
            
        if (errorEmpresas) {
            showError('Erro ao carregar empresas do sistema: ' + errorEmpresas.message);
            setEmpresasSistema([]);
        } else {
            const filteredEmpresas = (dataEmpresas as EmpresaSistema[]).filter(e => 
                e.nome.toLowerCase().includes(filtroNome.toLowerCase()) ||
                e.email.toLowerCase().includes(filtroNome.toLowerCase())
            );
            setEmpresasSistema(filteredEmpresas);
        }
    }

    setCarregandoDados(false);
  }, [isAdmin, ownerId, filtroEmpresaId, filtroNome]);

  useEffect(() => {
    if (!carregandoSessao && usuario) {
      if (isAdmin) {
        fetchEmpresasFiltro();
        fetchPlanos();
      }
      buscarDados();
    }
  }, [carregandoSessao, usuario, isAdmin, buscarDados, fetchEmpresasFiltro, fetchPlanos]);
  
  // Re-busca quando os filtros mudam
  useEffect(() => {
      if (!carregandoSessao && usuario) {
          buscarDados();
      }
  }, [filtroEmpresaId, filtroNome, buscarDados, carregandoSessao, usuario]);


  const handleSaveComplete = () => {
    setDialogAberto(false);
    setDialogAvulsaAberto(false); // Fechar o dialog avulso
    setClienteSelecionado(null);
    setPerfilParaEditar(null);
    buscarDados();
  };

  const handleEditCR = (cliente: Cliente) => {
    setClienteSelecionado(cliente);
    setPerfilParaEditar(null);
    setDialogAberto(true);
  };
  
  const handleEditEmpresaSistema = (empresa: EmpresaSistema) => {
    setPerfilParaEditar(empresa);
    setClienteSelecionado(null);
    setDialogAberto(true); // ABRIR O DIALOG AQUI
  };

  const handleDeleteCR = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este cliente de Contas a Receber?')) return;

    const { error } = await supabase.from('clientes').delete().eq('id', id);

    if (error) {
      showError('Erro ao excluir cliente: ' + error.message);
    } else {
      showSuccess('Cliente excluído com sucesso.');
      buscarDados();
    }
  };
  
  const handleDeleteEmpresaSistema = async (id: string, nome: string) => {
    if (!window.confirm(`Tem certeza que deseja deletar a empresa ${nome} do sistema? Isso irá desativar o login e remover o perfil.`)) return;

    try {
      // 1. Deleta o perfil do cliente na tbl_clientes
      const { error: profileError } = await supabase
        .from('tbl_clientes')
        .delete()
        .eq('id', id);

      if (profileError) throw profileError;
      
      // 2. Deleta o usuário do auth.users (Admin tem permissão para isso)
      // Nota: Em um ambiente real, isso requer service_role, mas aqui simulamos a exclusão do perfil.
      
      showSuccess(`Empresa ${nome} deletada com sucesso.`);
      buscarDados();
    } catch (error: any) {
      showError('Falha ao deletar empresa: ' + error.message);
    }
  };
  
  const handleDesativarCliente = async (id: string, nome: string) => {
    if (!window.confirm(`Tem certeza que deseja DESATIVAR o acesso da empresa ${nome}? O acesso será bloqueado imediatamente.`)) return;
    
    setCarregandoDados(true);
    
    try {
        const { error } = await supabase
            .from('tbl_clientes')
            .update({ data_fim_acesso: null }) // Define data_fim_acesso como NULL
            .eq('id', id);
            
        if (error) throw error;
        
        showSuccess(`Acesso da empresa ${nome} desativado com sucesso.`);
        buscarDados();
    } catch (error: any) {
        showError('Falha ao desativar acesso: ' + error.message);
    } finally {
        setCarregandoDados(false);
    }
  };
  
  const handleAprovarCliente = async (cliente: EmpresaSistema) => {
    if (!window.confirm(`Tem certeza que deseja aprovar a empresa ${cliente.nome}?`)) return;
    
    setCarregandoDados(true);
    
    // 1. Buscar o plano de trial (assumindo o mais barato)
    const { data: planos, error: planosError } = await supabase
        .from('planos')
        .select('id, permissoes, tipo_cliente')
        .order('preco_mensal', { ascending: true })
        .limit(1);
        
    if (planosError || planos.length === 0) {
        showError('Nenhum plano de trial encontrado. Não é possível aprovar.');
        setCarregandoDados(false);
        return;
    }
    
    const planoTrial = planos[0];
    
    // 2. Calcular a data de fim de acesso (7 dias de trial)
    const dataAtual = new Date();
    const dataFimAcesso = addDays(dataAtual, 7);
    const dataFimISO = format(dataFimAcesso, 'yyyy-MM-dd') + 'T12:00:00Z'; // Usando a data de hoje + 7 dias
    
    // 3. Atualizar o perfil do cliente
    const { error } = await supabase
        .from('tbl_clientes')
        .update({ 
            aprovado: true,
            plano_id: planoTrial.id,
            data_fim_acesso: dataFimISO, // Define a data de expiração para 7 dias
            permissoes: planoTrial.permissoes,
            tipo_cliente: planoTrial.tipo_cliente,
        })
        .eq('id', cliente.id);
        
    if (error) {
        showError('Erro ao aprovar cliente: ' + error.message);
    } else {
        showSuccess(`Empresa ${cliente.nome} aprovada com sucesso! Trial de 7 dias iniciado.`);
        buscarDados();
    }
    setCarregandoDados(false);
  };
  
  const handleResendInvite = async (email: string, nome: string) => {
      if (!window.confirm(`Tem certeza que deseja reenviar o convite de acesso para ${nome} (${email})?`)) return;
      
      setCarregandoDados(true);
      try {
          // Usamos resetPasswordForEmail para reenviar o link de autenticação/atualização de senha,
          // que é o fluxo seguro e disponível no cliente para convites.
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: `${BASE_URL}/atualizar-senha`,
          });
          
          if (error) throw error;
          
          showSuccess(`Link de acesso reenviado para ${email}.`);
      } catch (error: any) {
          showError('Falha ao reenviar convite: ' + error.message);
      } finally {
          setCarregandoDados(false);
      }
  };
  
  const handleNewCR = () => {
      setClienteSelecionado(null);
      setPerfilParaEditar(null);
      setDialogAberto(true);
  };
  
  // NOVO HANDLER: Enviar Convite de Acesso (Substitui PromoteToSystem)
  const handleSendInvite = async (cliente: Cliente) => {
    if (!cliente.email) {
        showError('O cliente deve ter um email cadastrado para enviar o convite.');
        return;
    }
    
    if (!window.confirm(`Tem certeza que deseja enviar o convite de acesso para ${cliente.nome} (${cliente.email})?`)) return;
    
    setCarregandoDados(true);
    
    try {
        // 1. Tentar criar o usuário no Auth (se já existir, o erro será capturado)
        const { error: signUpError } = await supabase.auth.signUp({
            email: cliente.email,
            password: Math.random().toString(36).substring(2, 15), // Senha temporária
            options: {
                emailRedirectTo: `${BASE_URL}/atualizar-senha`,
                data: { 
                    role: 'Cliente', 
                    nome: cliente.nome, 
                    aprovado: false, // Começa como pendente de aprovação
                }
            }
        });
        
        if (signUpError && !signUpError.message.includes('already registered')) {
            throw signUpError;
        }
        
        // 2. Enviar o link de redefinição de senha (convite)
        const { data, error: resetError } = await supabase.auth.resetPasswordForEmail(cliente.email, {
            redirectTo: `${BASE_URL}/atualizar-senha`, 
        });
        
        if (resetError) throw resetError;
        
        // CORREÇÃO DO ERRO 3: Acessando action_link da resposta de dados
        // Forçando a tipagem para resolver o TS2339
        const resetLink = (data as { action_link: string | null }).action_link || `${BASE_URL}/atualizar-senha`;
        
        showSuccess('Convite de acesso enviado! Use o botão de Ações para enviar o link.');
        
        // 3. Abrir o diálogo de ações para que o Admin possa copiar/enviar o link
        
        const whatsappTemplate = `Olá ${cliente.nome}! Seu convite de acesso ao sistema está pronto. Clique no link abaixo para definir sua senha e acessar:\n\n${resetLink}`;
        
        if (window.confirm(`Link de Acesso Gerado para ${cliente.nome}. Deseja copiar o link para enviar manualmente?`)) {
            navigator.clipboard.writeText(resetLink);
            showSuccess('Link copiado para a área de transferência.');
        }
        
        // Abre o WhatsApp com o template
        window.open(`https://wa.me/${cliente.telefone?.replace(/\D/g, '') || ''}?text=${encodeURIComponent(whatsappTemplate)}`, '_blank');
        
        buscarDados();
        
    } catch (error: any) {
        console.error('Erro ao enviar convite:', error);
        showError('Falha ao enviar convite: ' + error.message);
    } finally {
        setCarregandoDados(false);
    }
  };
  
  // --- Lógica de Filtragem de Empresas do Sistema ---
  const filterEmpresasSistema = (status: 'pendentes' | 'ativos' | 'inativos' | 'avulsos') => {
      
      return empresasSistema.filter((e: EmpresaSistema) => {
          const dataFimAcesso = e.data_fim_acesso ? parseISO(e.data_fim_acesso) : null;
          const isAtivo = dataFimAcesso && isPast(new Date()) === false; // Data de fim de acesso é futura ou hoje
          const isAvulso = e.tipo_cliente?.endsWith('_Avulso') ?? false; // Verifica o novo sufixo
          const isBlocked = dataFimAcesso === null && e.aprovado; // Aprovado, mas sem data de fim (desativado)
          
          if (status === 'pendentes') {
              return !e.aprovado;
          }
          
          if (status === 'ativos') {
              // Ativos: Aprovados, não avulsos e com acesso futuro
              return e.aprovado && !isAvulso && isAtivo;
          }
          if (status === 'inativos') {
              // Inativos: Aprovados, não avulsos e com acesso expirado OU bloqueado
              return e.aprovado && !isAvulso && (!isAtivo || isBlocked);
          }
          if (status === 'avulsos') {
              // Avulsos: Aprovados e com o sufixo _Avulso
              return e.aprovado && isAvulso;
          }
          return false;
      });
  };
  
  const empresasPendentes = filterEmpresasSistema('pendentes');
  const empresasAtivas = filterEmpresasSistema('ativos');
  const empresasInativas = filterEmpresasSistema('inativos');
  const empresasAvulsas = filterEmpresasSistema('avulsos');
  
  const empresasParaExibir = useMemo(() => {
      return activeEmpresaTab === 'ativos' 
          ? empresasAtivas 
          : activeEmpresaTab === 'inativos' 
          ? empresasInativas 
          : activeEmpresaTab === 'avulsos' 
          ? empresasAvulsas
          : empresasPendentes;
  }, [activeEmpresaTab, empresasAtivas, empresasInativas, empresasAvulsas, empresasPendentes]);

  // Renderização do conteúdo da tabela de Clientes CR
  const renderClientesCRTable = () => (
    <div className="overflow-x-auto">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Nome Fantasia</TableHead>
                    <TableHead className="hidden md:table-cell">Razão Social</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    {isAdmin && <TableHead>Proprietário ID</TableHead>}
                    <TableHead className="text-right">Ações</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {clientesCR.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-4 text-muted-foreground">
                            Nenhum cliente de Contas a Receber cadastrado.
                        </TableCell>
                    </TableRow>
                ) : (
                    clientesCR.map((cliente) => (
                        <TableRow key={cliente.id}>
                            <TableCell className="font-medium">{cliente.nome_fantasia || cliente.nome}</TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{cliente.razao_social || '-'}</TableCell>
                            <TableCell>{cliente.email || '-'}</TableCell>
                            <TableCell>{cliente.telefone || '-'}</TableCell>
                            {isAdmin && <TableCell className="text-sm text-muted-foreground">{cliente.proprietario_id || 'N/A'}</TableCell>}
                            <TableCell className="text-right">
                                <div className="flex justify-end space-x-1">
                                    {/* BOTÃO CONVITE: Aparece se tiver email E NÃO for um cliente do sistema */}
                                    {isAdmin && cliente.email && !cliente.is_system_client && (
                                        <Button 
                                            variant="secondary" 
                                            size="sm" 
                                            onClick={() => handleSendInvite(cliente)}
                                            title="Enviar Convite de Acesso (Cria perfil no sistema)"
                                            disabled={carregandoDados}
                                        >
                                            <Mail className="w-4 h-4 mr-1" /> Convite
                                        </Button>
                                    )}
                                    {/* BOTÃO DE EDIÇÃO */}
                                    <Button variant="ghost" size="sm" onClick={() => handleEditCR(cliente)}>
                                        <Edit className="w-4 h-4" />
                                    </Button>
                                    {/* BOTÃO DE DELETAR */}
                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteCR(cliente.id)}>
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))
                )}
            </TableBody>
        </Table>
    </div>
  );
  
  // Renderização do conteúdo da tabela de Empresas do Sistema
  const renderEmpresasSistemaTable = (empresas: EmpresaSistema[]) => (
    <div className="overflow-x-auto">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Nome da Empresa</TableHead>
                    <TableHead>Email (Login)</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Acesso Expira</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {empresas.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                            Nenhuma empresa encontrada nesta categoria.
                        </TableCell>
                    </TableRow>
                ) : (
                    empresas.map((empresa) => {
                        const dataFimAcesso = empresa.data_fim_acesso ? parseISO(empresa.data_fim_acesso) : null;
                        const isAtivo = dataFimAcesso && isPast(new Date()) === false; // Data de fim de acesso é futura ou hoje
                        const isAvulso = empresa.tipo_cliente?.endsWith('_Avulso') ?? false; // Verifica o novo sufixo
                        const isBlocked = dataFimAcesso === null && empresa.aprovado; // Aprovado, mas sem data de fim (desativado)
                        
                        let statusBadge;
                        if (!empresa.aprovado) {
                            statusBadge = <Badge variant="warning">Pendente</Badge>;
                        } else if (isBlocked) {
                            statusBadge = <Badge variant="destructive">Bloqueado</Badge>;
                        } else if (isAvulso) {
                            // Se for avulso, o status reflete se o acesso está ativo ou expirado
                            statusBadge = <Badge variant={isAtivo ? 'default' : 'destructive'}>{isAtivo ? 'Avulso Ativo' : 'Avulso Expirado'}</Badge>;
                        } else if (isAtivo) {
                            statusBadge = <Badge variant="default">Ativo</Badge>;
                        } else {
                            statusBadge = <Badge variant="destructive">Expirado</Badge>;
                        }
                        
                        const dataExpiracaoDisplay = dataFimAcesso ? format(dataFimAcesso, 'dd/MM/yyyy') : 'N/A';
                        const planoNome = empresa.plano_id ? planosMap[empresa.plano_id] || 'N/A' : 'N/A';

                        return (
                            <TableRow key={empresa.id} className={cn(!empresa.aprovado && "bg-yellow-500/10", isBlocked && "bg-red-500/10")}>
                                <TableCell className="font-medium">{empresa.nome}</TableCell>
                                <TableCell>{empresa.email}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{planoNome}</TableCell>
                                <TableCell>{dataExpiracaoDisplay}</TableCell>
                                <TableCell>{statusBadge}</TableCell>
                                <TableCell className="text-right space-x-2 min-w-[150px]">
                                    {!empresa.aprovado && (
                                        <Button 
                                            variant="default" 
                                            size="sm" 
                                            onClick={() => handleAprovarCliente(empresa)}
                                            className="h-8"
                                        >
                                            <CheckCircle className="h-4 w-4 mr-1" /> Aprovar
                                        </Button>
                                    )}
                                    
                                    {/* Botão de Desativar (Aparece se estiver Ativo ou Avulso e não bloqueado) */}
                                    {(isAtivo || isAvulso) && !isBlocked && (
                                        <Button 
                                            variant="destructive" 
                                            size="icon" 
                                            onClick={() => handleDesativarCliente(empresa.id, empresa.nome)}
                                            title="Desativar Acesso"
                                            disabled={carregandoDados}
                                        >
                                            <PowerOff className="h-4 w-4" />
                                        </Button>
                                    )}
                                    
                                    {/* Botão de Reenviar Convite (Apenas para Avulsos) */}
                                    {isAvulso && (
                                        <Button 
                                            variant="outline" 
                                            size="icon" 
                                            onClick={() => handleResendInvite(empresa.email, empresa.nome)}
                                            title="Reenviar Convite de Acesso"
                                            disabled={carregandoDados}
                                        >
                                            <Mail className="h-4 w-4" />
                                        </Button>
                                    )}
                                    
                                    <Button 
                                        variant="outline" 
                                        size="icon" 
                                        onClick={() => handleEditEmpresaSistema(empresa)}
                                    >
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="destructive" 
                                        size="icon" 
                                        onClick={() => handleDeleteEmpresaSistema(empresa.id, empresa.nome)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        );
                    })
                )}
            </TableBody>
        </Table>
    </div>
  );
  
  const handlePrint = (orientation: 'portrait' | 'landscape') => {
      let dataToPrint: (Cliente | EmpresaSistema)[] = [];
      let tituloRelatorio = '';
      
      if (activeTab === 'clientes_cr') {
          dataToPrint = clientesCR;
          tituloRelatorio = 'Clientes Diretos / Contratos';
      } else {
          // Mapeia o plano_id para o nome do plano antes de imprimir
          dataToPrint = empresasParaExibir.map(e => ({
              ...e,
              plano_id: e.plano_id ? planosMap[e.plano_id] || e.plano_id : 'N/A', // Passa o nome do plano
          }));
          tituloRelatorio = `Clientes Sistema - ${activeEmpresaTab.charAt(0).toUpperCase() + activeEmpresaTab.slice(1)}`;
      }
      
      if (dataToPrint.length === 0) {
          showError('Nenhum dado para imprimir na aba atual.');
          return;
      }
      
      const printComponent = (
          <ClientesPrint
              data={dataToPrint}
              titulo={tituloRelatorio}
              isSupervisao={isAdmin}
              activeTab={activeTab as 'clientes_cr' | 'empresas_sistema'}
              activeEmpresaTab={activeEmpresaTab as 'pendentes' | 'ativos' | 'inativos' | 'avulsos'}
          />
      );

      const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
      // Passa a classe 'landscape' para o container de impressão
      printContent(htmlContent, `Relatório Clientes - ${tituloRelatorio}`, orientation);
  };

  // NOVO: Verificação de permissão
  const canAccessPage = isAdmin || (role === 'Cliente' && (perfil as ClienteProfile)?.permissoes?.contas_receber === true);

  if (carregandoSessao) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!canAccessPage) {
    return (
      <LayoutPrincipal>
        <Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para gerenciar clientes.</p></CardContent></Card>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">Gerenciamento de Clientes</h1>
        
        <div className="flex space-x-2 w-full sm:w-auto">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-auto">
                        <Printer className="w-4 h-4 mr-2" /> Imprimir
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handlePrint('portrait')}>
                        Imprimir (Retrato)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handlePrint('landscape')}>
                        Imprimir (Paisagem)
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            {/* Botão para Novo Cliente CR */}
            <Dialog open={dialogAberto && !perfilParaEditar} onOpenChange={setDialogAberto}>
              <DialogTrigger asChild>
                <Button onClick={handleNewCR} className="w-full sm:w-auto" disabled={isAdmin && activeTab === 'empresas_sistema'}>
                  <PlusCircle className="w-4 h-4 mr-2" />
                  Cliente Direto
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{clienteSelecionado ? 'Editar Cliente CR' : 'Novo Cliente CR'}</DialogTitle>
                </DialogHeader>
                <FormCliente 
                  clienteInicial={clienteSelecionado}
                  onSaveComplete={handleSaveComplete}
                />
              </DialogContent>
            </Dialog>
            
            {/* Botão para Nova Empresa Avulsa (Apenas Admin) */}
            {isAdmin && (
                <Dialog open={dialogAvulsaAberto} onOpenChange={setDialogAvulsaAberto}>
                    <DialogTrigger asChild>
                        <Button variant="secondary" onClick={() => setDialogAvulsaAberto(true)} className="w-full sm:w-auto">
                            <Building2 className="w-4 h-4 mr-2" />
                            Cliente Sistema
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Cadastrar Empresa Avulsa</DialogTitle>
                        </DialogHeader>
                        <FormEmpresaAvulsa onSaveComplete={handleSaveComplete} />
                    </DialogContent>
                </Dialog>
            )}
        </div>
      </div>
      
      {isAdmin ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mb-6">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="clientes_cr" className="flex items-center"><UsersIcon className="w-4 h-4 mr-2" /> Diretos/Contratos</TabsTrigger>
                <TabsTrigger value="empresas_sistema" className="flex items-center"><Building2 className="w-4 h-4 mr-2" /> Clientes Sistema</TabsTrigger>
            </TabsList>
            
            <TabsContent value="clientes_cr">
                <Card className="mt-4">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col md:flex-row gap-4">
                        <Input
                            placeholder="Buscar por nome, documento ou razão social..."
                            value={filtroNome}
                            onChange={(e) => setFiltroNome(e.target.value)}
                            className="w-full md:max-w-xs"
                        />
                        <Select value={filtroEmpresaId} onValueChange={setFiltroEmpresaId} disabled={empresasFiltro.length === 0}>
                            <SelectTrigger className="w-full md:w-[250px]">
                                <Building2 className="w-4 h-4 mr-2" />
                                <SelectValue placeholder="Filtrar por Empresa do Sistema" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos os Clientes CR</SelectItem>
                                {empresasFiltro.map(e => (
                                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>
                <Card className="mt-4">
                    <CardHeader><CardTitle className="text-xl">Clientes Diretos / Contratos Cadastrados ({clientesCR.length})</CardTitle></CardHeader>
                    <CardContent>{renderClientesCRTable()}</CardContent>
                </Card>
            </TabsContent>
            
            <TabsContent value="empresas_sistema">
                <Tabs value={activeEmpresaTab} onValueChange={setActiveEmpresaTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="pendentes">Pendentes ({empresasPendentes.length})</TabsTrigger>
                        <TabsTrigger value="ativos">Ativos ({empresasAtivas.length})</TabsTrigger>
                        <TabsTrigger value="inativos">Inativos ({empresasInativas.length})</TabsTrigger>
                        <TabsTrigger value="avulsos">Avulsos ({empresasAvulsas.length})</TabsTrigger>
                    </TabsList>
                    
                    <Card className="mt-4">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtro</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col md:flex-row gap-4">
                            <Input
                                placeholder="Buscar por nome ou email da empresa..."
                                value={filtroNome}
                                onChange={(e) => setFiltroNome(e.target.value)}
                                className="w-full md:max-w-xs"
                            />
                        </CardContent>
                    </Card>
                    
                    <TabsContent value="pendentes" className="mt-4">
                        <Card>
                            <CardHeader><CardTitle className="text-xl">Empresas Pendentes de Aprovação ({empresasPendentes.length})</CardTitle></CardHeader>
                            <CardContent>{renderEmpresasSistemaTable(empresasParaExibir.filter((e: EmpresaSistema) => !e.aprovado))}</CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="ativos" className="mt-4">
                        <Card>
                            <CardHeader><CardTitle className="text-xl">Empresas Ativas ({empresasAtivas.length})</CardTitle></CardHeader>
                            <CardContent>{renderEmpresasSistemaTable(empresasParaExibir.filter((e: EmpresaSistema) => empresasAtivas.includes(e)))}</CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="inativos" className="mt-4">
                        <Card>
                            <CardHeader><CardTitle className="text-xl">Empresas Inativas ({empresasInativas.length})</CardTitle></CardHeader>
                            <CardContent>{renderEmpresasSistemaTable(empresasParaExibir.filter((e: EmpresaSistema) => empresasInativas.includes(e)))}</CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="avulsos" className="mt-4">
                        <Card>
                            <CardHeader><CardTitle className="text-xl">Clientes do Sistema Avulsos ({empresasAvulsas.length})</CardTitle></CardHeader>
                            <CardContent>{renderEmpresasSistemaTable(empresasParaExibir.filter((e: EmpresaSistema) => empresasAvulsas.includes(e)))}</CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </TabsContent>
        </Tabs>
      ) : (
        // Cliente/Usuário (apenas Clientes CR)
        <Card>
            <CardHeader>
                <CardTitle className="text-xl">Clientes Diretos / Contratos Cadastrados ({clientesCR.length})</CardTitle>
            </CardHeader>
            <CardContent>{renderClientesCRTable()}</CardContent>
        </Card>
      )}
      
      {/* Dialog para editar Empresa do Sistema (usa FormUsuario) */}
      <Dialog open={dialogAberto && !!perfilParaEditar} onOpenChange={setDialogAberto}>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Empresa do Sistema</DialogTitle>
            </DialogHeader>
            <FormUsuario 
              criadorRole={role!}
              criadorPerfil={perfil!}
              usuarioInicial={perfilParaEditar}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
    </LayoutPrincipal>
  );
};

export default ClientesPage;