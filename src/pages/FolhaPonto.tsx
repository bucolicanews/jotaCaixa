import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Filter, Clock, Users, Building2, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format, startOfMonth, endOfMonth, parseISO, isSameDay, eachDayOfInterval, isWithinInterval, getDay, differenceInMinutes } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DetalheFolhaPonto from '@/components/DetalheFolhaPonto';
import { MonthPicker } from '@/components/MonthPicker';
import GerenciarFaltas from '@/components/GerenciarFaltas';
import AjustarPontoDialog from '@/components/AjustarPontoDialog';
import { RegistroPonto, Ferias } from '@/types/ponto';
import GerenciarFolgaTrabalhada from '@/components/GerenciarFolgaTrabalhada';
import { Button } from '@/components/ui/button';
import { usePrint } from '@/hooks/use-print';
import FolhaPontoPrint from '@/components/FolhaPontoPrint';
import ReactDOMServer from 'react-dom/server'; // Importação corrigida

interface FuncionarioComDados extends UsuarioProfile {
    id: string;
    nome: string;
    email: string;
    salario: number;
    horas_mensais: number;
    dias_folga_fixos: string[] | null;
    folga_domingo_obrigatoria: boolean | null;
}

interface ClienteSimples {
    id: string;
    nome: string;
}

// Constantes CLT (Simplificadas)
const JORNADA_MENSAL_PADRAO = 220; // Horas mensais padrão CLT

