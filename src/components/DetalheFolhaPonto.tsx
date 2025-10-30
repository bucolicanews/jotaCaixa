import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, DollarSign, MapPin, Camera, FileText, AlertTriangle, Trash2, Edit, CalendarX } from 'lucide-react';
import { format, parseISO, differenceInMinutes, isWeekend, isSameDay, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from './ui/button';
import { useSessao } from '@/hooks/use-sessao';
import { RegistroPonto } from '@/types/ponto';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';

interface FuncionarioDetalhe {
  id: string;
  nome: string;
  salario: number;
  horas_mensais: number;
  registros: RegistroPonto[];
}

interface DetalheFolhaPontoProps {
  funcionario: FuncionarioDetalhe;
  mes: Date;
  onEditRegistro: (dia: Date) => void; // Para Ajuste de Ponto (Entrada/Saída)
  onEditFaltaAbono: (registro: RegistroPonto | null, dia: Date) => void; // Para Edição de Falta/Abono
  onDeleteRegistro: () => void; 
}

// Constantes CLT (Simplificadas)
const JORNADA_MENSAL_PADRAO = 220; // Horas mensais padrão CLT
const PERCENTUAL_EXTRA_NORMAL = 0.5; // 50% de adicional
const PERCENTUAL_EXTRA_FERIADO_FIMSEMANA = 1.0; // 100% de adicional

const DetalheFolhaPonto: React.FC<DetalheFolhaPontoProps> = ({ funcionario, mes, onEditRegistro, onEditFaltaAbono, onDeleteRegistro }) => {
  const { salario, horas_mensais, registros } = funcionario;
  const { role } = useSessao();
  const [selfieModalOpen, setSelfieModalOpen] = useState(false);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  
  const valorHoraNormal = salario / (horas_mensais || JORNADA_MENSAL_PADRAO);
  const valorHoraExtra = valorHoraNormal * (1 + PERCENTUAL_EXTRA_NORMAL);
  const valorHoraExtra100 = valorHoraNormal * (1 + PERCENTUAL_EXTRA_FERIADO_FIMSEMANA);

  let totalMinutosTrabalhados = 0;
  let totalMinutosExtras = 0;
  let totalMinutosExtras100 = 0;
  
  // 1. Agrupamento de registros por dia (YYYY-MM-DD)
  const registrosPorDia: Record<string, RegistroPonto[]> = {};
  const registrosOrdenados = [...registros].sort((a, b) => parseISO(a.horario_registro).getTime() - parseISO(b.horario_registro).getTime());
  
  for (const registro of registrosOrdenados) {
    // Para registros de Falta/Abono, que são salvos com 12:00 UTC, usamos a data pura.
    // Para registros de Entrada/Saída, usamos a data do registro.
    const horario = parseISO(registro.horario_registro);
    const dia = format(horario, 'yyyy-MM-dd');
    
    if (!registrosPorDia[dia]) {
      registrosPorDia[dia] = [];
    }
    registrosPorDia[dia].push(registro);
  }
  
  // 2. Processar todos os dias do mês
  const inicioMes = startOfMonth(mes);
  const fimMes = endOfMonth(mes);
  const todosOsDiasDoMes = eachDayOfInterval({ start: inicioMes, end: fimMes });
  
  const diasProcessados: Record<string, { minutos: number, registros: RegistroPonto[], isFalta: boolean, isAbono: boolean, hasUnclosedEntry: boolean }> = {};
  
  for (const data of todosOsDiasDoMes) {
    const diaString = format(data, 'yyyy-MM-dd');
    const registrosDoDia = registrosPorDia[diaString] || [];
    
    let minutosDia = 0;
    let entrada: Date | null = null;
    let isFalta = false;
    let isAbono = false;
    let hasUnclosedEntry = false;
    
    // Processamento de registros de ponto (Entrada/Saída)
    for (const registro of registrosDoDia) {
        if (registro.tipo === 'Falta') {
            isFalta = true;
            break; // Se for falta, ignora o resto dos registros de ponto
        }
        if (registro.tipo === 'Abono') {
            isAbono = true;
            const horasAbonadas = parseInt(registro.observacao?.replace('h', '') || '0');
            minutosDia += horasAbonadas * 60;
            break; // Se for abono, ignora o resto dos registros de ponto
        }
        
        const horario = parseISO(registro.horario_registro);
        
        if (registro.tipo === 'Entrada') {
            entrada = horario;
            hasUnclosedEntry = true;
        } else if (registro.tipo === 'Saida' && entrada && isSameDay(horario, entrada)) {
            const minutosTrabalhados = differenceInMinutes(horario, entrada);
            minutosDia += minutosTrabalhados;
            entrada = null;
            hasUnclosedEntry = false;
        } else if (registro.tipo === 'Saida' && entrada && !isSameDay(horario, entrada)) {
            // Lógica simplificada para virada de dia
            const minutosTrabalhados = differenceInMinutes(horario, entrada);
            minutosDia += minutosTrabalhados;
            entrada = null;
            hasUnclosedEntry = false;
        }
    }
    
    // Se o dia já passou e a última ação foi Entrada, marca como sem fechamento
    if (entrada && startOfDay(data) < startOfDay(new Date())) {
        hasUnclosedEntry = true;
    } else if (!entrada) {
        hasUnclosedEntry = false;
    }

    diasProcessados[diaString] = {
        minutos: minutosDia,
        registros: registrosDoDia,
        isFalta,
        isAbono,
        hasUnclosedEntry,
    };
    
    // Acumular totais (apenas se não for falta)
    if (!isFalta) {
        totalMinutosTrabalhados += minutosDia;
    }
  }
  
  // 3. Calcular horas extras (Simplificado: tudo acima da jornada mensal é extra)
  const jornadaMensalMinutos = (horas_mensais || JORNADA_MENSAL_PADRAO) * 60;
  
  if (totalMinutosTrabalhados > jornadaMensalMinutos) {
    totalMinutosExtras = totalMinutosTrabalhados - jornadaMensalMinutos;
    totalMinutosTrabalhados = jornadaMensalMinutos;
  }

  // 4. Calcular valor total
  const valorTotalNormal = (totalMinutosTrabalhados / 60) * valorHoraNormal;
  const valorTotalExtra = (totalMinutosExtras / 60) * valorHoraExtra;
  const valorTotalExtra100 = (totalMinutosExtras100 / 60) * valorHoraExtra100;
  const valorTotalPagar = valorTotalNormal + valorTotalExtra + valorTotalExtra100;

  const formatarHoras = (minutos: number): string => {
    const horas = Math.floor(minutos / 60);
    const mins = Math.round(minutos % 60);
    return `${horas}h ${mins}m`;
  };
  
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const handleViewSelfie = (url: string) => {
    setSelfieUrl(url);
    setSelfieModalOpen(true);
  };
  
  const handleDelete = async (registroId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro de Falta/Abono? O dia voltará a ser listado como ' + '"Dia Sem Registro".')) return;

    const { error } = await supabase
      .from('registros_ponto')
      .delete()
      .eq('id', registroId);

    if (error) {
      showError('Erro ao excluir registro: ' + error.message);
    } else {
      showSuccess('Registro excluído com sucesso.');
      onDeleteRegistro(); // CHAMA A FUNÇÃO DE RECARREGAMENTO
    }
  };

  const canEdit = role === 'Admin' || role === 'Cliente';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-xl flex items-center"><DollarSign className="w-5 h-5 mr-2" /> Resumo Financeiro ({format(mes, 'MMMM/yyyy', { locale: ptBR })})</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><p className="text-sm text-muted-foreground">Salário Base</p><p className="font-bold text-lg">{formatCurrency(salario)}</p></div>
          <div><p className="text-sm text-muted-foreground">Jornada Mensal</p><p className="font-bold text-lg">{horas_mensais}h</p></div>
          <div><p className="text-sm text-muted-foreground">Horas Normais</p><p className="font-bold text-lg">{formatarHoras(totalMinutosTrabalhados)}</p></div>
          <div><p className="text-sm text-muted-foreground">Horas Extras (50%)</p><p className="font-bold text-lg text-orange-500">{formatarHoras(totalMinutosExtras)}</p></div>
          <div className="col-span-2 md:col-span-4 border-t pt-2"><p className="text-sm text-muted-foreground">Valor Total a Pagar (Estimado)</p><p className="font-extrabold text-2xl text-primary">{formatCurrency(valorTotalPagar)}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl flex items-center"><Clock className="w-5 h-5 mr-2" /> Detalhe Diário</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead className="w-[120px]">Data</TableHead><TableHead>Registros</TableHead><TableHead className="text-right">Total Dia</TableHead></TableRow></TableHeader>
              <TableBody>
                {todosOsDiasDoMes.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground">Nenhum dia encontrado para este mês.</TableCell></TableRow>
                ) : (
                    todosOsDiasDoMes.map(data => {
                        const diaString = format(data, 'yyyy-MM-dd');
                        const { minutos, registros, isFalta, isAbono, hasUnclosedEntry } = diasProcessados[diaString] || { minutos: 0, registros: [], isFalta: false, isAbono: false, hasUnclosedEntry: false };
                        
                        const isFimDeSemana = isWeekend(data);
                        const isDiaAtual = isSameDay(data, new Date());
                        const isDiaFuturo = data > new Date();
                        
                        let statusDisplay;
                        let isAlert = false;
                        
                        if (isFalta) {
                            const atestadoUrl = registros.find(r => r.tipo === 'Falta')?.atestado_url;
                            statusDisplay = atestadoUrl 
                                ? <span className="text-sm text-green-600 flex items-center"><FileText className="w-4 h-4 mr-1" /> Falta Justificada</span>
                                : <span className="text-sm text-red-600 flex items-center"><AlertTriangle className="w-4 h-4 mr-1" /> Falta Injustificada</span>;
                        } else if (isAbono) {
                            const observacao = registros.find(r => r.tipo === 'Abono')?.observacao;
                            statusDisplay = <span className="text-sm text-blue-600 flex items-center"><Clock className="w-4 h-4 mr-1" /> Abono ({observacao})</span>;
                        } else if (registros.length === 0) {
                            statusDisplay = <span className="text-sm text-muted-foreground">{isFimDeSemana ? 'Fim de Semana' : isDiaFuturo ? 'Futuro' : 'Sem Registro'}</span>;
                            isAlert = !isFimDeSemana && !isDiaFuturo;
                        } else if (hasUnclosedEntry && !isDiaAtual) {
                            // Dia sem fechamento (Entrada sem Saída e dia já passou)
                            statusDisplay = <span className="text-sm text-yellow-600 flex items-center"><AlertTriangle className="w-4 h-4 mr-1" /> Dia sem fechamento</span>;
                            isAlert = true;
                        } else {
                            statusDisplay = formatarHoras(minutos);
                        }

                        // Encontra o registro de Falta/Abono para exclusão/edição
                        const registroFaltaAbono = registros.find(r => r.tipo === 'Falta' || r.tipo === 'Abono');
                        
                        // Verifica se há registros de Entrada/Saída para o ajuste manual
                        const hasPontoRecords = registros.some(r => r.tipo === 'Entrada' || r.tipo === 'Saida');

                        return (
                            <TableRow key={diaString} className={cn(isFimDeSemana && 'bg-secondary/30', (isFalta || isAbono) && 'bg-blue-100/50 dark:bg-blue-900/20')}>
                                <TableCell className="font-medium">{format(data, 'dd/MM (EEE)', { locale: ptBR })}</TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-2 items-center">
                                        {registros.map(r => (
                                            <span key={r.id} className="text-sm bg-muted px-2 py-1 rounded-full flex items-center">
                                                {r.tipo === 'Falta' ? (
                                                    <>
                                                        {r.atestado_url ? 'Falta Justificada' : 'Falta Injustificada'}
                                                        {r.atestado_url && (
                                                            <a 
                                                                href={r.atestado_url} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer" 
                                                                className="ml-1 text-primary hover:text-primary/80 inline-flex items-center"
                                                                title="Ver Atestado"
                                                            >
                                                                <FileText className="w-3 h-3" />
                                                            </a>
                                                        )}
                                                    </>
                                                ) : r.tipo === 'Abono' ? (
                                                    <>
                                                        Abono ({r.observacao})
                                                    </>
                                                ) : (
                                                    <>
                                                        {r.tipo}: {format(parseISO(r.horario_registro), 'HH:mm')}
                                                        {r.maps_url && (
                                                            <a 
                                                                href={r.maps_url} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer" 
                                                                className="ml-1 text-blue-500 hover:text-blue-700 inline-flex items-center"
                                                                title="Ver Localização"
                                                            >
                                                                <MapPin className="w-3 h-3" />
                                                            </a>
                                                        )}
                                                        {r.selfie_url && (
                                                            <button 
                                                                onClick={() => handleViewSelfie(r.selfie_url)} 
                                                                className="ml-1 text-primary hover:text-primary/80 inline-flex items-center"
                                                                title="Ver Selfie"
                                                            >
                                                                <Camera className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </span>
                                        ))}
                                        
                                        {/* Ações de Edição/Exclusão */}
                                        {canEdit && !isDiaFuturo && (
                                            <div className="flex space-x-1 ml-2">
                                                {registroFaltaAbono && (
                                                    <>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => onEditFaltaAbono(registroFaltaAbono, data)} // Edição de Falta/Abono
                                                            title="Editar Falta/Abono"
                                                            className="h-6 w-6 text-primary hover:text-primary/80"
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => handleDelete(registroFaltaAbono.id)}
                                                            title="Excluir Falta/Abono"
                                                            className="h-6 w-6 text-red-500 hover:text-red-700"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </>
                                                )}
                                                {/* Botão de Ajuste de Ponto (Aparece se houver alerta de fechamento OU se houver registros de ponto) */}
                                                {(isAlert || hasPontoRecords) && !registroFaltaAbono && (
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        onClick={() => onEditRegistro(data)} // Ajuste de Ponto (Entrada/Saída)
                                                        title="Ajustar Ponto"
                                                        className="h-6 text-xs"
                                                    >
                                                        <Edit className="w-3 h-3 mr-1" /> Ajustar Ponto
                                                    </Button>
                                                )}
                                                {/* Botão de Marcar Falta (Aparece se não houver registro e não for fim de semana/futuro) */}
                                                {!hasPontoRecords && !registroFaltaAbono && !isFimDeSemana && !isDiaFuturo && (
                                                    <Button 
                                                        variant="destructive" 
                                                        size="sm" 
                                                        onClick={() => onEditFaltaAbono(null, data)} // Marcar Falta (registro é null)
                                                        title="Marcar Falta"
                                                        className="h-6 text-xs"
                                                    >
                                                        <CalendarX className="w-3 h-3 mr-1" /> Marcar Falta
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right font-semibold">
                                    {statusDisplay}
                                </TableCell>
                            </TableRow>
                        );
                    })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Visualização da Selfie */}
      <Dialog open={selfieModalOpen} onOpenChange={setSelfieModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Selfie do Registro de Ponto</DialogTitle>
          </DialogHeader>
          {selfieUrl ? (
            <img src={selfieUrl} alt="Selfie do Registro" className="w-full h-auto rounded-md" />
          ) : (
            <p className="text-center text-muted-foreground">Nenhuma selfie disponível.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DetalheFolhaPonto;