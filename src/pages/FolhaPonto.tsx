import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Clock, User, Filter, CalendarCheck, ChevronLeft, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { UsuarioProfile, ClienteProfile, AdminUsuarioProfile } from '@/types/usuario';
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
import { useSearchParams } from 'react-router-dom';
import { usePrint } from '@/hooks/use-print';
import * as ReactDOMServer from 'react-dom/server';
import FolhaPontoPrint from '@/components/ponto/FolhaPontoPrint';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useOwnerBranding } from '@/hooks/use-owner-branding';

// Tipo simplificado para o usuário que estamos buscando
interface UsuarioPonto extends UsuarioProfile {
    cliente_nome?: string; // Nome do cliente/empresa a que o usuário pertence
    is_admin_user?: boolean;
    admin_id?: string | null; // Adicionado para AdminUsuarioProfile
}

const FolhaPonto: React.FC = () => {
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const { printContent } = usePrint();
  const { logoUrl, ownerName } = useOwnerBranding();
  
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
  const isSelfMode = mode === 'self';
  
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

  const buscarUsuarios = useCallback(async (clientList: Cliente[]) => {
    if (!ownerId && !isAdmin) {
        setCarregandoDados(false);
        return;
    }
    
    setCarregandoDados(true);
    
    let fetchedUsers: UsuarioPonto[] = [];
    
    let allowedClienteIds: string[] = [];
    if (isAdmin) {
        allowedClienteIds = clientList.map(c => c.id);
    } else if (ownerId) {
        allowedClienteIds = [ownerId];
    }

    if (allowedClienteIds.length === 0) {
        setUsuarios([]);
        setCarregandoDados(false);
        return;
    }

    if (isAdmin) {
        
        // Busca usuários do Admin (admin_usuarios)
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

        // Busca usuários dos Clientes (tbl_usuarios)
        const clientIds = clientList.filter(c => c.id !== usuario?.id).map(c => c.id);
        
        if (clientIds.length > 0) {
            const { data: clientUsersData } = await supabase
                .from('tbl_usuarios')
                .select('*, admin_id')
                .in('cliente_id', clientIds)
                .order('nome');
                
            const clientUsers = (clientUsersData || []).map(item => {
                const nomeEmpresa = clientList.find(c => c.id === (item as UsuarioProfile).cliente_id)?.nome || 'N/A';
                return { ...item, cliente_nome: nomeEmpresa, is_admin_user: false } as UsuarioPonto;
            });
            fetchedUsers.push(...clientUsers);
        }
        
    } else if (ownerId) {
        // Cliente: Busca apenas seus próprios usuários (tbl_usuarios)
        const { data: usersData } = await supabase
            .from('tbl_usuarios')
            .select('*')
            .eq('cliente_id', ownerId)
            .order('nome');
            
        fetchedUsers = (usersData || []).map(u => ({ ...u, cliente_nome: (perfil as ClienteProfile)?.nome || 'Minha Empresa' })) as UsuarioPonto[];
    }
    
    setUsuarios(fetchedUsers);
    setCarregandoDados(false);
  }, [ownerId, isAdmin, usuario?.id, perfil]);

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
      const mappedRegistros = (registros as any[]).map(r => ({
          ...r,
          // O ID do proprietário é o admin_id (se existir) OU o empresa_id
          empresa_id: r.admin_id || r.empresa_id,
      })) as RegistroPonto[];
      setRegistrosDoFuncionario(mappedRegistros);
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

  // 1. Fetch Clients (Admin only)
  useEffect(() => {
    if (!carregandoSessao && isAdmin) {
        fetchClientes();
    }
  }, [carregandoSessao, fetchClientes, isAdmin]);
  
  // 2. Fetch Subordinate Users (Management Mode)
  useEffect(() => {
      if (!carregandoSessao && !isSelfMode && ownerId) {
          if (isAdmin && clientesDisponiveis.length === 0) return; 
          
          buscarUsuarios(clientesDisponiveis);
      } else if (!carregandoSessao && !isSelfMode && !ownerId) {
          setCarregandoDados(false);
      }
  }, [carregandoSessao, isSelfMode, ownerId, isAdmin, clientesDisponiveis, buscarUsuarios]);

  // 3. Handle Self Mode Initialization (sets selected user and stops loading)
  useEffect(() => {
      if (isSelfMode && !carregandoSessao && usuario && perfil) {
          const selfUser = perfil as UsuarioProfile | AdminUsuarioProfile;
          const isFuncionarioAdmin = 'admin_id' in selfUser && !!(selfUser as AdminUsuarioProfile).admin_id;
          
          setFuncionarioSelecionado({
              ...selfUser,
              is_admin_user: isFuncionarioAdmin,
              cliente_nome: isFuncionarioAdmin ? 'Meus Usuários (Admin)' : (perfil as ClienteProfile)?.nome || 'Minha Empresa',
          } as UsuarioPonto);
          
          setCarregandoDados(false);
      }
  }, [isSelfMode, carregandoSessao, usuario, perfil]);
  
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
          buscarUsuarios(clientesDisponiveis);
      }
  };
  
  // Handlers para os diálogos
  const isReadOnlyMode = isSelfMode;
  
  const handleOpenAjustarPonto = (dia: Date) => {
    if (isReadOnlyMode) return;
    const diaString = format(dia, 'yyyy-MM-dd');
    const registros = registrosDoFuncionario.filter(r => format(parseISO(r.horario_registro), 'yyyy-MM-dd') === diaString);
    setAjustarPontoDialog({ open: true, dia, registros });
  };
  
  const handleOpenGerenciarFaltas = (registro: RegistroPonto | null, dia: Date) => {
    if (isReadOnlyMode) return;
    setGerenciarFaltasDialog({ open: true, dia, registro });
  };
  
  const handleOpenGerenciarFolga = (dia: Date, registros: RegistroPonto[]) => {
    if (isReadOnlyMode) return;
    setGerenciarFolgaDialog({ open: true, dia, registros });
  };
  
  const handleDeleteRegistro = () => {
      handleRefresh();
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


  // Verifica se o usuário tem permissão para acessar a página de gestão
  const canAccessManagement = isAdmin || (role === 'Cliente' && (perfil as ClienteProfile)?.permissoes?.folha_ponto === true);
  
  if (!isSelfMode && !canAccessManagement) {
      return (
          <LayoutPrincipal>
              <Card><CardContent className="p-6">Você não tem permissão para acompanhar a folha de ponto de outros usuários.</CardContent></Card>
          </LayoutPrincipal>
      );
  }
  
  // --- Lógica de Impressão ---
  const handlePrint = (orientation: 'portrait' | 'landscape') => {
      if (!funcionarioSelecionado) {
          showError('Selecione um funcionário para imprimir.');
          return;
      }
      
      const printComponent = (
          <FolhaPontoPrint
              empresaNome={funcionarioSelecionado.cliente_nome || ownerName}
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
              logoUrl={logoUrl}
              ownerName={ownerName}
          />
      );

      const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
      printContent(htmlContent, `Folha de Ponto - ${funcionarioSelecionado.nome} - ${format(dataSelecionada, 'MMMM yyyy')}`, orientation);
  };
  
  if (funcionarioSelecionado) {
    const isFuncionarioAdmin = funcionarioSelecionado.is_admin_user;
    const proprietarioIdFuncionario = isFuncionarioAdmin ? funcionarioSelecionado.admin_id : funcionarioSelecionado.cliente_id;
    
    return (
        <LayoutPrincipal>
            <div className="flex items-center mb-6">
                {!isSelfMode && (
                    <Button 
                        onClick={handleBackToUsers} 
                        variant="link" 
                        type="button"
                        className="text-muted-foreground hover:text-primary flex items-center mr-4 p-0 h-auto"
                    >
                        <ChevronLeft className="w-5 h-5" />
                        Voltar para Usuários
                    </Button>
                )}
                <h1 className="text-2xl md:text-3xl font-bold flex items-center">
                    <Clock className="w-6 h-6 mr-2" /> {isSelfMode ? 'Minha Folha de Ponto' : `Folha de Ponto: ${funcionarioSelecionado.nome}`}
                </h1>
            </div>
            
            <div className="flex justify-between items-center mb-4">
                <MonthPicker
                    date={dataSelecionada}
                    setDate={setDataSelecionada}
                />
                
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline">
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
                isReadOnly={isReadOnlyMode}
            />
            
            {/* Diálogos (Apenas no modo de Gestão) */}
            {!isReadOnlyMode && ajustarPontoDialog.dia && (
                <AjustarPontoDialog
                    open={ajustarPontoDialog.open}
                    onOpenChange={(open) => setAjustarPontoDialog({ open, dia: null, registros: [] })}
                    funcionario={{ id: funcionarioSelecionado.id, nome: funcionarioSelecionado.nome, empresa_id: proprietarioIdFuncionario!, isFuncionarioAdmin: isFuncionarioAdmin! }}
                    dia={ajustarPontoDialog.dia}
                    registrosIniciais={ajustarPontoDialog.registros}
                    onSaveComplete={handleRefresh}
                />
            )}
            
            {!isReadOnlyMode && gerenciarFaltasDialog.dia && (
                <GerenciarFaltas
                    open={gerenciarFaltasDialog.open}
                    onOpenChange={(open) => setGerenciarFaltasDialog({ open, dia: null, registro: null })}
                    funcionario={{ id: funcionarioSelecionado.id, nome: funcionarioSelecionado.nome, empresa_id: proprietarioIdFuncionario!, isFuncionarioAdmin: isFuncionarioAdmin! }}
                    dataFalta={gerenciarFaltasDialog.dia}
                    registroInicial={gerenciarFaltasDialog.registro}
                    onFaltaRegistrada={handleRefresh}
                />
            )}
            
            {!isReadOnlyMode && gerenciarFolgaDialog.dia && (
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

  // --- VISUALIZAÇÃO DA LISTA DE USUÁRIOS (Modo Gestão) ---
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
</dyad-file>
</dyad-command>

### Alterações no `src/hooks/use-ferias-clt.ts`

Vou garantir que o `useFeriasCLT` use a tabela correta (`admin_ferias_user` ou `ferias`) e a tabela de registros de ponto correta (`admin_registros_ponto` ou `registros_ponto`).

<dyad-write path="src/hooks/use-ferias-clt.ts" description="Ajustando o hook CLT para rotear a busca de registros de ponto e férias para as tabelas corretas (admin_usuarios vs tbl_usuarios).">
import { useState, useEffect, useCallback } from 'react';
import { FeriasCLTData, PeriodoAquisitivo } from '@/types/ferias';
import { supabase } from '@/integrations/supabase/client';
import { parseISO, addYears, isBefore, startOfDay, endOfDay, isSameDay, isWithinInterval } from 'date-fns';
import { RegistroPonto } from '@/types/ponto';

// Constantes CLT
const DIAS_DIREITO_MAX = 30;
const FALTAS_DIREITO_MAP: Record<number, number> = {
    5: 24, // 6 a 14 faltas = 24 dias
    15: 18, // 15 a 23 faltas = 18 dias
    24: 12, // 24 a 32 faltas = 12 dias
    33: 0,  // Acima de 32 faltas = 0 dias
};

/**
 * Função para calcular os dias de direito com base nas faltas injustificadas.
 */
const calcularDiasDireito = (faltas: number): number => {
    if (faltas <= 5) return DIAS_DIREITO_MAX;
    if (faltas <= 14) return FALTAS_DIREITO_MAP[5];
    if (faltas <= 23) return FALTAS_DIREITO_MAP[15];
    return FALTAS_DIREITO_MAP[33];
};

/**
 * Função principal para calcular todos os períodos aquisitivos e o status atual.
 */
const calcularPeriodos = (
    dataInicioContrato: string,
    mesReferencia: Date,
    registros: RegistroPonto[],
    feriasGozadas: any[]
): { periodos: PeriodoAquisitivo[], periodoAtual: PeriodoAquisitivo | null, ultimaFeriasFim: Date | null, diasDeFeriasDireito: number, faltasInjustificadasAcumuladas: number } => {
    
    const inicioContrato = startOfDay(parseISO(dataInicioContrato));
    const hoje = startOfDay(mesReferencia);
    
    let currentInicio = inicioContrato;
    let periodos: PeriodoAquisitivo[] = [];
    let ultimaFeriasFim: Date | null = null;
    
    // 1. Determinar a última férias gozada
    const gozadas = feriasGozadas.map(f => ({
        inicio: startOfDay(parseISO(f.data_inicio)),
        fim: endOfDay(parseISO(f.data_fim)),
    })).sort((a, b) => b.fim.getTime() - a.fim.getTime());
    
    if (gozadas.length > 0) {
        ultimaFeriasFim = gozadas[0].fim;
    }

    // 2. Iterar e calcular períodos aquisitivos
    while (isBefore(currentInicio, hoje) || isSameDay(currentInicio, hoje)) {
        const fimAquisitivo = addYears(currentInicio, 1);
        const limiteConcessivo = addYears(fimAquisitivo, 1);
        
        // Filtra registros de falta injustificada dentro do período aquisitivo
        const faltasInjustificadas = registros.filter(r => {
            const dataRegistro = startOfDay(parseISO(r.horario_registro));
            // Falta é injustificada se for 'Falta' E não tiver atestado
            const isFaltaInjustificada = r.tipo === 'Falta' && !r.atestado_url;
            
            return isFaltaInjustificada && isWithinInterval(dataRegistro, { start: currentInicio, end: fimAquisitivo });
        }).length;
        
        const diasDireito = calcularDiasDireito(faltasInjustificadas);
        
        let status: PeriodoAquisitivo['status'] = 'Em Andamento';
        
        // Verifica se o período já foi gozado
        const foiGozada = gozadas.some(f => 
            isWithinInterval(f.inicio, { start: currentInicio, end: fimAquisitivo })
        );
        
        if (foiGozada) {
            status = 'Gozada';
        } else if (isBefore(limiteConcessivo, hoje)) {
            // Vencido em dobro (se o limite concessivo passou)
            status = 'Vencida em Dobro';
        } else if (isBefore(fimAquisitivo, hoje)) {
            // Período aquisitivo completo, mas ainda dentro do concessivo
            status = 'Em Aberto';
        }
        
        const periodo: PeriodoAquisitivo = {
            inicio_aquisitivo: currentInicio,
            fim_aquisitivo: fimAquisitivo,
            limite_concessivo: limiteConcessivo,
            dias_direito: diasDireito,
            faltas_injustificadas: faltasInjustificadas,
            status: status,
        };
        
        periodos.push(periodo);
        
        // Se o período aquisitivo finalizou no passado, avança para o próximo
        if (isBefore(fimAquisitivo, hoje)) {
            currentInicio = fimAquisitivo;
        } else {
            break; // Se o período atual ainda não terminou, para o loop
        }
    }
    
    // O período atual é o último período calculado
    const periodoAtual = periodos[periodos.length - 1] || null;
    
    // Faltas acumuladas (apenas do período atual, se estiver em andamento)
    const faltasAcumuladas = periodoAtual?.status === 'Em Andamento' ? periodoAtual.faltas_injustificadas : 0;

    return {
        periodos,
        periodoAtual,
        ultimaFeriasFim,
        diasDeFeriasDireito: periodoAtual?.dias_direito || 0,
        faltasInjustificadasAcumuladas: faltasAcumuladas,
    };
};

/**
 * Função para buscar todos os registros de ponto (faltas/abonos) desde o início do contrato.
 */
const fetchAllAbsenceRecords = async (userId: string, dataInicioContrato: string, isFuncionarioAdmin: boolean): Promise<{ registros: RegistroPonto[], feriasGozadas: any[] }> => {
    const tabelaRegistros = isFuncionarioAdmin ? 'admin_registros_ponto' : 'registros_ponto';
    const tabelaFerias = isFuncionarioAdmin ? 'admin_ferias_user' : 'ferias';
    
    // Busca todos os registros de ponto (Falta/Abono) desde o início do contrato
    const { data: registros, error: regError } = await supabase
        .from(tabelaRegistros)
        .select('id, horario_registro, tipo, atestado_url')
        .eq('funcionario_id', userId)
        .in('tipo', ['Falta', 'Abono'])
        .gte('horario_registro', dataInicioContrato);

    if (regError) {
        console.error('Erro ao buscar registros de ponto para CLT:', regError);
        return { registros: [], feriasGozadas: [] };
    }
    
    // Busca todos os registros de férias gozadas
    const { data: feriasGozadas, error: feriasError } = await supabase
        .from(tabelaFerias)
        .select('data_inicio, data_fim')
        .eq('funcionario_id', userId);
        
    if (feriasError) {
        console.error('Erro ao buscar férias gozadas:', feriasError);
    }

    return { registros: registros as RegistroPonto[], feriasGozadas: feriasGozadas || [] };
};


export const useFeriasCLT = (
    userId: string,
    dataInicioContrato: string | null | undefined,
    mesReferencia: Date,
    isFuncionarioAdmin: boolean // NOVO PARÂMETRO
): FeriasCLTData => {
    const [data, setData] = useState<Omit<FeriasCLTData, 'carregando'>>({
        periodos: [],
        periodoAtual: null,
        ultimaFeriasFim: null,
        diasDeFeriasDireito: 0,
        faltasInjustificadasAcumuladas: 0,
    });
    const [carregando, setCarregando] = useState(true);

    const loadData = useCallback(async () => {
        if (!userId || !dataInicioContrato) {
            setCarregando(false);
            return;
        }

        setCarregando(true);
        try {
            // Passa a flag isFuncionarioAdmin para a função de fetch
            const { registros, feriasGozadas } = await fetchAllAbsenceRecords(userId, dataInicioContrato, isFuncionarioAdmin);
            
            const calculated = calcularPeriodos(dataInicioContrato, mesReferencia, registros, feriasGozadas);
            
            setData(calculated);
        } catch (error) {
            console.error('Erro ao carregar dados de férias CLT:', error);
            setData({
                periodos: [],
                periodoAtual: null,
                ultimaFeriasFim: null,
                diasDeFeriasDireito: 0,
                faltasInjustificadasAcumuladas: 0,
            });
        } finally {
            setCarregando(false);
        }
    }, [userId, dataInicioContrato, mesReferencia, isFuncionarioAdmin]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    return {
        ...data,
        carregando,
    };
};