import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, DollarSign, MapPin, Camera, FileText, AlertTriangle } from 'lucide-react';
import { format, parseISO, differenceInMinutes, isWeekend, isSameDay, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface RegistroPonto {
  id: string;
  funcionario_id: string;
  horario_registro: string; // ISO string
  tipo: 'Entrada' | 'Saida' | 'Falta' | 'Abono'; // Adicionado 'Abono'
  maps_url: string;
  selfie_url: string;
  atestado_url?: string | null; 
  observacao?: string | null; // Adicionado para armazenar a duração do abono
}

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
}

// Constantes CLT (Simplificadas)
const JORNADA_MENSAL_PADRAO = 220; // Horas mensais padrão CLT
const PERCENTUAL_EXTRA_NORMAL = 0.5; // 50% de adicional
const PERCENTUAL_EXTRA_FERIADO_FIMSEMANA = 1.0; // 100% de adicional

const DetalheFolhaPonto: React.FC<DetalheFolhaPontoProps> = ({ funcionario, mes }) => {
  const { salario, horas_mensais, registros } = funcionario;
  const [selfieModalOpen, setSelfieModalOpen] = useState(false);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  
  const valorHoraNormal = salario / (horas_mensais || JORNADA_MENSAL_PADRAO);
  const valorHoraExtra = valorHoraNormal * (1 + PERCENTUAL_EXTRA_NORMAL);
  const valorHoraExtra100 = valorHoraNormal * (1 + PERCENTUAL_EXTRA_FERIADO_FIMSEMANA);

  let totalMinutosTrabalhados = 0;
  let totalMinutosExtras = 0;
  let totalMinutosExtras100 = 0;
  
  // Agrupamento de registros por dia
  const diasTrabalhados: Record<string, { minutos: number, registros: RegistroPonto[], isFalta: boolean, isAbono: boolean, atestadoUrl: string | null, observacao: string | null }> = {};

  // 1. Processar registros e agrupar por dia
  const registrosOrdenados = [...registros].sort((a, b) => parseISO(a.horario_registro).getTime() - parseISO(b.horario_registro).getTime());
  
  let entrada: Date | null = null;

  for (const registro of registrosOrdenados) {
    const horario = parseISO(registro.horario_registro);
    const dia = format(horario, 'yyyy-MM-dd');

    if (!diasTrabalhados[dia]) {
      diasTrabalhados[dia] = { minutos: 0, registros: [], isFalta: false, isAbono: false, atestadoUrl: null, observacao: null };
    }
    
    diasTrabalhados[dia].registros.push(registro);

    if (registro.tipo === 'Falta') {
        diasTrabalhados[dia].isFalta = true;
        diasTrabalhados[dia].atestadoUrl = registro.atestado_url || null;
        continue;
    }
    
    if (registro.tipo === 'Abono') {
        diasTrabalhados[dia].isAbono = true;
        diasTrabalhados[dia].observacao = registro.observacao || null;
        
        // Adiciona minutos do abono
        const horasAbonadas = parseInt(registro.observacao?.replace('h', '') || '0');
        const minutosAbonados = horasAbonadas * 60;
        diasTrabalhados[dia].minutos += minutosAbonados;
        totalMinutosTrabalhados += minutosAbonados;
        continue;
    }

    if (registro.tipo === 'Entrada') {
      entrada = horario;
    } else if (registro.tipo === 'Saida' && entrada && isSameDay(horario, entrada)) {
      const minutosDia = differenceInMinutes(horario, entrada);
      diasTrabalhados[dia].minutos += minutosDia;
      totalMinutosTrabalhados += minutosDia;
      entrada = null;
    } else if (registro.tipo === 'Saida' && entrada && !isSameDay(horario, entrada)) {
        // Lógica simplificada para virada de dia
        const minutosDia = differenceInMinutes(horario, entrada);
        diasTrabalhados[dia].minutos += minutosDia;
        totalMinutosTrabalhados += minutosDia;
        entrada = null;
    }
  }
  
  // 2. Calcular horas extras (Simplificado: tudo acima da jornada mensal é extra)
  const jornadaMensalMinutos = (horas_mensais || JORNADA_MENSAL_PADRAO) * 60;
  
  if (totalMinutosTrabalhados > jornadaMensalMinutos) {
    totalMinutosExtras = totalMinutosTrabalhados - jornadaMensalMinutos;
    totalMinutosTrabalhados = jornadaMensalMinutos;
  }

  // 3. Calcular valor total
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
                {Object.keys(diasTrabalhados).length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground">Nenhum registro encontrado para este funcionário no mês.</TableCell></TableRow>
                ) : (
                    Object.keys(diasTrabalhados).map(dia => {
                        const data = parseISO(dia);
                        const isFimDeSemana = isWeekend(data);
                        const { minutos, registros, isFalta, isAbono, atestadoUrl, observacao } = diasTrabalhados[dia];
                        
                        let statusDisplay;
                        if (isFalta) {
                            statusDisplay = atestadoUrl 
                                ? <span className="text-sm text-green-600 flex items-center"><FileText className="w-4 h-4 mr-1" /> Falta Justificada</span>
                                : <span className="text-sm text-red-600 flex items-center"><AlertTriangle className="w-4 h-4 mr-1" /> Falta Injustificada</span>;
                        } else if (isAbono) {
                            statusDisplay = <span className="text-sm text-blue-600 flex items-center"><Clock className="w-4 h-4 mr-1" /> Abono ({observacao})</span>;
                        } else if (minutos === 0 && !isFimDeSemana && startOfDay(data) < startOfDay(new Date())) {
                            // Se não é falta registrada, mas não tem minutos e é dia útil passado, alerta
                            statusDisplay = <span className="text-sm text-yellow-600 flex items-center"><AlertTriangle className="w-4 h-4 mr-1" /> Dia sem fechamento</span>;
                        } else {
                            statusDisplay = formatarHoras(minutos);
                        }

                        return (
                            <TableRow key={dia} className={cn(isFimDeSemana && 'bg-secondary/30', (isFalta || isAbono) && 'bg-blue-100/50 dark:bg-blue-900/20')}>
                                <TableCell className="font-medium">{format(data, 'dd/MM (EEE)', { locale: ptBR })}</TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-2">
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