const FolhaPonto: React.FC = () => {
  const { role, perfil, carregando } = useSessao();
  const { printContent } = usePrint();
  const [dataSelecionada, setDataSelecionada] = useState<Date>(startOfMonth(new Date()));
  const [carregandoDados, setCarregandoDados] = useState(false);
  
  // Estados para Admin
  const [clientes, setClientes] = useState<ClienteSimples[]>([]);
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string | null>(null);
  const [empresaNome, setEmpresaNome] = useState<string>('N/A');
  
  // Estados para Funcionários e Registros
  const [funcionarios, setFuncionarios] = useState<FuncionarioComDados[]>([]);
  const [funcionarioSelecionadoId, setFuncionarioSelecionadoId] = useState<string | null>(null);
  const [registrosDoFuncionario, setRegistrosDoFuncionario] = useState<RegistroPonto[]>([]);
  const [feriasDoFuncionario, setFeriasDoFuncionario] = useState<Ferias[]>([]);
  
  // Estado para Gerenciar Faltas/Abonos
  const [faltaDialogOpen, setFaltaDialogOpen] = useState(false);
  const [diaFaltaSelecionado, setDiaFaltaSelecionado] = useState<Date | null>(null);
  const [registroParaEdicao, setRegistroParaEdicao] = useState<RegistroPonto | null>(null); 

  // Estado para Ajustar Ponto (Entrada/Saída)
  const [ajustarDialogOpen, setAjustarDialogOpen] = useState(false);
  const [registrosParaAjuste, setRegistrosParaAjuste] = useState<RegistroPonto[]>([]);
  const [diaParaAjuste, setDiaParaAjuste] = useState<Date | null>(null);
  
  // Estado para Gerenciar Folga Trabalhada
  const [folgaTrabalhadaDialogOpen, setFolgaTrabalhadaDialogOpen] = useState(false);
  const [diaFolgaTrabalhada, setDiaFolgaTrabalhada] = useState<Date | null>(null);
  const [registrosFolgaTrabalhada, setRegistrosFolgaTrabalhada] = useState<RegistroPonto[]>([]);


  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente' && (perfil as ClienteProfile)?.aprovado;
  
  const empresaIdParaFiltro = isAdmin ? clienteSelecionadoId : (isCliente ? perfil?.id : null);

  const fetchClientes = useCallback(async () => {
    if (!isAdmin) return;
    
    setCarregandoDados(true);
    const { data, error } = await supabase
        .from('tbl_clientes')
        .select('id, nome')
        .eq('aprovado', true)
        .order('nome');

    if (error) {
        showError('Erro ao carregar lista de clientes: ' + error.message);
        setClientes([]);
    } else {
        const clientData = data as ClienteSimples[];
        setClientes(clientData);
        if (clientData.length > 0 && !clienteSelecionadoId) {
            setClienteSelecionadoId(clientData[0].id);
        }
    }
    setCarregandoDados(false);
  }, [isAdmin, clienteSelecionadoId]);
  
  // Atualiza o nome da empresa
  useEffect(() => {
    if (isCliente) {
        setEmpresaNome((perfil as ClienteProfile).nome);
    } else if (isAdmin && clienteSelecionadoId && clientes.length > 0) {
        const selectedClient = clientes.find(c => c.id === clienteSelecionadoId);
        setEmpresaNome(selectedClient?.nome || 'N/A');
    } else if (isAdmin && !clienteSelecionadoId) {
        setEmpresaNome('Selecione a Empresa');
    }
  }, [isCliente, isAdmin, perfil, clienteSelecionadoId, clientes]);


  const fetchFuncionarios = useCallback(async (empresaId: string) => {
    setCarregandoDados(true);
    
    let query = supabase
        .from('tbl_usuarios')
        .select('id, nome, email, salario, horas_mensais, dias_folga_fixos, folga_domingo_obrigatoria')
        .eq('cliente_id', empresaId)
        .order('nome');

    const { data, error } = await query;

    if (error) {
        showError('Erro ao carregar lista de funcionários: ' + error.message);
        setFuncionarios([]);
    } else {
        const funcs = data as FuncionarioComDados[];
        setFuncionarios(funcs);
        if (!funcs.some(f => f.id === funcionarioSelecionadoId) && funcs.length > 0) {
            setFuncionarioSelecionadoId(funcs[0].id);
        } else if (funcs.length === 0) {
            setFuncionarioSelecionadoId(null);
        }
    }
    setCarregandoDados(false);
  }, [funcionarioSelecionadoId]);
  
  const fetchFerias = useCallback(async (funcionarioId: string, data: Date) => {
    const inicioMes = format(startOfMonth(data), 'yyyy-MM-dd');
    const fimMes = format(endOfMonth(data), 'yyyy-MM-dd');
    
    const { data: feriasData, error } = await supabase
        .from('ferias')
        .select('*')
        .eq('funcionario_id', funcionarioId)
        .lte('data_inicio', fimMes)
        .gte('data_fim', inicioMes);

    if (error) {
        showError('Erro ao carregar férias: ' + error.message);
        setFeriasDoFuncionario([]);
    } else {
        setFeriasDoFuncionario(feriasData as Ferias[]);
    }
  }, []);

  const fetchRegistros = useCallback(async (funcionarioId: string, data: Date) => {
    setCarregandoDados(true);
    const inicioMes = format(startOfMonth(data), 'yyyy-MM-dd');
    const fimMes = format(endOfMonth(data), 'yyyy-MM-dd');

    const { data: registros, error } = await supabase
      .from('registros_ponto')
      .select('id, funcionario_id, empresa_id, horario_registro, tipo, maps_url, selfie_url, atestado_url, observacao')
      .eq('funcionario_id', funcionarioId)
      .gte('horario_registro', inicioMes)
      .lte('horario_registro', fimMes)
      .order('horario_registro', { ascending: true });

    if (error) {
      showError('Erro ao carregar registros de ponto: ' + error.message);
      setRegistrosDoFuncionario([]);
    } else {
      setRegistrosDoFuncionario(registros as RegistroPonto[]);
    }
    setCarregandoDados(false);
  }, []);

  // Efeito 1: Carregar Clientes (apenas Admin)
  useEffect(() => {
    if (!carregando && isAdmin) {
      fetchClientes();
    }
  }, [carregando, isAdmin, fetchClientes]);

  // Efeito 2: Carregar Funcionários (depende do Cliente selecionado ou do próprio Cliente logado)
  useEffect(() => {
    if (!carregando && empresaIdParaFiltro) {
        fetchFuncionarios(empresaIdParaFiltro);
    } else if (!carregando && isAdmin && !clienteSelecionadoId) {
        setFuncionarios([]);
        setFuncionarioSelecionadoId(null);
    }
  }, [carregando, empresaIdParaFiltro, isAdmin, clienteSelecionadoId, fetchFuncionarios]);

  // Efeito 3: Carregar Registros e Férias (depende do Funcionário e da Data)
  useEffect(() => {
    if (funcionarioSelecionadoId) {
      fetchRegistros(funcionarioSelecionadoId, dataSelecionada);
      fetchFerias(funcionarioSelecionadoId, dataSelecionada);
    } else {
        setRegistrosDoFuncionario([]);
        setFeriasDoFuncionario([]);
    }
  }, [funcionarioSelecionadoId, dataSelecionada, fetchRegistros, fetchFerias]);
  
  // --- Lógica de Gerenciamento ---
  
  const funcionarioDetalhe = funcionarios.find(f => f.id === funcionarioSelecionadoId);
  
  const handleFaltaRegistrada = async () => {
    // Re-busca os registros após registrar/editar/deletar a falta/ajuste/compensação
    if (funcionarioSelecionadoId) {
        await fetchRegistros(funcionarioSelecionadoId, dataSelecionada);
        await fetchFerias(funcionarioSelecionadoId, dataSelecionada);
    }
    setRegistroParaEdicao(null);
  };
  
  const handleEditFaltaAbono = (registro: RegistroPonto | null, dia: Date) => {
    if (!funcionarioDetalhe) return;
    setRegistroParaEdicao(registro);
    setDiaFaltaSelecionado(dia);
    setFaltaDialogOpen(true);
  };
  
  const handleAjustePonto = (dia: Date) => {
    // Filtra todos os registros (Entrada/Saída) que pertencem ao dia
    const registrosDoDia = registrosDoFuncionario.filter(r => 
        (r.tipo === 'Entrada' || r.tipo === 'Saida') && isSameDay(parseISO(r.horario_registro), dia)
    );
    
    setRegistrosParaAjuste(registrosDoDia);
    setDiaParaAjuste(dia);
    setAjustarDialogOpen(true);
  };
  
  const handleManageWorkedDayOff = (dia: Date, registros: RegistroPonto[]) => {
    if (!funcionarioDetalhe) return;
    setDiaFolgaTrabalhada(dia);
    setRegistrosFolgaTrabalhada(registros);
    setFolgaTrabalhadaDialogOpen(true);
  };
  
  // --- Lógica de Impressão ---
  
  const handlePrint = () => {
    if (!funcionarioDetalhe || !empresaIdParaFiltro) {
        showError('Selecione um funcionário e uma empresa para imprimir.');
        return;
    }
    
    // --- DUPLICAÇÃO DA LÓGICA DE CÁLCULO (Necessário para SSR/Impressão) ---
    
    const DAY_MAP: Record<number, string> = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };
    
    let totalMinutosTrabalhados = 0;
    let totalMinutosExtras100 = 0;
    
    const registrosPorDia: Record<string, RegistroPonto[]> = {};
    const registrosOrdenados = [...registrosDoFuncionario].sort((a, b) => parseISO(a.horario_registro).getTime() - parseISO(b.horario_registro).getTime());
    
    for (const registro of registrosOrdenados) {
        const horario = parseISO(registro.horario_registro);
        const dia = format(horario, 'yyyy-MM-dd');
        if (!registrosPorDia[dia]) registrosPorDia[dia] = [];
        registrosPorDia[dia].push(registro);
    }
    
    const inicioMes = startOfMonth(dataSelecionada);
    const fimMes = endOfMonth(dataSelecionada);
    const hoje = new Date();
    const todosOsDiasDoMes = eachDayOfInterval({ start: inicioMes, end: fimMes });
    
    const diasProcessados: Record<string, any> = {}; // Usando 'any' para simplificar a tipagem duplicada
    
    for (const data of todosOsDiasDoMes) {
        const diaString = format(data, 'yyyy-MM-dd');
        const registrosDoDia = registrosPorDia[diaString] || [];
        
        let minutosDia = 0;
        let entrada: Date | null = null;
        let isFalta = false;
        let isAbono = false;
        let minutosAbonados = 0; 
        let hasPontoRecords = false;
        let decisionRecord: 'Compensacao' | 'Extra100' | null = null;
        let isCompensacaoAbono = false;
        
        const diaDaSemana = DAY_MAP[getDay(data)];
        let isFolgaFixa = funcionarioDetalhe.dias_folga_fixos?.includes(diaDaSemana) || false;
        if ((funcionarioDetalhe.folga_domingo_obrigatoria ?? true) && diaDaSemana === 'Sunday') isFolgaFixa = true;
        
        const isFerias = feriasDoFuncionario.some(f => {
            const start = parseISO(f.data_inicio + 'T00:00:00');
            const end = parseISO(f.data_fim + 'T23:59:59');
            return isWithinInterval(data, { start, end });
        });

        for (const registro of registrosDoDia) {
            if (registro.tipo === 'Falta') { isFalta = true; break; }
            if (registro.tipo === 'Abono') {
                isAbono = true;
                if (registro.observacao?.includes('Compensação de folga trabalhada')) {
                    isCompensacaoAbono = true;
                } else {
                    const horasAbonadas = parseInt(registro.observacao?.match(/(\d+)h/)?.[1] || '8'); 
                    minutosAbonados = horasAbonadas * 60;
                    minutosDia = minutosAbonados;
                }
                break; 
            }
            if (registro.tipo === 'Compensacao') decisionRecord = 'Compensacao';
            if (registro.tipo === 'Extra100') decisionRecord = 'Extra100';
            
            if (registro.tipo === 'Entrada' || registro.tipo === 'Saida') {
                hasPontoRecords = true;
                const horario = parseISO(registro.horario_registro);
                if (registro.tipo === 'Entrada') {
                    entrada = horario;
                } else if (registro.tipo === 'Saida' && entrada && isSameDay(horario, entrada)) {
                    minutosDia += differenceInMinutes(horario, entrada);
                    entrada = null;
                }
            }
        }
        
        if (entrada && isSameDay(data, hoje)) {
            minutosDia += differenceInMinutes(hoje, entrada);
        }
        
        let minutosTrabalhadosFolga = 0;
        let minutosParaAcumular = minutosDia;
        let needsManagement = false;
        
        if (isFolgaFixa && hasPontoRecords && !isFerias) {
            minutosTrabalhadosFolga = minutosDia;
            if (!decisionRecord) {
                needsManagement = true;
                minutosParaAcumular = 0;
            } else if (decisionRecord === 'Extra100') {
                totalMinutosExtras100 += minutosTrabalhadosFolga;
                minutosParaAcumular = 0;
            } else if (decisionRecord === 'Compensacao') {
                minutosParaAcumular = 0;
            }
        }
        
        if (!isFolgaFixa && !isFalta && !isFerias && !isCompensacaoAbono) {
            totalMinutosTrabalhados += minutosParaAcumular;
        } else if (isAbono && !isCompensacaoAbono) {
            totalMinutosTrabalhados += minutosParaAcumular;
        }
        
        if (isFalta) minutosDia = 0;

        diasProcessados[diaString] = {
            minutos: minutosDia,
            registros: registrosDoDia,
            isFalta, isAbono, isFolgaFixa, isFerias, hasPontoRecords, decisionRecord, needsManagement, minutosAbonados, minutosTrabalhadosFolga, isCompensacaoAbono,
        };
    }
    
    const jornadaMensalMinutos = (funcionarioDetalhe.horas_mensais || JORNADA_MENSAL_PADRAO) * 60;
    const minutosDiferenca = jornadaMensalMinutos - totalMinutosTrabalhados; 
    
    // --- FIM DA DUPLICAÇÃO DA LÓGICA DE CÁLCULO ---

    const printComponent = (
        <FolhaPontoPrint
            empresaNome={empresaNome}
            funcionario={{
                ...funcionarioDetalhe,
                salario: funcionarioDetalhe.salario || 0,
                horas_mensais: funcionarioDetalhe.horas_mensais || JORNADA_MENSAL_PADRAO,
                dias_folga_fixos: funcionarioDetalhe.dias_folga_fixos || [],
                folga_domingo_obrigatoria: funcionarioDetalhe.folga_domingo_obrigatoria ?? true,
                ferias: feriasDoFuncionario,
                registros: registrosDoFuncionario,
            }}
            mes={dataSelecionada}
            diasProcessados={diasProcessados}
            totalMinutosTrabalhados={totalMinutosTrabalhados} // Passa o total acumulado
            minutosDiferenca={minutosDiferenca}
        />
    );

    const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
    printContent(htmlContent, `Folha de Ponto - ${funcionarioDetalhe.nome} - ${format(dataSelecionada, 'MM/yyyy')}`);
  };


  if (carregando) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  if (!isAdmin && !isCliente) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para acessar a folha de ponto.</p></CardContent></Card></LayoutPrincipal>;
  }
  
  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <Clock className="w-6 h-6 mr-2" /> Acompanhar Folha de Ponto
        </h1>
        <Button 
            onClick={handlePrint} 
            disabled={!funcionarioDetalhe || carregandoDados}
            className="w-full sm:w-auto"
        >
            <Printer className="w-4 h-4 mr-2" /> Imprimir Folha
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0 pb-2">
          <CardTitle className="text-lg font-medium flex items-center">
            <Filter className="w-4 h-4 mr-2" /> Filtros
          </CardTitle>
          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            
            {isAdmin && (
                <Select 
                    value={clienteSelecionadoId || ''} 
                    onValueChange={setClienteSelecionadoId}
                    disabled={carregandoDados || clientes.length === 0}
                >
                    <SelectTrigger className="w-full sm:w-[200px]">
                        <Building2 className="w-4 h-4 mr-2" />
                        <SelectValue placeholder={carregandoDados ? "Carregando Clientes..." : "Selecione a Empresa"} />
                    </SelectTrigger>
                    <SelectContent>
                        {clientes.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}

            <Select 
                value={funcionarioSelecionadoId || ''} 
                onValueChange={setFuncionarioSelecionadoId}
                disabled={carregandoDados || funcionarios.length === 0 || (isAdmin && !clienteSelecionadoId)}
            >
                <SelectTrigger className="w-full sm:w-[200px]">
                    <Users className="w-4 h-4 mr-2" />
                    <SelectValue placeholder={carregandoDados ? "Carregando Funcionários..." : "Selecione o Funcionário"} />
                </SelectTrigger>
                <SelectContent>
                    {funcionarios.map(f => (
                        <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            
            <MonthPicker
              date={dataSelecionada}
              setDate={setDataSelecionada}
              disabled={carregandoDados}
            />
          </div>
        </CardHeader>
      </Card>
      
      {funcionarioDetalhe && (
        <DetalheFolhaPonto 
            funcionario={{
                id: funcionarioDetalhe.id,
                nome: funcionarioDetalhe.nome,
                salario: funcionarioDetalhe.salario || 0,
                horas_mensais: funcionarioDetalhe.horas_mensais || JORNADA_MENSAL_PADRAO,
                registros: registrosDoFuncionario,
                dias_folga_fixos: funcionarioDetalhe.dias_folga_fixos || [],
                folga_domingo_obrigatoria: funcionarioDetalhe.folga_domingo_obrigatoria ?? true,
                ferias: feriasDoFuncionario,
            }}
            mes={dataSelecionada}
            onEditRegistro={handleAjustePonto}
            onEditFaltaAbono={handleEditFaltaAbono}
            onDeleteRegistro={handleFaltaRegistrada}
            onManageWorkedDayOff={handleManageWorkedDayOff}
        />
      )}

      {!funcionarioDetalhe && !carregandoDados && (
        <Card>
            <CardContent className="text-center py-8 text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2" />
                {isAdmin && !clienteSelecionadoId ? 'Selecione uma empresa para carregar os funcionários.' : 'Selecione um funcionário para visualizar a folha de ponto.'}
            </CardContent>
        </Card>
      )}
      
      {/* Modal de Gerenciamento de Faltas/Abonos */}
      {funcionarioDetalhe && diaFaltaSelecionado && (
        <GerenciarFaltas
            open={faltaDialogOpen}
            onOpenChange={setFaltaDialogOpen}
            funcionario={{ 
                id: funcionarioDetalhe.id, 
                nome: funcionarioDetalhe.nome, 
                empresa_id: empresaIdParaFiltro! 
            }}
            dataFalta={diaFaltaSelecionado}
            registroInicial={registroParaEdicao}
            onFaltaRegistrada={handleFaltaRegistrada}
        />
      )}
      
      {/* Modal de Ajuste de Ponto (Entrada/Saída) */}
      {funcionarioDetalhe && diaParaAjuste && (
        <AjustarPontoDialog
            open={ajustarDialogOpen}
            onOpenChange={setAjustarDialogOpen}
            funcionario={{ 
                id: funcionarioDetalhe.id, 
                nome: funcionarioDetalhe.nome, 
                empresa_id: empresaIdParaFiltro! 
            }}
            dia={diaParaAjuste}
            registrosIniciais={registrosParaAjuste}
            onSaveComplete={handleFaltaRegistrada}
        />
      )}
      
      {/* Modal de Gerenciamento de Folga Trabalhada */}
      {funcionarioDetalhe && diaFolgaTrabalhada && (
        <GerenciarFolgaTrabalhada
            open={folgaTrabalhadaDialogOpen}
            onOpenChange={setFolgaTrabalhadaDialogOpen}
            funcionario={{ 
                id: funcionarioDetalhe.id, 
                nome: funcionarioDetalhe.nome, 
                empresa_id: empresaIdParaFiltro! 
            }}
            dia={diaFolgaTrabalhada}
            registrosDoDia={registrosFolgaTrabalhada}
            onSaveComplete={handleFaltaRegistrada}
        />
      )}
    </LayoutPrincipal>
  );
};

export default FolhaPonto;