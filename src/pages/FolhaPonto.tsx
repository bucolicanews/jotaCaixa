import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Calendar, Filter, Clock, Users } from 'lucide-react';
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

const FolhaPonto: React.FC = () => {
  const { role, perfil, carregando } = useSessao();
  const [dataSelecionada, setDataSelecionada] = useState<Date>(startOfMonth(new Date()));
  const [carregandoDados, setCarregandoDados] = useState(false);
  const [funcionarios, setFuncionarios] = useState<FuncionarioComDados[]>([]);
  const [funcionarioSelecionadoId, setFuncionarioSelecionadoId] = useState<string | null>(null);
  const [registrosDoFuncionario, setRegistrosDoFuncionario] = useState<RegistroPonto[]>([]);

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente' && (perfil as ClienteProfile)?.aprovado;
  const ownerId = isAdmin ? perfil?.id : (isCliente ? perfil?.id : null);

  const fetchFuncionarios = useCallback(async () => {
    if (!ownerId) return;

    setCarregandoDados(true);
    
    let query = supabase
        .from('tbl_usuarios')
        .select('id, nome, email, salario, horas_mensais');

    if (isCliente) {
        query = query.eq('cliente_id', ownerId);
    }
    // Se for Admin, ele vê todos os usuários (incluindo clientes que não são admins)

    const { data, error } = await query;

    if (error) {
        showError('Erro ao carregar lista de funcionários: ' + error.message);
        setFuncionarios([]);
    } else {
        const funcs = data as FuncionarioComDados[];
        setFuncionarios(funcs);
        if (funcs.length > 0 && !funcionarioSelecionadoId) {
            setFuncionarioSelecionadoId(funcs[0].id);
        }
    }
    setCarregandoDados(false);
  }, [ownerId, isCliente, funcionarioSelecionadoId]);

  const fetchRegistros = useCallback(async (funcionarioId: string, data: Date) => {
    setCarregandoDados(true);
    const inicioMes = format(startOfMonth(data), 'yyyy-MM-dd');
    const fimMes = format(endOfMonth(data), 'yyyy-MM-dd');

    const { data: registros, error } = await supabase
      .from('registros_ponto')
      .select('*, selfie_url') // Incluindo selfie_url
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

  useEffect(() => {
    if (!carregando && (isAdmin || isCliente)) {
      fetchFuncionarios();
    }
  }, [carregando, isAdmin, isCliente, fetchFuncionarios]);

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
            <Select 
                value={funcionarioSelecionadoId || ''} 
                onValueChange={setFuncionarioSelecionadoId}
                disabled={carregandoDados || funcionarios.length === 0}
            >
                <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder={carregandoDados ? "Carregando..." : "Selecione o Funcionário"} />
                </SelectTrigger>
                <SelectContent>
                    {funcionarios.map(f => (
                        <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
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
                Selecione um funcionário para visualizar a folha de ponto.
            </CardContent>
        </Card>
      )}
    </LayoutPrincipal>
  );
};

export default FolhaPonto;