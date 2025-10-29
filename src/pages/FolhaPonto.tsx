import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Calendar, Filter, Clock, Users, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DetalheFolhaPonto from '@/components/DetalheFolhaPonto';

interface RegistroPonto {
  id: string;
  funcionario_id: string;
  empresa_id: string;
  horario_registro: string; // ISO string
  tipo: 'Entrada' | 'Saida';
  maps_url: string;
  selfie_url: string; // Adicionado
}

interface FuncionarioComDados extends UsuarioProfile {
    id: string;
    nome: string;
    email: string;
    salario: number;
    horas_mensais: number;
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

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente' && (perfil as ClienteProfile)?.aprovado;
  
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
        // Se for Admin, seleciona o primeiro cliente por padrão
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
        .select('id, nome, email, salario, horas_mensais')
        .eq('cliente_id', empresaId)
        .order('nome');

    const { data, error } = await query;

    if (error) {
        showError('Erro ao carregar lista de funcionários: ' + error.message);
        setFuncionarios([]);
    } else {
        const funcs = data as FuncionarioComDados[];
        setFuncionarios(funcs);
        // Mantém o funcionário selecionado se ele ainda estiver na lista, senão seleciona o primeiro
        if (!funcs.some(f => f.id === funcionarioSelecionadoId) && funcs.length > 0) {
            setFuncionarioSelecionadoId(funcs[0].id);
        } else if (funcs.length === 0) {
            setFuncionarioSelecionadoId(null);
        }
    }
    setCarregandoDados(false);
  }, [funcionarioSelecionadoId]);

  const fetchRegistros = useCallback(async (funcionarioId: string, data: Date) => {
    setCarregandoDados(true);
    const inicioMes = format(startOfMonth(data), 'yyyy-MM-dd');
    const fimMes = format(endOfMonth(data), 'yyyy-MM-dd');

    const { data: registros, error } = await supabase
      .from('registros_ponto')
      .select('*, selfie_url')
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
    if (!carregando) {
        if (isCliente && perfil?.id) {
            fetchFuncionarios(perfil.id);
        } else if (isAdmin && clienteSelecionadoId) {
            fetchFuncionarios(clienteSelecionadoId);
        } else if (isAdmin && clientes.length === 0) {
            setFuncionarios([]);
            setFuncionarioSelecionadoId(null);
        }
    }
  }, [carregando, isCliente, isAdmin, perfil, clienteSelecionadoId, fetchFuncionarios, clientes.length]);

  // Efeito 3: Carregar Registros (depende do Funcionário e da Data)
  useEffect(() => {
    if (funcionarioSelecionadoId) {
      fetchRegistros(funcionarioSelecionadoId, dataSelecionada);
    } else {
        setRegistrosDoFuncionario([]);
    }
  }, [funcionarioSelecionadoId, dataSelecionada, fetchRegistros]);

  if (carregando) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  if (!isAdmin && !isCliente) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para acessar a folha de ponto.</p></CardContent></Card></LayoutPrincipal>;
  }
  
  const funcionarioDetalhe = funcionarios.find(f => f.id === funcionarioSelecionadoId);

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
            
            {/* Se for Admin, mostra o seletor de Cliente */}
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

            {/* Seletor de Funcionário */}
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
            
            {/* Seletor de Mês */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full sm:w-[200px] justify-start text-left font-normal",
                    !dataSelecionada && "text-muted-foreground"
                  )}
                  disabled={carregandoDados}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {dataSelecionada ? (
                    format(dataSelecionada, "MMMM yyyy", { locale: ptBR })
                  ) : (
                    <span>Selecione o mês</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  captionLayout="dropdown-buttons"
                  selected={dataSelecionada}
                  onSelect={(date) => {
                    if (date) setDataSelecionada(startOfMonth(date));
                  }}
                  fromYear={2020}
                  toYear={new Date().getFullYear()}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
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
            }}
            mes={dataSelecionada}
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
    </LayoutPrincipal>
  );
};

export default FolhaPonto;