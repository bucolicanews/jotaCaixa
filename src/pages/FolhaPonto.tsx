import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Filter, Clock, Users, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format, startOfMonth, endOfMonth, parseISO, isSameDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DetalheFolhaPonto from '@/components/DetalheFolhaPonto';
import { MonthPicker } from '@/components/MonthPicker';
import GerenciarFaltas from '@/components/GerenciarFaltas';
import AjustarPontoDialog from '@/components/AjustarPontoDialog'; // Importando o novo componente
import { RegistroPonto, Ferias } from '@/types/ponto';

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

const FolhaPonto: React.FC = () => {
  const { role, perfil, carregando } = useSessao();
  const [dataSelecionada, setDataSelecionada] = useState<Date>(startOfMonth(new Date()));
  const [carregandoDados, setCarregandoDados] = useState(false);
  
  // Estados para Admin
  const [clientes, setClientes] = useState<ClienteSimples[]>([]);
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string | null>(null);
  
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
    // Re-busca os registros após registrar/editar/deletar a falta
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

  if (carregando) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  if (!isAdmin && !isCliente) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para acessar a folha de ponto.</p></CardContent></Card></LayoutPrincipal>;
  }
  
  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <Clock className="w-6 h-6 mr-2" /> Acompanhar Folha de Ponto
      </h1>

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
                horas_mensais: funcionarioDetalhe.horas_mensais || 220,
                registros: registrosDoFuncionario,
                dias_folga_fixos: funcionarioDetalhe.dias_folga_fixos || [],
                folga_domingo_obrigatoria: funcionarioDetalhe.folga_domingo_obrigatoria ?? true,
                ferias: feriasDoFuncionario,
            }}
            mes={dataSelecionada}
            onEditRegistro={handleAjustePonto} // Ajuste de Ponto (Entrada/Saída)
            onEditFaltaAbono={handleEditFaltaAbono} // Edição de Falta/Abono
            onDeleteRegistro={handleFaltaRegistrada}
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
            onSaveComplete={handleFaltaRegistrada} // Re-busca os dados após o ajuste
        />
      )}
    </LayoutPrincipal>
  );
};

export default FolhaPonto;