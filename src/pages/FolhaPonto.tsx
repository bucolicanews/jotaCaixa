import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Calendar, Filter, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format, startOfMonth, endOfMonth, parseISO, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

interface RegistroPonto {
  id: string;
  funcionario_id: string;
  empresa_id: string;
  horario_registro: string; // ISO string
  tipo: 'Entrada' | 'Saida';
  maps_url: string;
  tbl_usuarios: {
    nome: string;
    email: string;
  } | null;
}

interface FuncionarioResumo {
  nome: string;
  email: string;
  totalMinutos: number;
  registros: RegistroPonto[];
}

const FolhaPonto: React.FC = () => {
  const { role, carregando } = useSessao();
  const [dataSelecionada, setDataSelecionada] = useState<Date>(startOfMonth(new Date()));
  const [carregandoDados, setCarregandoDados] = useState(false);
  const [resumoFuncionarios, setResumoFuncionarios] = useState<FuncionarioResumo[]>([]);

  const isAdmin = role === 'Admin';

  const calcularHorasTrabalhadas = (registros: RegistroPonto[]): number => {
    let totalMinutos = 0;
    let entrada: Date | null = null;

    // Ordena os registros por horário
    registros.sort((a, b) => parseISO(a.horario_registro).getTime() - parseISO(b.horario_registro).getTime());

    for (const registro of registros) {
      const horario = parseISO(registro.horario_registro);
      if (registro.tipo === 'Entrada') {
        entrada = horario;
      } else if (registro.tipo === 'Saida' && entrada) {
        totalMinutos += differenceInMinutes(horario, entrada);
        entrada = null; // Reseta a entrada após uma saída
      }
    }
    return totalMinutos;
  };

  const buscarRegistros = useCallback(async (data: Date) => {
    if (!isAdmin) return;

    setCarregandoDados(true);
    const inicioMes = format(startOfMonth(data), 'yyyy-MM-dd');
    const fimMes = format(endOfMonth(data), 'yyyy-MM-dd');

    const { data: registros, error } = await supabase
      .from('registros_ponto')
      .select(`
        *,
        tbl_usuarios (
          nome,
          email
        )
      `)
      .gte('horario_registro', inicioMes)
      .lte('horario_registro', fimMes)
      .order('horario_registro', { ascending: true });

    if (error) {
      showError('Erro ao carregar registros de ponto: ' + error.message);
      setResumoFuncionarios([]);
      setCarregandoDados(false);
      return;
    }

    // Agrupar por funcionário
    const agrupado = (registros as RegistroPonto[]).reduce((acc, registro) => {
      const id = registro.funcionario_id;
      if (!acc[id]) {
        acc[id] = {
          nome: registro.tbl_usuarios?.nome || 'Desconhecido',
          email: registro.tbl_usuarios?.email || 'N/A',
          totalMinutos: 0,
          registros: [],
        };
      }
      acc[id].registros.push(registro);
      return acc;
    }, {} as Record<string, FuncionarioResumo>);

    // Calcular total de horas
    const resumoFinal = Object.values(agrupado).map(func => ({
      ...func,
      totalMinutos: calcularHorasTrabalhadas(func.registros),
    }));

    setResumoFuncionarios(resumoFinal);
    setCarregandoDados(false);
  }, [isAdmin]);

  useEffect(() => {
    if (!carregando && isAdmin) {
      buscarRegistros(dataSelecionada);
    }
  }, [carregando, isAdmin, dataSelecionada, buscarRegistros]);

  if (carregando) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  if (!isAdmin) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Apenas administradores podem acessar a folha de ponto.</p></CardContent></Card></LayoutPrincipal>;
  }

  const formatarHoras = (minutos: number): string => {
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    return `${horas}h ${mins}m`;
  };

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <Clock className="w-6 h-6 mr-2" /> Acompanhar Folha de Ponto
      </h1>

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-medium flex items-center">
            <Filter className="w-4 h-4 mr-2" /> Filtrar por Mês
          </CardTitle>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-[240px] justify-start text-left font-normal",
                  !dataSelecionada && "text-muted-foreground"
                )}
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
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Resumo de Horas Trabalhadas</CardTitle>
        </CardHeader>
        <CardContent>
          {carregandoDados ? (
            <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Total de Horas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resumoFuncionarios.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                        Nenhum registro de ponto encontrado para este mês.
                      </TableCell>
                    </TableRow>
                  ) : (
                    resumoFuncionarios.map((func) => (
                      <TableRow key={func.email}>
                        <TableCell className="font-medium">{func.nome}</TableCell>
                        <TableCell>{func.email}</TableCell>
                        <TableCell className="text-right font-bold">{formatarHoras(func.totalMinutos)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default FolhaPonto;