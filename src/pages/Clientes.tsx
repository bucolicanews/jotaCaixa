import { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, Filter, Building2, CheckCircle, Users as UsersIcon, Mail, PowerOff, Printer, LogIn, Undo2, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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
import { useOwnerBranding } from '@/hooks/use-owner-branding';
import { Plano } from '@/types/plano';
import ProtocolosClienteDialog from '@/components/protocolos/ProtocolosClienteDialog';
import { useDebounce } from '@/hooks/use-debounce';
import { useSessao } from '@/hooks/use-sessao'; // IMPORT ADICIONADO

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
    cnpj?: string | null;
    cpf?: string | null;
    documento?: string | null;
}

// NOVO TIPO: Cliente CR com status de sistema e contagens
interface ClienteCRComStatus extends Cliente {
    is_system_client: boolean;
    system_client_status?: 'Ativo' | 'Pendente' | 'Bloqueado' | 'Expirado' | 'CR' | 'Avulso';
    contratos_count: number;
    documentos_societarios_count: number;
    origem_cr: 'Promovido' | 'Contrato' | 'Doc Societário' | 'Novo/CR' | 'Bloqueado';
}

const ClientesPage = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const { printContent } = usePrint();
  const { logoUrl, ownerName } = useOwnerBranding();
  
  const [clientesCR, setClientesCR] = useState<ClienteCRComStatus[]>([]); 
  const [empresasSistema, setEmpresasSistema] = useState<EmpresaSistema[]>([]); 
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [perfilParaEditar, setPerfilParaEditar] = useState<AnyProfile | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [dialogAvulsaAberto, setDialogAvulsaAberto] = useState(false);
  const [dialogConviteAberto, setDialogConviteAberto] = useState(false);
  
  const [conviteNome, setConviteNome] = useState('');
  const [conviteEmail, setConviteEmail] = useState('');
  const [conviteTelefone, setConviteTelefone] = useState('');
  const [enviandoConvite, setEnviandoConvite] = useState(false);
  
  const [planosMap, setPlanosMap] = useState<Record<string, string>>({});
  const [planosDisponiveis, setPlanosDisponiveis] = useState<Plano[]>([]);
  
  const [empresasFiltro, setEmpresasFiltro] = useState<EmpresaFiltro[]>([]);
  const [filtroEmpresaId, setFiltroEmpresaId] = useState('todos');
    const [filtroNomeCR, setFiltroNomeCR] = useState('');
  const [filtroNomeSistema, setFiltroNomeSistema] = useState('');
  
  const [activeTab, setActiveTab] = useState('clientes_cr');

  const isUsuario = role === 'Usuario';
  const isAdminUsuario = isUsuario && !!(perfil as any)?.admin_id;
  const isAdmin = role === 'Admin' || isAdminUsuario;

  const getOwnerId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario' && perfil) {
      if ('cliente_id' in perfil && (perfil as any).cliente_id) {
        return (perfil as any).cliente_id;
      }
      if ('admin_id' in perfil && (perfil as any).admin_id) {
        return (perfil as any).admin_id;
      }
    }
    return null;
  };
  
  const ownerId = getOwnerId();

  const fetchPlanos = useCallback(async () => {
    const { data, error } = await supabase
        .from('planos')
        .select('*')
        .order('preco_mensal', { ascending: true });
        
    if (error) {
        console.error('Erro ao carregar planos:', error);
        setPlanosDisponiveis([]);
        setPlanosMap({});
        return;
    }
    
    const planosList = data as Plano[];
    setPlanosDisponiveis(planosList);
    const map = planosList.reduce((acc, p) => {
        acc[p.id] = p.nome;
        return acc;
    }, {} as Record<string, string>);
    setPlanosMap(map);
  }, []);

  const fetchEmpresasFiltro = useCallback(async () => {
    if (!isAdmin || !usuario?.id) return;
    
    const { data, error } = await supabase
        .from('tbl_clientes')
        .select('id, nome');

    if (error) {
        showError('Erro ao carregar lista de empresas: ' + error.message);
        setEmpresasFiltro([]);
    } else {
        const clientData = data as EmpresaFiltro[];
        const adminOption: EmpresaFiltro = { id: usuario.id, nome: 'Meus Clientes (CR)' };
        const allClients = [adminOption, ...clientData];
        setEmpresasFiltro(allClients);
    }
  }, [isAdmin, usuario?.id]);

  const buscarDados = useCallback(async () => {
    setCarregandoDados(true);
    
    let systemClientsMap: Record<string, EmpresaSistema> = {};
    let systemClientsList: EmpresaSistema[] = [];
    
    let queryEmpresas = supabase
        .from('tbl_clientes')
        .select('*, cliente_id_promovido, cnpj, cpf, documento')
        .order('nome', { ascending: true });
        
    if (isAdmin && usuario?.id) {
        queryEmpresas = queryEmpresas.neq('id', usuario.id);
    }
        
    const { data: dataEmpresas, error: errorEmpresas } = await queryEmpresas;
        
    if (errorEmpresas) {
        throw errorEmpresas;
    } else {
        systemClientsList = dataEmpresas as EmpresaSistema[];
        systemClientsMap = systemClientsList.reduce((acc, e) => {
            acc[e.id] = e;
            return acc;
        }, {} as Record<string, EmpresaSistema>);
        
        if (isAdmin) {
            const filteredEmpresas = systemClientsList.filter(e => 
                e.nome.toLowerCase().includes(filtroNomeSistema.toLowerCase()) ||
                e.email.toLowerCase().includes(filtroNomeSistema.toLowerCase())
            );
            setEmpresasSistema(filteredEmpresas);
        }
    }
    
    let queryCR = supabase
      .from('clientes')
      .select('id, proprietario_id, nome, razao_social, nome_fantasia, documento, email, telefone, telefone_fixo, cep, endereco, numero, complemento, bairro, cidade, estado, created_at, updated_at, is_system_client')
      .order('nome', { ascending: true });

    if (isAdmin) {
        if (filtroEmpresaId !== 'todos') {
            queryCR = queryCR.eq('proprietario_id', filtroEmpresaId);
        } else if (ownerId) {
            queryCR = queryCR.eq('proprietario_id', ownerId);
        }
    } else if (ownerId) {
        queryCR = queryCR.eq('proprietario_id', ownerId);
    } else {
        setClientesCR([]);
    }

    const { data: dataCR, error: errorCR } = await queryCR;

    if (errorCR) {
      showError('Erro ao carregar clientes CR: ' + errorCR.message);
      setClientesCR([]);
    } else {
      let fetchedData = (dataCR as Cliente[]).filter(c => 
        c.nome.toLowerCase().includes(filtroNomeCR.toLowerCase()) ||
        (c.razao_social?.toLowerCase() || '').includes(filtroNomeCR.toLowerCase()) ||
        (c.documento?.toLowerCase() || '').includes(filtroNomeCR.toLowerCase())
      );
      
      const clienteCRIds = fetchedData.map(c => c.id);
      
      const [contratosCountRes, documentosCountRes] = await Promise.all([
          supabase
              .from('contratos_gerados')
              .select('cliente_id', { count: 'exact', head: false })
              .in('cliente_id', clienteCRIds),
          supabase
              .from('documentos_societarios_gerados')
              .select('cliente_id', { count: 'exact', head: false })
              .in('cliente_id', clienteCRIds),
      ]);
      
      const contratosMap = (contratosCountRes.data || []).reduce((acc, c) => {
          acc[c.cliente_id] = (acc[c.cliente_id] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);
      
      const documentosMap = (documentosCountRes.data || []).reduce((acc, d) => {
          acc[d.cliente_id] = (acc[d.cliente_id] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);
      
      const emailMap: Record<string, ClienteCRComStatus> = {};
      
      const clientesComStatus: ClienteCRComStatus[] = [];

      for (const cliente of fetchedData) {
          if (!isAdmin && cliente.id === ownerId) {
              continue;
          }
          
          const systemClient = systemClientsMap[cliente.id];
          const isSystemClient = cliente.is_system_client || !!systemClient; 
          
          let systemStatus: ClienteCRComStatus['system_client_status'] = 'CR';
          let origemCR: ClienteCRComStatus['origem_cr'] = 'Novo/CR';
          
          if (isSystemClient && systemClient) {
              const dataFimAcesso = systemClient.data_fim_acesso ? parseISO(systemClient.data_fim_acesso) : null;
              
              let isBlockedOrExpired = false;
              if (dataFimAcesso === null) {
                  isBlockedOrExpired = false;
              } else if (isPast(dataFimAcesso)) {
                  isBlockedOrExpired = true;
              }
              
              const isAvulso = systemClient.tipo_cliente?.endsWith('_Avulso') ?? false;
              
              if (!systemClient.aprovado) {
                  systemStatus = 'Pendente';
              } else if (isBlockedOrExpired) {
                  systemStatus = 'Expirado';
                  origemCR = 'Promovido';
              } else if (isAvulso) {
                  systemStatus = 'Avulso';
                  origemCR = 'Promovido';
              } else {
                  systemStatus = 'Ativo';
                  origemCR = 'Promovido';
              }
              
          } else {
              if (contratosMap[cliente.id] > 0) {
                  origemCR = 'Contrato';
              } else if (documentosMap[cliente.id] > 0) {
                  origemCR = 'Doc Societário';
              } else {
                  origemCR = 'Novo/CR';
              }
          }
          
          const clienteComStatus: ClienteCRComStatus = {
              ...cliente,
              is_system_client: isSystemClient,
              system_client_status: systemStatus,
              contratos_count: contratosMap[cliente.id] || 0,
              documentos_societarios_count: documentosMap[cliente.id] || 0,
              origem_cr: origemCR,
          };
          
          if (clienteComStatus.email) {
              const emailKey = clienteComStatus.email.toLowerCase();
              const existing = emailMap[emailKey];
              
              if (!existing || (clienteComStatus.is_system_client && existing.system_client_status !== 'Ativo')) {
                  emailMap[emailKey] = clienteComStatus;
              } else if (!existing.is_system_client && !clienteComStatus.is_system_client) {
                  const existingScore = existing.contratos_count + existing.documentos_societarios_count;
                  const newScore = clienteComStatus.contratos_count + clienteComStatus.documentos_societarios_count;
                  
                  if (newScore > existingScore) {
                      emailMap[emailKey] = clienteComStatus;
                  }
              }
          } else {
              clientesComStatus.push(clienteComStatus);
          }
      }
      
      const finalClientesCR = Object.values(emailMap).concat(clientesComStatus.filter(c => !c.email));
      setClientesCR(finalClientesCR);
    }

    setCarregandoDados(false);
  }, [isAdmin, ownerId, filtroEmpresaId, filtroNomeCR, filtroNomeSistema, usuario?.id]);

  useEffect(() => {
    if (!carregandoSessao && usuario) {
      if (isAdmin) {
        fetchEmpresasFiltro();
        fetchPlanos();
      }
      try {
          buscarDados();
      } catch (e) {
          console.error("Erro ao buscar dados iniciais:", e);
          setCarregandoDados(false);
          showError("Erro ao carregar dados: Verifique a estrutura do banco de dados.");
      }
    }
  }, [carregandoSessao, usuario, isAdmin, buscarDados, fetchEmpresasFiltro, fetchPlanos]);
  
  useEffect(() => {
      if (!carregandoSessao && usuario) {
          try {
              buscarDados();
          } catch (e) {
          }
      }
  }, [filtroEmpresaId, filtroNomeCR, filtroNomeSistema, buscarDados, carregandoSessao, usuario]);


  const handleSaveComplete = () => {
    setDialogAberto(false);
    setDialogAvulsaAberto(false);
    setDialogConviteAberto(false);
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
    setDialogAberto(true);
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
      const { data, error: rpcError } = await supabase.rpc('demote_system_client', { p_client_id: id });
      if (rpcError) throw rpcError;
      const result = data?.[0];
      if (result && !result.success) {
          showError(`Exclusão Não Permitida: ${result.message}`);
      } else if (result && result.success) {
          showSuccess(`Operação Concluída: ${result.message}`);
          buscarDados();
      } else {
          showError('Erro na Operação: Resposta inesperada do servidor ao tentar despromover o cliente.');
      }
    } catch (error: any) {
      showError('Falha ao deletar empresa: ' + error.message);
    }
  };
  
  const handleDesativarCliente = async (id: string, nome: string) => {
    if (!window.confirm(`Tem certeza que deseja DESATIVAR o acesso da empresa ${nome}? O acesso será bloqueado imediatamente.`)) return;
    setCarregandoDados(true);
    try {
        const { error } = await supabase.from('tbl_clientes').update({ data_fim_acesso: null }).eq('id', id);
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
    const { data: planos, error: planosError } = await supabase.from('planos').select('id, permissoes, tipo_cliente').order('preco_mensal', { ascending: true }).limit(1);
    if (planosError || planos.length === 0) {
        showError('Nenhum plano de trial encontrado. Não é possível aprovar.');
        setCarregandoDados(false);
        return;
    }
    const planoTrial = planos[0];
    const dataAtual = new Date();
    const dataFimAcesso = addDays(dataAtual, 7);
    const dataFimISO = format(dataFimAcesso, 'yyyy-MM-dd') + 'T12:00:00Z';
    const { error } = await supabase.from('tbl_clientes').update({ 
            aprovado: true,
            plano_id: planoTrial.id,
            data_fim_acesso: dataFimISO,
            permissoes: planoTrial.permissoes,
            tipo_cliente: planoTrial.tipo_cliente,
        }).eq('id', cliente.id);
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
          const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${BASE_URL}/atualizar-senha` });
          if (error) throw error;
          const resetLink = (data as { action_link: string | null }).action_link || `${BASE_URL}/atualizar-senha`;
          const whatsappTemplate = `Olá ${nome}! Seu convite de acesso ao sistema está pronto. Clique no link abaixo para definir sua senha e acessar:\n\n${resetLink}`;
          if (window.confirm(`Link de Acesso Gerado para ${nome}. Deseja copiar leink para enviar manualmente?`)) {
              navigator.clipboard.writeText(resetLink);
              showSuccess('Link copiado para a área de transferência.');
          }
          window.open(`https://wa.me/${(empresasSistema.find(e => e.email === email)?.telefone || '').replace(/\D/g, '') || ''}?text=${encodeURIComponent(whatsappTemplate)}`, '_blank');
      } catch (error: any) {
          showError('Falha ao reenviar convite: ' + error.message);
      } finally {
          setCarregandoDados(false);
      }
  };
  
  const handleNewCR = () => {
      setDialogAvulsaAberto(true);
      setClienteSelecionado(null);
      setPerfilParaEditar(null);
      setDialogAberto(false);
  };
  
  const handleSendInvite = async (cliente: Cliente) => {
    if (!cliente.email) {
        showError('O cliente deve ter um email cadastrado para enviar o convite.');
        return;
    }
    const existingSystemClient = empresasSistema.find(e => e.email === cliente.email);
    if (existingSystemClient) {
        showError(`O email ${cliente.email} já está em uso pela empresa ${existingSystemClient.nome}. Por favor, corrija o email do cliente CR antes de enviar o convite.`);
        return;
    }
    if (!window.confirm(`Tem certeza que deseja enviar o convite de acesso para ${cliente.nome} (${cliente.email})?`)) return;
    setCarregandoDados(true);
    try {
        const { error: signUpError } = await supabase.auth.signUp({
            email: cliente.email,
            password: Math.random().toString(36).substring(2, 15),
            options: { emailRedirectTo: `${BASE_URL}/atualizar-senha`, data: { role: 'Cliente', nome: cliente.nome, aprovado: false } }
        });
        if (signUpError && !signUpError.message.includes('already registered')) throw signUpError;
        const { data, error: resetError } = await supabase.auth.resetPasswordForEmail(cliente.email, { redirectTo: `${BASE_URL}/atualizar-senha` });
        if (resetError) throw resetError;
        const resetLink = (data as { action_link: string | null }).action_link || `${BASE_URL}/atualizar-senha`;
        showSuccess('Convite de acesso enviado! Use o botão de Ações para enviar o link.');
        const whatsappTemplate = `Olá ${cliente.nome}! Seu convite de acesso ao sistema está pronto. Clique no link abaixo para definir sua senha e acessar:\n\n${resetLink}`;
        if (window.confirm(`Link de Acesso Gerado para ${cliente.nome}. Deseja copiar o link para enviar manualmente?`)) {
            navigator.clipboard.writeText(resetLink);
            showSuccess('Link copiado para a área de transferência.');
        }
        window.open(`https://wa.me/${cliente.telefone?.replace(/\D/g, '') || ''}?text=${encodeURIComponent(whatsappTemplate)}`, '_blank');
        buscarDados();
    } catch (error: any) {
        console.error('Erro ao enviar convite:', error);
        showError('Falha ao enviar convite: ' + error.message);
    } finally {
        setCarregandoDados(false);
    }
  };
  
  const handleEnviarConviteSimples = async () => {
    if (!conviteEmail || !conviteNome) {
      showError('Nome e Email são obrigatórios.');
      return;
    }
    setEnviandoConvite(true);
    try {
      const { data: emailDisponivel, error: emailError } = await supabase.rpc('email_disponivel', { p_email: conviteEmail });
      if (emailError) {
        showError('Erro ao verificar email: ' + emailError.message);
        setEnviandoConvite(false);
        return;
      }
      if (!emailDisponivel) {
        showError('Este email já está cadastrado no sistema.');
        setEnviandoConvite(false);
        return;
      }
      const { error: signUpError } = await supabase.auth.signUp({
        email: conviteEmail,
        password: Math.random().toString(36).substring(2, 15),
        options: { emailRedirectTo: `${BASE_URL}/atualizar-senha`, data: { role: 'Cliente', nome: conviteNome, aprovado: false } }
      });
      if (signUpError && !signUpError.message.includes('already registered')) throw signUpError;
      const { data, error: resetError } = await supabase.auth.resetPasswordForEmail(conviteEmail, { redirectTo: `${BASE_URL}/atualizar-senha` });
      if (resetError) throw resetError;
      const resetLink = (data as { action_link: string | null }).action_link || `${BASE_URL}/atualizar-senha`;
      showSuccess('Convite enviado com sucesso!');
      const whatsappTemplate = `Olá ${conviteNome}! Seu convite de acesso ao sistema está pronto. Clique no link abaixo para definir sua senha e acessar:\n\n${resetLink}`;
      if (window.confirm(`Link gerado! Deseja copiar para enviar manualmente?`)) {
        navigator.clipboard.writeText(resetLink);
        showSuccess('Link copiado!');
      }
      if (conviteTelefone) window.open(`https://wa.me/${conviteTelefone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappTemplate)}`, '_blank');
      setConviteNome(''); setConviteEmail(''); setConviteTelefone(''); setDialogConviteAberto(false); buscarDados();
    } catch (error: any) {
      showError('Falha ao enviar convite: ' + error.message);
    } finally {
      setEnviandoConvite(false);
    }
  };
  
  const handleDemoteClient = async (cliente: EmpresaSistema) => {
    if (!window.confirm(`Tem certeza que deseja DESPROMOVER a empresa ${cliente.nome}? Isso removerá o perfil de Cliente do Sistema e o usuário do Auth, se não houver vínculos.`)) return;
    setCarregandoDados(true);
    try {
        const { data, error: rpcError } = await supabase.rpc('demote_system_client', { p_client_id: cliente.id });
        if (rpcError) throw rpcError;
        const result = data?.[0];
        if (result && !result.success) {
            showError(result.message);
        } else if (result && result.success) {
            showSuccess(result.message);
            const { error: updateCRError } = await supabase.from('clientes').update({ is_system_client: false }).eq('id', cliente.id);
            if (updateCRError) console.error('Aviso: Falha ao atualizar is_system_client na tabela clientes:', updateCRError);
            buscarDados();
        } else {
            showError('Resposta inesperada do servidor.');
        }
    } catch (error: any) {
        console.error('Erro ao despromover cliente:', error);
        showError('Falha ao despromover cliente: ' + error.message);
    } finally {
        setCarregandoDados(false);
    }
  };
  
  const handlePromoteCRDirect = async (cliente: ClienteCRComStatus) => {
    if (!cliente.email) {
        showError('O cliente deve ter um email cadastrado para ser promovido.');
        return;
    }
    if (!window.confirm(`Tem certeza que deseja PROMOVER o cliente ${cliente.nome} para Cliente do Sistema? Isso criará um usuário no Auth e o marcará como pendente de aprovação.`)) return;
    setCarregandoDados(true);
    try {
        const { data, error: invokeError } = await supabase.functions.invoke('promote-client-direct', { body: { clienteCrId: cliente.id, adminId: ownerId } });
        if (invokeError) throw invokeError;
        if (data?.error) throw new Error(data.error);
        showSuccess(`Cliente ${cliente.nome} promovido para Cliente do Sistema com sucesso!`);
        const { data: resetData, error: resetError } = await supabase.auth.resetPasswordForEmail(cliente.email, { redirectTo: `${BASE_URL}/atualizar-senha` });
        if (resetError) console.error('Aviso: Falha ao enviar email de redefinição de senha:', resetError);
        const resetLink = (resetData as { action_link: string | null }).action_link || `${BASE_URL}/atualizar-senha`;
        if (window.confirm(`Link de Acesso Gerado para ${cliente.nome}. Deseja copiar o link para enviar manualmente?`)) {
            navigator.clipboard.writeText(resetLink);
            showSuccess('Link copiado para a área de transferência.');
        }
        buscarDados();
    } catch (error: any) {
        console.error('Erro ao promover cliente diretamente:', error);
        showError('Falha ao promover cliente: ' + error.message);
    } finally {
        setCarregandoDados(false);
    }
  };
  
  const filterEmpresasSistema = (status: 'pendentes' | 'ativos' | 'inativos' | 'avulsos') => {
      return empresasSistema.filter((e: EmpresaSistema) => {
          const dataFimAcesso = e.data_fim_acesso ? parseISO(e.data_fim_acesso) : null;
          let isBlockedOrExpired = false;
          if (dataFimAcesso === null) {
              isBlockedOrExpired = false;
          } else if (isPast(dataFimAcesso)) {
              isBlockedOrExpired = true;
          }
          const isAvulso = e.tipo_cliente?.endsWith('_Avulso') ?? false;
          if (status === 'pendentes') return !e.aprovado;
          if (status === 'ativos') return e.aprovado && !isAvulso && !isBlockedOrExpired;
          if (status === 'inativos') return e.aprovado && !isAvulso && isBlockedOrExpired;
          if (status === 'avulsos') return e.aprovado && isAvulso;
          return false;
      });
  };
  
  const empresasPendentes = filterEmpresasSistema('pendentes');
  const empresasAtivas = filterEmpresasSistema('ativos');
  const empresasInativas = filterEmpresasSistema('inativos');
  const empresasAvulsas = filterEmpresasSistema('avulsos');
  
  const todasEmpresasSistema = useMemo(() => {
      return [...empresasPendentes, ...empresasAtivas, ...empresasInativas, ...empresasAvulsas];
  }, [empresasPendentes, empresasAtivas, empresasInativas, empresasAvulsas]);
  
  const todosClientesCR = useMemo(() => {
      if (role === 'Cliente' && ownerId) {
          return clientesCR.filter(c => c.id !== ownerId);
      }
      return clientesCR;
  }, [clientesCR, role, ownerId]);


  const renderClientesCRTable = () => (
    <div className="overflow-x-auto">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Nome Fantasia</TableHead>
                    <TableHead className="hidden md:table-cell">Razão Social</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead className="w-[120px]">Status Sistema</TableHead>
                    <TableHead className="w-[100px] text-center">Contratos</TableHead>
                    <TableHead className="w-[100px] text-center">Doc. Societário</TableHead>
                    {isAdmin && <TableHead>Proprietário ID</TableHead>}
                    <TableHead className="text-right">Ações</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {todosClientesCR.length === 0 ? (
                    <TableRow><TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-4 text-muted-foreground">Nenhum cliente encontrado.</TableCell></TableRow>
                ) : (
                    todosClientesCR.map((cliente) => {
                        const isSystemClient = cliente.is_system_client;
                        const systemStatus = cliente.system_client_status;
                        let statusBadge;
                        if (isSystemClient) {
                            let variant: 'default' | 'warning' | 'destructive' = 'default';
                            if (systemStatus === 'Pendente') variant = 'warning';
                            if (systemStatus === 'Expirado') variant = 'destructive';
                            statusBadge = <Badge variant={variant}>{systemStatus}</Badge>;
                        } else {
                            switch (cliente.origem_cr) {
                                case 'Contrato': statusBadge = <Badge variant="secondary">Contrato</Badge>; break;
                                case 'Doc Societário': statusBadge = <Badge variant="secondary">Doc Societário</Badge>; break;
                                case 'Novo/CR': default: statusBadge = <Badge variant="outline">CR</Badge>; break;
                            }
                        }
                        const isActionDisabled = carregandoDados;
                        const rowClassName = isSystemClient ? 'bg-green-500/10' : '';
                        const hasActiveLinks = cliente.contratos_count > 0 || cliente.documentos_societarios_count > 0;
                        const shouldHideDemoteOrAccess = isSystemClient && hasActiveLinks;
                        return (
                            <TableRow key={cliente.id} className={rowClassName}>
                                <TableCell className="font-medium">{cliente.nome_fantasia || cliente.nome}</TableCell>
                                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{cliente.razao_social || '-'}</TableCell>
                                <TableCell>{cliente.email || '-'}</TableCell>
                                <TableCell>{cliente.telefone || '-'}</TableCell>
                                <TableCell>{statusBadge}</TableCell>
                                <TableCell className="text-center">{cliente.contratos_count > 0 ? (<Badge variant="default">{cliente.contratos_count}</Badge>) : '-'}</TableCell>
                                <TableCell className="text-center">{cliente.documentos_societarios_count > 0 ? (<Badge variant="secondary">{cliente.documentos_societarios_count}</Badge>) : '-'}</TableCell>
                                {isAdmin && <TableCell className="text-sm text-muted-foreground">{cliente.proprietario_id || 'N/A'}</TableCell>}
                                <TableCell className="text-right">
                                    <div className="flex justify-end space-x-1">
                                        {isAdmin && cliente.email && (isSystemClient ? (!shouldHideDemoteOrAccess && (<Button variant="destructive" size="sm" onClick={() => handleDemoteClient(cliente as unknown as EmpresaSistema)} title="Despromover Cliente (Reverte para CR)" disabled={isActionDisabled} className="h-8"><Undo2 className="w-4 h-4 mr-1" /> Despromover</Button>)) : (<><Button variant="default" size="sm" onClick={() => handlePromoteCRDirect(cliente)} title="Promover Cliente para Cliente do Sistema (Cria Auth)" disabled={isActionDisabled} className="h-8 bg-blue-500 hover:bg-blue-600"><UsersIcon className="w-4 h-4 mr-1" /> Promover</Button><Button variant="default" size="sm" onClick={() => handleSendInvite(cliente)} title="Enviar Convite de Acesso (Cria Auth e envia link)" disabled={isActionDisabled} className="h-8 bg-orange-500 hover:bg-orange-600"><Mail className="w-4 h-4 mr-1" /> Convite</Button></>))}
                                        {isAdmin && cliente.email && isSystemClient && !shouldHideDemoteOrAccess && (<Button variant="secondary" size="sm" onClick={() => handleResendInvite(cliente.email!, cliente.nome)} title="Reenviar Link de Acesso" disabled={carregandoDados} className="h-8"><LogIn className="w-4 h-4 mr-1" /> Acesso</Button>)}
                                        <ProtocolosClienteDialog clienteId={cliente.id} clienteNome={cliente.nome}><Button variant="ghost" size="icon"><FileText className="w-4 h-4" /></Button></ProtocolosClienteDialog>
                                        <Button variant="ghost" size="icon" onClick={() => handleEditCR(cliente)}><Edit className="w-4 h-4" /></Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteCR(cliente.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })
                )}
            </TableBody>
        </Table>
    </div>
  );
  
  const renderEmpresasSistemaTable = (empresas: EmpresaSistema[]) => (
    <div className="overflow-x-auto">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Nome da Empresa</TableHead>
                    <TableHead>Razão Social</TableHead> {/* COLUNA RESTAURADA */}
                    <TableHead>Email (Login)</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Acesso Expira</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {empresas.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-4 text-muted-foreground">Nenhuma empresa encontrada nesta categoria.</TableCell></TableRow>
                ) : (
                    empresas.map((empresa) => {
                        const dataFimAcesso = empresa.data_fim_acesso ? parseISO(empresa.data_fim_acesso) : null;
                        let isBlockedOrExpired = false;
                        if (dataFimAcesso === null) isBlockedOrExpired = false;
                        else if (isPast(dataFimAcesso)) isBlockedOrExpired = true;
                        const isAvulso = empresa.tipo_cliente?.endsWith('_Avulso') ?? false;
                        let statusBadge;
                        if (!empresa.aprovado) statusBadge = <Badge variant="warning">Pendente</Badge>;
                        else if (isBlockedOrExpired) statusBadge = <Badge variant="destructive">Expirado</Badge>;
                        else if (isAvulso) statusBadge = <Badge variant={!isBlockedOrExpired ? 'default' : 'destructive'}>{!isBlockedOrExpired ? 'Avulso Ativo' : 'Avulso Expirado'}</Badge>;
                        else statusBadge = <Badge variant="default">Ativo</Badge>;
                        const dataExpiracaoDisplay = dataFimAcesso ? format(dataFimAcesso, 'dd/MM/yyyy') : 'Vitalício'; 
                        const planoNome = empresa.plano_id ? planosMap[empresa.plano_id] || 'N/A' : 'N/A';
                        const isPromoted = !!(empresa as any).cliente_id_promovido;
                        return (
                            <TableRow key={empresa.id} className={cn(!empresa.aprovado && "bg-yellow-500/10", isBlockedOrExpired && "bg-red-500/10")}>
                                <TableCell className="font-medium">{empresa.nome}</TableCell>
                                <TableCell>{empresa.razao_social || '-'}</TableCell> {/* EXIBINDO RAZÃO SOCIAL */}
                                <TableCell>{empresa.email}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{planoNome}</TableCell>
                                <TableCell>{dataExpiracaoDisplay}</TableCell>
                                <TableCell>{statusBadge}</TableCell>
                                <TableCell className="text-right space-x-2 min-w-[150px]">
                                    {!empresa.aprovado && (<Button variant="default" size="sm" onClick={() => handleAprovarCliente(empresa)} className="h-8"><CheckCircle className="h-4 w-4 mr-1" /> Aprovar</Button>)}
                                    {isAdmin && empresa.id !== usuario?.id && isPromoted && (<Button variant="outline" size="icon" onClick={() => handleDemoteClient(empresa)} title="Despromover Cliente (Reverte para CR)" disabled={carregandoDados}><Undo2 className="h-4 w-4" /></Button>)}
                                    {!isBlockedOrExpired && (<Button variant="destructive" size="icon" onClick={() => handleDesativarCliente(empresa.id, empresa.nome)} title="Desativar Acesso" disabled={carregandoDados}><PowerOff className="h-4 w-4" /></Button>)}
                                    {isAvulso && (<Button variant="outline" size="icon" onClick={() => handleResendInvite(empresa.email, empresa.nome)} title="Reenviar Convite de Acesso" disabled={carregandoDados}><Mail className="h-4 w-4" /></Button>)}
                                    <Button variant="outline" size="icon" onClick={() => handleEditEmpresaSistema(empresa)}><Edit className="w-4 h-4" /></Button>
                                    <Button variant="destructive" size="icon" onClick={() => handleDeleteEmpresaSistema(empresa.id, empresa.nome)}><Trash2 className="w-4 h-4" /></Button>
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
      if (activeTab === 'clientes_cr') { dataToPrint = todosClientesCR; tituloRelatorio = `Clientes Diretos / Contratos`; }
      else { dataToPrint = todasEmpresasSistema.map(e => ({ ...e, plano_id: e.plano_id ? planosMap[e.plano_id] || e.plano_id : 'N/A' })); tituloRelatorio = `Clientes Sistema`; }
      if (dataToPrint.length === 0) { showError('Nenhum dado para imprimir na aba atual.'); return; }
      const printComponent = (<ClientesPrint data={dataToPrint} titulo={tituloRelatorio} isSupervisao={isAdmin} activeTab={activeTab as 'clientes_cr' | 'empresas_sistema'} activeEmpresaTab={'ativos'} logoUrl={logoUrl} ownerName={ownerName} />);
      const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
      printContent(htmlContent, `Relatório Clientes - ${tituloRelatorio}`, orientation);
  };

  const canAccessPage = isAdmin || (perfil as any)?.permissoes?.gerenciar_clientes === true;

  if (carregandoSessao) {
    return (
      <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>
    );
  }
  
  if (!canAccessPage) {
    return (
      <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para gerenciar clientes.</p></CardContent></Card></LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">Gerenciamento de Clientes</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="w-full sm:w-auto"><Printer className="w-4 h-4 mr-2" /> Imprimir</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => handlePrint('portrait')}>Imprimir (Retrato)</DropdownMenuItem><DropdownMenuItem onClick={() => handlePrint('landscape')}>Imprimir (Paisagem)</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            {isAdmin ? (
              <Dialog open={dialogAvulsaAberto} onOpenChange={setDialogAvulsaAberto}>
                <DialogTrigger asChild><Button onClick={handleNewCR} className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600"><PlusCircle className="w-4 h-4 mr-2" />Cliente Direto</Button></DialogTrigger>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Cadastrar Cliente Direto (Avulso)</DialogTitle><p className="text-sm text-muted-foreground">Cria um perfil de cliente na base de usuários para ser usado em Contas a Receber e Contratos.</p></DialogHeader><FormEmpresaAvulsa onSaveComplete={handleSaveComplete} /></DialogContent>
              </Dialog>
            ) : (
              <Dialog open={dialogAvulsaAberto} onOpenChange={setDialogAvulsaAberto}>
                <DialogTrigger asChild><Button onClick={handleNewCR} className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600"><PlusCircle className="w-4 h-4 mr-2" />Cliente Direto</Button></DialogTrigger>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Cadastrar Novo Cliente</DialogTitle><p className="text-sm text-muted-foreground">Cria um cliente para uso em Contas a Receber e Contratos.</p></DialogHeader><FormCliente onSaveComplete={handleSaveComplete} /></DialogContent>
              </Dialog>
            )}
            {isAdmin && (
                <Dialog open={dialogConviteAberto} onOpenChange={(open) => { setDialogConviteAberto(open); if (!open) { setConviteNome(''); setConviteEmail(''); setConviteTelefone(''); } }}>
                    <DialogTrigger asChild><Button variant="secondary" onClick={() => setDialogConviteAberto(true)} className="w-full sm:w-auto"><Mail className="w-4 h-4 mr-2" />Convidar Cliente</Button></DialogTrigger>
                    <DialogContent className="sm:max-w-[400px]"><DialogHeader><DialogTitle>Convidar Novo Cliente</DialogTitle><p className="text-sm text-muted-foreground">Envia um link para o cliente definir sua senha e acessar o sistema.</p></DialogHeader><div className="space-y-4 pt-4"><div className="space-y-2"><label className="text-sm font-medium">Nome da Empresa / Pessoa *</label><Input placeholder="Nome completo ou razão social" value={conviteNome} onChange={(e) => setConviteNome(e.target.value)} disabled={enviandoConvite} /></div><div className="space-y-2"><label className="text-sm font-medium">Email *</label><Input type="email" placeholder="email@empresa.com" value={conviteEmail} onChange={(e) => setConviteEmail(e.target.value)} disabled={enviandoConvite} /></div><div className="space-y-2"><label className="text-sm font-medium">Telefone / WhatsApp (opcional)</label><Input placeholder="(11) 99999-9999" value={conviteTelefone} onChange={(e) => setConviteTelefone(e.target.value)} disabled={enviandoConvite} /></div><Button onClick={handleEnviarConviteSimples} className="w-full" disabled={enviandoConvite || !conviteNome || !conviteEmail}>{enviandoConvite && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Mail className="w-4 h-4 mr-2" />Enviar Convite</Button></div></DialogContent>
                </Dialog>
            )}
        </div>
      </div>
      {isAdmin ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mb-6"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="clientes_cr" className="flex items-center"><UsersIcon className="w-4 h-4 mr-2" /> Diretos/Contratos</TabsTrigger><TabsTrigger value="empresas_sistema" className="flex items-center"><Building2 className="w-4 h-4 mr-2" /> Clientes Sistema</TabsTrigger></TabsList><TabsContent value="clientes_cr"><Card className="mt-4"><CardHeader className="pb-2"><CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros</CardTitle></CardHeader><CardContent className="flex flex-col md:flex-row gap-4"><Input placeholder="Buscar por nome, documento ou razão social..." value={filtroNomeCR} onChange={(e) => setFiltroNomeCR(e.target.value)} className="w-full md:max-w-xs" /><Select value={filtroEmpresaId} onValueChange={setFiltroEmpresaId} disabled={empresasFiltro.length === 0}><SelectTrigger className="w-full md:w-[250px]"><Building2 className="w-4 h-4 mr-2 text-muted-foreground" /><SelectValue placeholder="Filtrar por Empresa do Sistema" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os Clientes CR</SelectItem>{empresasFiltro.map(e => (<SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>))}</SelectContent></Select></CardContent></Card><Card className="mt-4"><CardHeader><CardTitle className="text-xl">Clientes Diretos / Contratos Cadastrados ({todosClientesCR.length})</CardTitle></CardHeader><CardContent>{renderClientesCRTable()}</CardContent></Card></TabsContent><TabsContent value="empresas_sistema"><Card className="mt-4"><CardHeader className="pb-2"><CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtro</CardTitle></CardHeader><CardContent className="flex flex-col md:flex-row gap-4"><Input placeholder="Buscar por nome ou email da empresa..." value={filtroNomeSistema} onChange={(e) => setFiltroNomeSistema(e.target.value)} className="w-full md:max-w-xs" /></CardContent></Card><Card className="mt-4"><CardHeader><CardTitle className="text-xl">Empresas do Sistema Cadastradas ({todasEmpresasSistema.length})</CardTitle></CardHeader><CardContent>{renderEmpresasSistemaTable(todasEmpresasSistema)}</CardContent></Card></TabsContent></Tabs>
      ) : (
        <Card><CardHeader><CardTitle className="text-xl">Clientes Diretos / Contratos Cadastrados ({todosClientesCR.length})</CardTitle></CardHeader><CardContent>{renderClientesCRTable()}</CardContent></Card>
      )}
      <Dialog open={dialogAberto && !!clienteSelecionado} onOpenChange={setDialogAberto}><DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar Cliente CR</DialogTitle></DialogHeader><FormCliente clienteInicial={clienteSelecionado} onSaveComplete={handleSaveComplete} /></DialogContent></Dialog>
      <Dialog open={dialogAberto && !!perfilParaEditar} onOpenChange={setDialogAberto}><DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar Empresa do Sistema</DialogTitle></DialogHeader><FormUsuario criadorRole={role!} criadorPerfil={perfil!} usuarioInicial={perfilParaEditar} planos={planosDisponiveis} onSaveComplete={handleSaveComplete} /></DialogContent></Dialog>
    </LayoutPrincipal>
  );
};

export default ClientesPage;