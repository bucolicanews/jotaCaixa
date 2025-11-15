import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Clock, User, Filter, CalendarCheck, ChevronLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { UsuarioProfile, ClienteProfile } from '@/types/usuario'; // CORRIGIDO: AdminUsuarioProfile removido
import { Cliente } from '@/types/cliente';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import { DetalheFolhaPonto } from '@/components/ponto/DetalheFolhaPonto';
import { MonthPicker } from '@/components/MonthPicker';
import { RegistroPonto, Ferias } from '@/types/ponto';
import AjustarPontoDialog from '@/components/ponto/AjustarPontoDialog';
import GerenciarFaltas from '@/components/formularios/GerenciarFaltas';
import GerenciarFolgaTrabalhada from '@/components/formularios/GerenciarFolgaTrabalhada';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// Tipo simplificado para o usuário que estamos buscando
interface UsuarioPonto extends UsuarioProfile {
    cliente_nome?: string; // Nome do cliente/empresa a que o usuário pertence
    is_admin_user?: boolean;
    admin_id?: string | null; // Adicionado para AdminUsuarioProfile
}

const FolhaPonto: React.FC = () => {
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  
  const [usuarios, setUsuarios] = useState<UsuarioPonto[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [filtroNome, setFiltroNome] = useState('');
  const filtroNomeDebounced = useDebounce(filtroNome, 500);
  const [filtroClienteId, setFiltroClienteId] = useState('todos');
  const [clientesDisponiveis, setClientesDisponiveis] = useState<Cliente[]>([]);
  const [dataSelecionada, setDataSelecionada] = useState<Date>(startOfMonth(new Date()));
  
  // Estados para o detalhe do funcionário selecionado
  const [funcionarioSelecionado, setFuncionarioSelecionado] = useState<UsuarioPonto | null>(null);
  const [registrosDoFuncionario, setRegistrosDoFuncionario] = useState<RegistroPonto[]>([]);
  const [feriasDoFuncionario, setFeriasDoFuncionario] = useState<Ferias[]>([]);
  
  // Diálogos
  const [ajustarPontoDialog, setAjustarPontoDialog] = useState<{ open: boolean, dia: Date | null, registros: RegistroPonto[] }>({ open: false, dia: null, registros: [] });
  const [gerenciarFaltasDialog, setGerenciarFaltasDialog] = useState<{ open: boolean, dia: Date | null, registro: RegistroPonto | null }>({ open: false, dia: null, registro: null });
  const [gerenciarFolgaDialog, setGerenciarFolgaDialog] = useState<{ open: boolean, dia: Date | null, registros: RegistroPonto[] }>({ open: false, dia: null, registros: [] });

  const isAdmin = role === 'Admin';
  
  const getOwnerId = () => {
    if (isAdmin) return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    return null;
  };
  
  const ownerId = getOwnerId();

  const fetchClientes = useCallback(async () => {
    if (!isAdmin || !usuario?.id) return;
    
    const { data: clientsData, error: clientsError } = await supabase
        .from('tbl_clientes')
        .select('id, nome');

    if (clientsError) {
        showError('Erro ao carregar clientes: ' + clientsError.message);
        return;
    }
    
    const fetchedClients = clientsData as Cliente[];
    if (usuario?.id) {
        fetchedClients.unshift({ id: usuario.id, nome: 'Meus Usuários (Admin)' } as Cliente);
    }
    setClientesDisponiveis(fetchedClients);
  }, [isAdmin, usuario?.id]);

  const buscarUsuarios = useCallback(async () => {
    if (!ownerId && !isAdmin) {
        setCarregandoDados(false);
        return;
    }
    
    setCarregandoDados(true);
    
    let fetchedUsers: UsuarioPonto[] = [];
    
    if (isAdmin) {
        
        // Busca usuários do Admin
        const { data: adminUsersData } = await supabase
            .from('admin_usuarios')
            .select('*')
            .eq('admin_id', usuario?.id)
            .order('nome');
            
        const adminUsers = (adminUsersData || []).map(u => ({ 
            ...u, 
            cliente_id: null, 
            is_admin_user: true,
            cliente_nome: 'Meus Usuários (Admin)' 
        })) as UsuarioPonto[];
        fetchedUsers.push(...adminUsers);

        // Busca usuários dos Clientes
        const clientIds = clientesDisponiveis.filter(c => c.id !== usuario?.id).map(c => c.id);
        if (clientIds.length > 0) {
            const { data: clientUsersData } = await supabase
                .from('tbl_usuarios')
                .select('*, admin_id') // Incluindo admin_id para tipagem correta
                .in('cliente_id', clientIds)
                .order('nome');
                
            const clientUsers = (clientUsersData || []).map(item => {
                const nomeEmpresa = clientesDisponiveis.find(c => c.id === (item as UsuarioProfile).cliente_id)?.nome || 'N/A';
                return { ...item, cliente_nome: nomeEmpresa, is_admin_user: false } as UsuarioPonto;
            });
            fetchedUsers.push(...clientUsers);
        }
        
    } else if (ownerId) {
        // Cliente: Busca apenas seus próprios usuários
        const { data: usersData } = await supabase
            .from('tbl_usuarios')
            .select('*')
            .eq('cliente_id', ownerId)
            .order('nome');
            
        fetchedUsers = (usersData || []).map(u => ({ ...u, cliente_nome: (perfil as ClienteProfile)?.nome || 'Minha Empresa' })) as UsuarioPonto[];
    }
    
    setUsuarios(fetchedUsers);
    setCarregandoDados(false);
  }, [ownerId, isAdmin, usuario?.id, clientesDisponiveis, perfil]);

  useEffect(() => {
    if (!carregandoSessao) {
        fetchClientes();
    }
  }, [carregandoSessao, fetchClientes]);
  
  useEffect(() => {
      if (!carregandoSessao && clientesDisponiveis.length > 0) {
          buscarUsuarios();
      }
  }, [carregandoSessao, clientesDisponiveis, buscarUsuarios]);

  const fetchRegistrosFuncionario = useCallback(async (user: UsuarioPonto, data: Date) => {
    const isFuncionarioAdmin = user.is_admin_user;
    const tabelaRegistros = isFuncionarioAdmin ? 'admin_registros_ponto' : 'registros_ponto';
    const tabelaFerias = isFuncionarioAdmin ? 'admin_ferias_user' : 'ferias';
    
    const inicioMes = format(startOfMonth(data), 'yyyy-MM-dd');
    const fimMes = format(endOfMonth(data), 'yyyy-MM-dd');
    
    // 1. Buscar Registros de Ponto
    const { data: registros, error: regError } = await supabase
      .from(tabelaRegistros)
      .select('*')
      .eq('funcionario_id', user.id)
      .gte('horario_registro', inicioMes)
      .lte('horario_registro', fimMes)
      .order('horario_registro', { ascending: true });

    if (regError) {
      showError('Erro ao carregar registros de ponto: ' + regError.message);
      setRegistrosDoFuncionario([]);
    } else {
      setRegistrosDoFuncionario(registros as RegistroPonto[]);
    }
    
    // 2. Buscar Férias
    const { data: feriasRes, error: feriasError } = await supabase
        .from(tabelaFerias)
        .select('*')
        .eq('funcionario_id', user.id)
        .lte('data_inicio', fimMes)
        .gte('data_fim', inicioMes);

    if (feriasError) {
        showError('Erro ao carregar férias: ' + feriasError.message);
        setFeriasDoFuncionario([]);
    } else {
        setFeriasDoFuncionario(feriasRes as Ferias[]);
    }
  }, []);

  useEffect(() => {
    if (funcionarioSelecionado) {
        fetchRegistrosFuncionario(funcionarioSelecionado, dataSelecionada);
    }
  }, [funcionarioSelecionado, dataSelecionada, fetchRegistrosFuncionario]);

  const handleSelectFuncionario = (user: UsuarioPonto) => {
    setFuncionarioSelecionado(user);
    setDataSelecionada(startOfMonth(new Date()));
  };
  
  const handleBackToUsers = () => {
    setFuncionarioSelecionado(null);
    setRegistrosDoFuncionario([]);
    setFeriasDoFuncionario([]);
  };
  
  const handleRefresh = () => {
      if (funcionarioSelecionado) {
          fetchRegistrosFuncionario(funcionarioSelecionado, dataSelecionada);
      } else {
          buscarUsuarios();
      }
  };
  
  // Handlers para os diálogos
  const handleOpenAjustarPonto = (dia: Date) => {
    const diaString = format(dia, 'yyyy-MM-dd');
    const registros = registrosDoFuncionario.filter(r => format(parseISO(r.horario_registro), 'yyyy-MM-dd') === diaString);
    setAjustarPontoDialog({ open: true, dia, registros });
  };
  
  const handleOpenGerenciarFaltas = (registro: RegistroPonto | null, dia: Date) => {
    setGerenciarFaltasDialog({ open: true, dia, registro });
  };
  
  const handleOpenGerenciarFolga = (dia: Date, registros: RegistroPonto[]) => {
    setGerenciarFolgaDialog({ open: true, dia, registros });
  };
  
  const handleDeleteRegistro = () => {
      handleRefresh(); // Força o recarregamento dos registros
  };

  const usuariosFiltrados = useMemo(() => {
    let filtered = usuarios;

    if (filtroNomeDebounced) {
        filtered = filtered.filter(u => 
            u.nome.toLowerCase().includes(filtroNomeDebounced.toLowerCase()) ||
            u.email.toLowerCase().includes(filtroNomeDebounced.toLowerCase())
        );
    }
    
    if (filtroClienteId !== 'todos') {
        filtered = filtered.filter(u => u.cliente_id === filtroClienteId || u.admin_id === filtroClienteId);
    }

    return filtered;
  }, [usuarios, filtroNomeDebounced, filtroClienteId]);


  if (carregandoSessao || carregandoDados) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!ownerId && !isAdmin) {
      return (
          <LayoutPrincipal>
              <Card><CardContent className="p-6">Você não tem permissão para acompanhar a folha de ponto.</CardContent></Card>
          </LayoutPrincipal>
      );
  }
  
  // --- VISUALIZAÇÃO DE DETALHES DO FUNCIONÁRIO ---
  if (funcionarioSelecionado) {
    const isFuncionarioAdmin = funcionarioSelecionado.is_admin_user;
    const proprietarioIdFuncionario = isFuncionarioAdmin ? funcionarioSelecionado.admin_id : funcionarioSelecionado.cliente_id;
    
    return (
        <LayoutPrincipal>
            <div className="flex items-center mb-6">
                <Button 
                    onClick={handleBackToUsers} 
                    variant="link" 
                    type="button"
                    className="text-muted-foreground hover:text-primary flex items-center mr-4 p-0 h-auto"
                >
                    <ChevronLeft className="w-5 h-5" />
                    Voltar para Usuários
                </Button>
                <h1 className="text-2xl md:text-3xl font-bold flex items-center">
                    <Clock className="w-6 h-6 mr-2" /> Folha de Ponto: {funcionarioSelecionado.nome}
                </h1>
            </div>
            
            <div className="flex justify-end mb-4">
                <MonthPicker
                    date={dataSelecionada}
                    setDate={setDataSelecionada}
                />
            </div>
            
            <DetalheFolhaPonto
                funcionario={{
                    id: funcionarioSelecionado.id,
                    nome: funcionarioSelecionado.nome,
                    salario: funcionarioSelecionado.salario || 0,
                    horas_mensais: funcionarioSelecionado.horas_mensais || 220,
                    registros: registrosDoFuncionario,
                    dias_folga_fixos: funcionarioSelecionado.dias_folga_fixos || [],
                    folga_domingo_obrigatoria: funcionarioSelecionado.folga_domingo_obrigatoria ?? true,
                    ferias: feriasDoFuncionario,
                    data_inicio_contrato: funcionarioSelecionado.data_inicio_contrato,
                }}
                mes={dataSelecionada}
                onEditRegistro={handleOpenAjustarPonto}
                onEditFaltaAbono={handleOpenGerenciarFaltas}
                onDeleteRegistro={handleDeleteRegistro}
                onManageWorkedDayOff={handleOpenGerenciarFolga}
            />
            
            {/* Diálogos */}
            {ajustarPontoDialog.dia && (
                <AjustarPontoDialog
                    open={ajustarPontoDialog.open}
                    onOpenChange={(open) => setAjustarPontoDialog({ open, dia: null, registros: [] })}
                    funcionario={{ id: funcionarioSelecionado.id, nome: funcionarioSelecionado.nome, empresa_id: proprietarioIdFuncionario!, isFuncionarioAdmin: isFuncionarioAdmin! }}
                    dia={ajustarPontoDialog.dia}
                    registrosIniciais={ajustarPontoDialog.registros}
                    onSaveComplete={handleRefresh}
                />
            )}
            
            {gerenciarFaltasDialog.dia && (
                <GerenciarFaltas
                    open={gerenciarFaltasDialog.open}
                    onOpenChange={(open) => setGerenciarFaltasDialog({ open, dia: null, registro: null })}
                    funcionario={{ id: funcionarioSelecionado.id, nome: funcionarioSelecionado.nome, empresa_id: proprietarioIdFuncionario!, isFuncionarioAdmin: isFuncionarioAdmin! }}
                    dataFalta={gerenciarFaltasDialog.dia}
                    registroInicial={gerenciarFaltasDialog.registro}
                    onFaltaRegistrada={handleRefresh}
                />
            )}
            
            {gerenciarFolgaDialog.dia && (
                <GerenciarFolgaTrabalhada
                    open={gerenciarFolgaDialog.open}
                    onOpenChange={(open) => setGerenciarFolgaDialog({ open, dia: null, registros: [] })}
                    funcionario={{ id: funcionarioSelecionado.id, nome: funcionarioSelecionado.nome, empresa_id: proprietarioIdFuncionario!, isFuncionarioAdmin: isFuncionarioAdmin! }}
                    dia={gerenciarFolgaDialog.dia}
                    registrosDoDia={gerenciarFolgaDialog.registros}
                    onSaveComplete={handleRefresh}
                />
            )}
        </LayoutPrincipal>
    );
  }

  // --- VISUALIZAÇÃO DA LISTA DE USUÁRIOS ---
  return (
    <LayoutPrincipal>
      <div className="flex items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <Clock className="w-6 h-6 mr-2" /> Acompanhar Ponto
        </h1>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <User className="w-5 h-5 mr-2" /> Selecione o Funcionário
          </CardTitle>
        </CardHeader>
        <CardContent>
            
            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <Input
                    placeholder="Filtrar por nome ou email..."
                    value={filtroNome}
                    onChange={(event) => setFiltroNome(event.target.value)}
                    className="max-w-sm"
                />
                
                {isAdmin && (
                    <Select value={filtroClienteId} onValueChange={setFiltroClienteId}>
                        <SelectTrigger className="max-w-[250px]">
                            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                            <SelectValue placeholder="Filtrar por Empresa" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todos">Todas as Empresas</SelectItem>
                            {clientesDisponiveis.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nome do Usuário</TableHead>
                            <TableHead>Email</TableHead>
                            {isAdmin && <TableHead>Empresa/Cliente</TableHead>}
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {usuariosFiltrados.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={isAdmin ? 4 : 3} className="text-center py-4 text-muted-foreground">
                                    Nenhum usuário encontrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            usuariosFiltrados.map(u => (
                                <TableRow key={u.id} onClick={() => handleSelectFuncionario(u)} className="cursor-pointer hover:bg-secondary/50">
                                    <TableCell className="font-medium">{u.nome}</TableCell>
                                    <TableCell>{u.email}</TableCell>
                                    {isAdmin && <TableCell className="text-sm text-muted-foreground">{u.cliente_nome}</TableCell>}
                                    <TableCell className="text-right">
                                        <Button variant="secondary" size="sm">
                                            <CalendarCheck className="w-4 h-4 mr-2" /> Ver Folha
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default FolhaPonto;