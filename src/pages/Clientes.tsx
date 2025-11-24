import { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, Filter, Building2, CheckCircle, Users as UsersIcon, Mail, PowerOff, Printer, LogIn, Undo2 } from 'lucide-react';
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
import { useOwnerBranding } from '@/hooks/use-owner-branding'; // NOVO IMPORT

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
    // Adicionando campos de documento para evitar o erro
    cnpj?: string | null;
    cpf?: string | null;
    documento?: string | null;
}

// NOVO TIPO
interface PlanoSimples {
    id: string;
    nome: string;
}

// NOVO TIPO: Cliente CR com status de sistema e contagens
interface ClienteCRComStatus extends Cliente {
    is_system_client: boolean;
    system_client_status?: 'Ativo' | 'Pendente' | 'Bloqueado' | 'Expirado' | 'CR'; // Adicionado 'CR'
    contratos_count: number; // NOVO
    documentos_societarios_count: number; // NOVO
    // NOVO CAMPO PARA CATEGORIZAÇÃO VISUAL
    origem_cr: 'Promovido' | 'Contrato' | 'Doc Societário' | 'Novo/CR' | 'Bloqueado';
}

const ClientesPage = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const { printContent } = usePrint();
  const { logoUrl, ownerName } = useOwnerBranding(); // USANDO HOOK DE BRANDING
  
  const [clientesCR, setClientesCR] = useState<ClienteCRComStatus[]>([]); // Clientes de Contas a Receber
  const [empresasSistema, setEmpresasSistema] = useState<EmpresaSistema[]>([]); // Empresas do sistema (tbl_clientes)
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [perfilParaEditar, setPerfilParaEditar] = useState<AnyProfile | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [dialogAvulsaAberto, setDialogAvulsaAberto] = useState(false); // Novo estado para dialog avulsa
  const [dialogConviteAberto, setDialogConviteAberto] = useState(false); // NOVO ESTADO
  
  // NOVO ESTADO
  const [planosMap, setPlanosMap] = useState<Record<string, string>>({});
  
  // Filtros para Admin
  const [empresasFiltro, setEmpresasFiltro] = useState<EmpresaFiltro[]>([]);
  const [filtroEmpresaId, setFiltroEmpresaId] = useState('todos');
  const [filtroNome, setFiltroNome] = useState('');
  
  const [activeTab, setActiveTab] = useState('clientes_cr');
  // Removendo activeEmpresaTab e activeCRTab

  const isAdmin = role === 'Admin';

  const getOwnerId = () => {
    if (role === 'Admin') return usuario?.id || null; // Admin usa seu próprio ID
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id; // FIX: proprietario_id -> cliente_id
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
        .select('id, nome');

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
    
    // 1. Buscar Empresas do Sistema (tbl_clientes)
    let systemClientsMap: Record<string, EmpresaSistema> = {};
    let systemClientsList: EmpresaSistema[] = [];
    
    let queryEmpresas = supabase
        .from('tbl_clientes')
        .select('*, cliente_id_promovido, cnpj, cpf, documento') // INCLUINDO CNPJ, CPF, DOCUMENTO
        .order('nome', { ascending: true });
        
    // FILTRO CRÍTICO: Excluir o Admin logado da lista de Clientes do Sistema
    if (isAdmin && usuario?.id) {
        queryEmpresas = queryEmpresas.neq('id', usuario.id);
    }
        
    const { data: dataEmpresas, error: errorEmpresas } = await queryEmpresas;
        
    if (errorEmpresas) {
        showError('Erro ao carregar empresas do sistema: ' + errorEmpresas.message);
    } else {
        systemClientsList = dataEmpresas as EmpresaSistema[];
        systemClientsMap = systemClientsList.reduce((acc, e) => {
            acc[e.id] = e;
            return acc;
        }, {} as Record<string, EmpresaSistema>);
        
        if (isAdmin) {
            const filteredEmpresas = systemClientsList.filter(e => 
                e.nome.toLowerCase().includes(filtroNome.toLowerCase()) ||
                e.email.toLowerCase().includes(filtroNome.toLowerCase())
            );
            setEmpresasSistema(filteredEmpresas);
        }
    }
    
    // 2. Buscar Clientes de Contas a Receber (clientes)
    let queryCR = supabase
      .from('clientes')
      .select('id, proprietario_id, nome, razao_social, nome_fantasia, documento, email, telefone, telefone_fixo, cep, endereco, numero, complemento, bairro, cidade, estado, created_at, updated_at, is_system_client')
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
      
      // 2.1. Adicionar status do sistema e contagens
      const clientesComStatus: ClienteCRComStatus[] = [];
      
      // IDs de todos os clientes CR
      const clienteCRIds = fetchedData.map(c => c.id);
      
      // 3. Buscar Contagens de Contratos e Documentos Societários
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
      
      // NOVO: Mapa para rastrear o registro mais relevante por email
      const emailMap: Record<string, ClienteCRComStatus> = {};
      
      for (const cliente of fetchedData) {
          // FILTRAGEM PRINCIPAL: Se for Cliente, exclui o próprio ID da lista de clientes CR
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
                  // Regra 1: Nulo = Vitalício (Ativo)
                  isBlockedOrExpired = false;
              } else if (isPast(dataFimAcesso)) {
                  // Regra 3: Passada = Expirado
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
              // Cliente CR puro
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
              origem_cr: origemCR, // NOVO CAMPO
          };
          
          // LÓGICA DE DESDUPLICAÇÃO POR EMAIL
          if (clienteComStatus.email) {
              const emailKey = clienteComStatus.email.toLowerCase();
              const existing = emailMap[emailKey];
              
              if (!existing || (clienteComStatus.is_system_client && existing.system_client_status !== 'Ativo')) {
                  // Se não existe, ou se o novo é um cliente do sistema (e o existente não é Ativo), substitui.
                  emailMap[emailKey] = clienteComStatus;
              } else if (!existing.is_system_client && !clienteComStatus.is_system_client) {
                  // Se ambos são CR, prioriza o que tem mais vínculos (contratos/documentos)
                  const existingScore = existing.contratos_count + existing.documentos_societarios_count;
                  const newScore = clienteComStatus.contratos_count + clienteComStatus.documentos_societarios_count;
                  
                  if (newScore > existingScore) {
                      emailMap[emailKey] = clienteComStatus;
                  }
              }
          } else {
              // Se não tem email, adiciona diretamente (não pode ser desduplicado)
              clientesComStatus.push(clienteComStatus);
          }
      }
      
      // Adiciona os clientes do mapa (desduplicados) e os clientes sem email (adicionados diretamente)
      const finalClientesCR = Object.values(emailMap).concat(clientesComStatus.filter(c => !c.email));
      
      setClientesCR(finalClientesCR);
    }

    setCarregandoDados(false);
  }, [isAdmin, ownerId, filtroEmpresaId, filtroNome, usuario?.id]);

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
    setDialogConviteAberto(false); // Fechar o dialog de convite
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
      // 1. Chamar a função RPC para verificar vínculos e despromover
      const { data, error: rpcError } = await supabase.rpc('demote_system_client', {
          p_client_id: id,
      });
      
      if (rpcError) throw rpcError;
      
      // O RPC retorna uma tabela com { success: boolean, message: text }
      const result = data?.[0];
      
      if (result && !result.success) {
          // Se a despromoção falhou devido a vínculos
          showError(result.message);
      } else if (result && result.success) {
          showSuccess(result.message);
          buscarDados();
      } else {
          showError('Resposta inesperada do servidor.');
      }
      
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
    const dataFimISO = format(dataFimAcesso, 'yyyy-MM-dd') + 'T12:00:00Z'; // Meio-dia UTC
    
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
          const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: `${BASE_URL}/atualizar-senha`,
          });
          
          if (error) throw error;
          
          // 2. Abrir o diálogo de ações para que o Admin possa copiar/enviar o link
          // CORREÇÃO DO ERRO 3: Acessando action_link da resposta de dados
          const resetLink = (data as { action_link: string | null }).action_link || `${BASE_URL}/atualizar-senha`;
          
          const whatsappTemplate = `Olá ${nome}! Seu convite de acesso ao sistema está pronto. Clique no link abaixo para definir sua senha e acessar:\n\n${resetLink}`;
          
          if (window.confirm(`Link de Acesso Gerado para ${nome}. Deseja copiar o link para enviar manualmente?`)) {
              navigator.clipboard.writeText(resetLink);
              showSuccess('Link copiado para a área de transferência.');
          }
          
          // Abre o WhatsApp com o template
          window.open(`https://wa.me/${(empresasSistema.find(e => e.email === email)?.telefone || '').replace(/\D/g, '') || ''}?text=${encodeURIComponent(whatsappTemplate)}`, '_blank');
          
      } catch (error: any) {
          showError('Falha ao reenviar convite: ' + error.message);
      } finally {
          setCarregandoDados(false);
      }
  };
  
  const handleNewCR = () => {
      // ALTERAÇÃO AQUI: Redireciona para o modal de Empresa Avulsa (que cria na tbl_clientes)
      setDialogAvulsaAberto(true);
      setClienteSelecionado(null);
      setPerfilParaEditar(null);
      setDialogAberto(false);
  };
  
  // NOVO HANDLER: Enviar Convite de Acesso (Substitui PromoteToSystem)
  const handleSendInvite = async (cliente: Cliente) => {
    if (!cliente.email) {
        showError('O cliente deve ter um email cadastrado para enviar o convite.');
        return;
    }
    
    // 1. VERIFICAÇÃO DE DUPLICIDADE NA TBL_CLIENTES
    const existingSystemClient = empresasSistema.find(e => e.email === cliente.email);
    if (existingSystemClient) {
        showError(`O email ${cliente.email} já está em uso pela empresa ${existingSystemClient.nome} (ID: ${existingSystemClient.id.substring(0, 8)}...). Por favor, corrija o email do cliente CR antes de enviar o convite.`);
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
  
  // NOVO HANDLER: Despromover Cliente Sistema para Cliente CR
  const handleDemoteClient = async (cliente: EmpresaSistema) => {
    if (!window.confirm(`Tem certeza que deseja DESPROMOVER a empresa ${cliente.nome}? Isso removerá o perfil de Cliente do Sistema e o usuário do Auth, se não houver vínculos.`)) return;
    
    setCarregandoDados(true);
    
    try {
        // 1. Chamar a função RPC para verificar vínculos e despromover
        const { data, error: rpcError } = await supabase.rpc('demote_system_client', {
            p_client_id: cliente.id,
        });
        
        if (rpcError) throw rpcError;
        
        // O RPC retorna uma tabela com { success: boolean, message: text }
        const result = data?.[0];
        
        if (result && !result.success) {
            // Se a despromoção falhou devido a vínculos
            showError(result.message);
        } else if (result && result.success) {
            showSuccess(result.message);
            
            // 2. Atualizar o registro na tabela 'clientes' para marcar como Cliente CR puro
            const { error: updateCRError } = await supabase
                .from('clientes')
                .update({ is_system_client: false })
                .eq('id', cliente.id);
                
            if (updateCRError) console.error('Aviso: Falha ao atualizar is_system_client na tabela clientes:', updateCRError);
            
            // 3. Re-busca os dados
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
  
  // NOVO HANDLER: Promover Cliente CR para Cliente do Sistema (USA EDGE FUNCTION)
  const handlePromoteCRDirect = async (cliente: ClienteCRComStatus) => {
    if (!cliente.email) {
        showError('O cliente deve ter um email cadastrado para ser promovido.');
        return;
    }
    
    if (!window.confirm(`Tem certeza que deseja PROMOVER o cliente ${cliente.nome} para Cliente do Sistema? Isso criará um usuário no Auth e o marcará como pendente de aprovação.`)) return;
    
    setCarregandoDados(true);
    
    try {
        // 1. Chamar a Edge Function para criar o usuário no Auth e promover
        const { data, error: invokeError } = await supabase.functions.invoke('promote-client-direct', {
            body: {
                clienteCrId: cliente.id,
                adminId: ownerId,
            },
        });
        
        if (invokeError) throw invokeError;
        if (data?.error) throw new Error(data.error);
        
        showSuccess(`Cliente ${cliente.nome} promovido para Cliente do Sistema com sucesso!`);
        
        // 2. Enviar link de redefinição de senha (para que o Admin possa enviar o link)
        const { data: resetData, error: resetError } = await supabase.auth.resetPasswordForEmail(cliente.email, {
            redirectTo: `${BASE_URL}/atualizar-senha`, 
        });
        
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
  
  // --- Lógica de Filtragem de Empresas do Sistema ---
  const filterEmpresasSistema = (status: 'pendentes' | 'ativos' | 'inativos' | 'avulsos') => {
      
      return empresasSistema.filter((e: EmpresaSistema) => {
          const dataFimAcesso = e.data_fim_acesso ? parseISO(e.data_fim_acesso) : null;
          
          // Lógica de Bloqueio/Expiração (Ajustada para a nova regra)
          let isBlockedOrExpired = false;
          if (dataFimAcesso === null) {
              // Regra 1: Nulo = Vitalício (Ativo)
              isBlockedOrExpired = false;
          } else if (isPast(dataFimAcesso)) {
              // Regra 3: Passada = Expirado
              isBlockedOrExpired = true;
          }
          
          const isAvulso = e.tipo_cliente?.endsWith('_Avulso') ?? false; // Verifica o novo sufixo
          
          if (status === 'pendentes') {
              return !e.aprovado;
          }
          
          if (status === 'ativos') {
              // Ativos: Aprovados, não avulsos e com acesso futuro/vitalício
              return e.aprovado && !isAvulso && !isBlockedOrExpired;
          }
          if (status === 'inativos') {
              // Inativos: Aprovados, não avulsos e com acesso expirado
              return e.aprovado && !isAvulso && isBlockedOrExpired;
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
  
  // Consolidando todas as empresas do sistema para a aba 'Clientes Sistema'
  const todasEmpresasSistema = useMemo(() => {
      return [...empresasPendentes, ...empresasAtivas, ...empresasInativas, ...empresasAvulsas];
  }, [empresasPendentes, empresasAtivas, empresasInativas, empresasAvulsas]);
  
  // Consolidando todos os clientes CR para a aba 'Clientes CR'
  const todosClientesCR = useMemo(() => {
      // FILTRAGEM PRINCIPAL: Se for Cliente, exclui o próprio ID da lista de clientes CR
      if (role === 'Cliente' && ownerId) {
          return clientesCR.filter(c => c.id !== ownerId);
      }
      return clientesCR;
  }, [clientesCR, role, ownerId]);


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
                    <TableHead className="w-[120px]">Status Sistema</TableHead> {/* NOVO CABEÇALHO */}
                    <TableHead className="w-[100px] text-center">Contratos</TableHead> {/* NOVO */}
                    <TableHead className="w-[100px] text-center">Doc. Societário</TableHead> {/* NOVO */}
                    {isAdmin && <TableHead>Proprietário ID</TableHead>}
                    <TableHead className="text-right">Ações</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {todosClientesCR.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-4 text-muted-foreground">
                            Nenhum cliente encontrado.
                        </TableCell>
                    </TableRow>
                ) : (
                    todosClientesCR.map((cliente) => {
                        // Verifica se o cliente CR já é um cliente do sistema (tbl_clientes)
                        const isSystemClient = cliente.is_system_client;
                        const systemStatus = cliente.system_client_status;
                        
                        let statusBadge;
                        
                        // Define o status baseado na origem_cr
                        if (isSystemClient) {
                            // Se é cliente do sistema, exibe o status real (Ativo, Bloqueado, Expirado)
                            let variant: 'default' | 'warning' | 'destructive' = 'default';
                            if (systemStatus === 'Pendente') variant = 'warning';
                            if (systemStatus === 'Expirado') variant = 'destructive';
                            
                            statusBadge = <Badge variant={variant}>{systemStatus}</Badge>;
                        } else {
                            // Se não é cliente do sistema, exibe a origem CR
                            switch (cliente.origem_cr) {
                                case 'Contrato':
                                    statusBadge = <Badge variant="secondary">Contrato</Badge>;
                                    break;
                                case 'Doc Societário':
                                    statusBadge = <Badge variant="secondary">Doc Societário</Badge>;
                                    break;
                                case 'Novo/CR':
                                default:
                                    statusBadge = <Badge variant="outline">CR</Badge>;
                                    break;
                            }
                        }
                        
                        const isActionDisabled = carregandoDados;
                        
                        // NOVO: Classe de destaque para clientes promovidos
                        const rowClassName = isSystemClient ? 'bg-green-500/10' : '';
                        
                        // NOVO: Condição para ocultar o botão Despromover e Acesso
                        const hasActiveLinks = cliente.contratos_count > 0 || cliente.documentos_societarios_count > 0;
                        const shouldHideDemoteOrAccess = isSystemClient && hasActiveLinks;

                        return (
                            <TableRow key={cliente.id} className={rowClassName}>
                                <TableCell className="font-medium">{cliente.nome_fantasia || cliente.nome}</TableCell>
                                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{cliente.razao_social || '-'}</TableCell>
                                <TableCell>{cliente.email || '-'}</TableCell>
                                <TableCell>{cliente.telefone || '-'}</TableCell>
                                <TableCell>{statusBadge}</TableCell> {/* NOVO CAMPO */}
                                <TableCell className="text-center">
                                    {cliente.contratos_count > 0 ? (
                                        <Badge variant="default">{cliente.contratos_count}</Badge>
                                    ) : '-'}
                                </TableCell>
                                <TableCell className="text-center">
                                    {cliente.documentos_societarios_count > 0 ? (
                                        <Badge variant="secondary">{cliente.documentos_societarios_count}</Badge>
                                    ) : '-'}
                                </TableCell>
                                {isAdmin && <TableCell className="text-sm text-muted-foreground">{cliente.proprietario_id || 'N/A'}</TableCell>}
                                <TableCell className="text-right">
                                    <div className="flex justify-end space-x-1">
                                        
                                        {/* BOTÃO PROMOVER / DESPROMOVER (Apenas Admin) */}
                                        {isAdmin && cliente.email && (
                                            isSystemClient ? (
                                                !shouldHideDemoteOrAccess && (
                                                    <Button 
                                                        variant="destructive" 
                                                        size="sm" 
                                                        onClick={() => handleDemoteClient(cliente as unknown as EmpresaSistema)}
                                                        title="Despromover Cliente (Reverte para CR)"
                                                        disabled={isActionDisabled}
                                                        className="h-8"
                                                    >
                                                        <Undo2 className="w-4 h-4 mr-1" /> Despromover
                                                    </Button>
                                                )
                                            ) : (
                                                <>
                                                    {/* NOVO BOTÃO: Promover para Sistema (Direto) */}
                                                    <Button 
                                                        variant="default" 
                                                        size="sm" 
                                                        onClick={() => handlePromoteCRDirect(cliente)}
                                                        title="Promover Cliente para Cliente do Sistema (Cria Auth)"
                                                        disabled={isActionDisabled}
                                                        className="h-8 bg-blue-500 hover:bg-blue-600"
                                                    >
                                                        <UsersIcon className="w-4 h-4 mr-1" /> Promover
                                                    </Button>
                                                    
                                                    {/* BOTÃO CONVITE (Cria Auth e envia link) */}
                                                    <Button 
                                                        variant="default" 
                                                        size="sm" 
                                                        onClick={() => handleSendInvite(cliente)}
                                                        title="Enviar Convite de Acesso (Cria Auth e envia link)"
                                                        disabled={isActionDisabled}
                                                        className="h-8 bg-orange-500 hover:bg-orange-600"
                                                    >
                                                        <Mail className="w-4 h-4 mr-1" /> Convite
                                                    </Button>
                                                </>
                                            )
                                        )}
                                        
                                        {/* BOTÃO ACESSO - SÓ APARECE SE FOR CLIENTE DO SISTEMA E NÃO TIVER VÍNCULOS */}
                                        {isAdmin && cliente.email && isSystemClient && !shouldHideDemoteOrAccess && (
                                            <Button 
                                                variant="secondary" 
                                                size="sm" 
                                                onClick={() => handleResendInvite(cliente.email!, cliente.nome)}
                                                title="Reenviar Link de Acesso"
                                                disabled={carregandoDados}
                                                className="h-8"
                                            >
                                                <LogIn className="w-4 h-4 mr-1" /> Acesso
                                            </Button>
                                        )}
                                        
                                        {/* BOTÃO DE EDIÇÃO */}
                                        {/* APLICAÇÃO DA NOVA REGRA: Ocultar se shouldHideDemoteOrAccess for true */}
                                        {!shouldHideDemoteOrAccess && (
                                            <Button variant="ghost" size="icon" onClick={() => handleEditCR(cliente)}>
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                        )}
                                        
                                        {/* BOTÃO DE DELETAR */}
                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteCR(cliente.id)}>
                                            <Trash2 className="w-4 h-4 text-red-500" />
                                        </Button>
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
                        
                        // Lógica de Bloqueio/Expiração (Ajustada para a nova regra)
                        let isBlockedOrExpired = false;
                        if (dataFimAcesso === null) {
                            // Regra 1: Nulo = Vitalício (Ativo)
                            isBlockedOrExpired = false;
                        } else if (isPast(dataFimAcesso)) {
                            // Regra 3: Passada = Expirado
                            isBlockedOrExpired = true;
                        }
                        
                        const isAvulso = empresa.tipo_cliente?.endsWith('_Avulso') ?? false; // Verifica o novo sufixo
                        
                        let statusBadge;
                        if (!empresa.aprovado) {
                            statusBadge = <Badge variant="warning">Pendente</Badge>;
                        } else if (isBlockedOrExpired) {
                            statusBadge = <Badge variant="destructive">Expirado</Badge>;
                        } else if (isAvulso) {
                            // Se for avulso, o status reflete se o acesso está ativo ou expirado
                            statusBadge = <Badge variant={!isBlockedOrExpired ? 'default' : 'destructive'}>{!isBlockedOrExpired ? 'Avulso Ativo' : 'Avulso Expirado'}</Badge>;
                        } else {
                            statusBadge = <Badge variant="default">Ativo</Badge>;
                        }
                        
                        // ALTERAÇÃO AQUI: Se dataFimAcesso for nulo, exibe 'Vitalício'
                        const dataExpiracaoDisplay = dataFimAcesso ? format(dataFimAcesso, 'dd/MM/yyyy') : 'Vitalício'; 
                        const planoNome = empresa.plano_id ? planosMap[empresa.plano_id] || 'N/A' : 'N/A';
                        
                        // Verifica se o cliente foi promovido de um cliente CR (cliente_id_promovido não é nulo)
                        const isPromoted = !!(empresa as any).cliente_id_promovido;

                        return (
                            <TableRow key={empresa.id} className={cn(!empresa.aprovado && "bg-yellow-500/10", isBlockedOrExpired && "bg-red-500/10")}>
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
                                    
                                    {/* BOTÃO DESPROMOVER (Apenas Admin e se não for o Admin logado) */}
                                    {isAdmin && empresa.id !== usuario?.id && isPromoted && (
                                        <Button 
                                            variant="outline" 
                                            size="icon" 
                                            onClick={() => handleDemoteClient(empresa)}
                                            title="Despromover Cliente (Reverte para CR)"
                                            disabled={carregandoDados}
                                        >
                                            <Undo2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                    
                                    {/* Botão de Desativar (Aparece se estiver Ativo ou Avulso e não expirado) */}
                                    {!isBlockedOrExpired && (
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
                                        <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button 
                                        variant="destructive" 
                                        size="icon" 
                                        onClick={() => handleDeleteEmpresaSistema(empresa.id, empresa.nome)}
                                    >
                                        <Trash2 className="w-4 h-4" />
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
          dataToPrint = todosClientesCR; // Usando a lista consolidada
          tituloRelatorio = `Clientes Diretos / Contratos`;
      } else {
          // Mapeia o plano_id para o nome do plano antes de imprimir
          dataToPrint = todasEmpresasSistema.map(e => ({
              ...e,
              plano_id: e.plano_id ? planosMap[e.plano_id] || e.plano_id : 'N/A', // Passa o nome do plano
          }));
          tituloRelatorio = `Clientes Sistema`;
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
              activeEmpresaTab={'ativos'} // Usando um valor padrão, pois as sub-abas foram removidas
              logoUrl={logoUrl} // PASSANDO LOGO
              ownerName={ownerName} // PASSANDO NOME
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
        
        {/* Botões de Ação (Topo) - Ajustado para responsividade */}
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
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
            {/* Botão para Novo Cliente CR (Agora cria um cliente avulso na tbl_clientes) */}
            <Dialog open={dialogAvulsaAberto} onOpenChange={setDialogAvulsaAberto}>
              <DialogTrigger asChild>
                <Button onClick={handleNewCR} className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600">
                  <PlusCircle className="w-4 h-4 mr-2" />
                  Cliente Direto
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                      <DialogTitle>Cadastrar Cliente Direto (Avulso)</DialogTitle>
                      <p className="text-sm text-muted-foreground">
                          Cria um perfil de cliente na base de usuários para ser usado em Contas a Receber e Contratos.
                      </p>
                  </DialogHeader>
                  <FormEmpresaAvulsa onSaveComplete={handleSaveComplete} />
              </DialogContent>
            </Dialog>
            
            {/* Botão para Nova Empresa Avulsa (Apenas Admin) - REMOVIDO, AGORA É O NOVO CLIENTE CR */}
            
            {/* NOVO BOTÃO: Convidar Cliente (Apenas Admin) */}
            {isAdmin && (
                <Dialog open={dialogConviteAberto} onOpenChange={setDialogConviteAberto}>
                    <DialogTrigger asChild>
                        <Button variant="secondary" onClick={() => setDialogConviteAberto(true)} className="w-full sm:w-auto">
                            <Mail className="w-4 h-4 mr-2" />
                            Convidar Cliente
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Convidar Novo Cliente do Sistema</DialogTitle>
                            <p className="text-sm text-muted-foreground">
                                Envia um link de cadastro para que o cliente defina a senha e inicie o processo de aprovação.
                            </p>
                        </DialogHeader>
                        {/* Usando FormUsuario no modo de criação de novo cliente (isNewClient) */}
                        <FormUsuario 
                            criadorRole={role!}
                            criadorPerfil={perfil!}
                            usuarioInicial={null}
                            onSaveComplete={handleSaveComplete}
                            isNewClient={true} // NOVO PROP PARA MUDAR O COMPORTAMENTO
                        />
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
                    <CardHeader><CardTitle className="text-xl">Clientes Diretos / Contratos Cadastrados ({todosClientesCR.length})</CardTitle></CardHeader>
                    <CardContent>{renderClientesCRTable()}</CardContent>
                </Card>
            </TabsContent>
            
            <TabsContent value="empresas_sistema">
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
                <Card className="mt-4">
                    <CardHeader><CardTitle className="text-xl">Empresas do Sistema Cadastradas ({todasEmpresasSistema.length})</CardTitle></CardHeader>
                    <CardContent>{renderEmpresasSistemaTable(todasEmpresasSistema)}</CardContent>
                </Card>
            </TabsContent>
        </Tabs>
      ) : (
        // Cliente/Usuário (apenas Clientes CR)
        <Card>
            <CardHeader>
                <CardTitle className="text-xl">Clientes Diretos / Contratos Cadastrados ({todosClientesCR.length})</CardTitle>
            </CardHeader>
            <CardContent>{renderClientesCRTable()}</CardContent>
        </Card>
      )}
      
      {/* Dialog para editar Cliente CR (usa FormCliente) */}
      <Dialog open={dialogAberto && !!clienteSelecionado} onOpenChange={setDialogAberto}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Cliente CR</DialogTitle>
            </DialogHeader>
            <FormCliente 
              clienteInicial={clienteSelecionado}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
        
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