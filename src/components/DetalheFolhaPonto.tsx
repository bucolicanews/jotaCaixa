import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, DollarSign, MapPin, Camera, FileText, AlertTriangle, Trash2, Edit, CalendarX, Plane, CalendarCheck } from 'lucide-react';
import { format, parseISO, differenceInMinutes, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from './ui/button';
import { useSessao } from '@/hooks/use-sessao';
import { RegistroPonto, Ferias } from '@/types/ponto';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';

interface FuncionarioDetalhe {
  id: string;
  nome: string;
  salario: number;
  horas_mensais: number;
  registros: RegistroPonto[];
  dias_folga_fixos: string[];
  folga_domingo_obrigatoria: boolean;
  ferias: Ferias[];
}

interface DetalheFolhaPontoProps {
  funcionario: FuncionarioDetalhe;
  mes: Date;
  onEditRegistro: (dia: Date) => void; // Para Ajuste de Ponto (Entrada/Saída)
  onEditFaltaAbono: (registro: RegistroPonto | null, dia: Date) => void; // Para Edição de Falta/Abono
  onDeleteRegistro: () => void; 
  onManageWorkedDayOff: (dia: Date, registros: RegistroPonto[]) => void; // NEW: Para gerenciar folga trabalhada
}

// Mapeamento de getDay() (0=Sunday, 6=Saturday) para strings
const DAY_MAP: Record<number, string> = {
    0: 'Sunday',
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
};

// Constantes CLT (Simplificadas)
const JORNADA_MENSAL_PADRAO = 220; // Horas mensais padrão CLT
const PERCENTUAL_EXTRA_NORMAL = 0.5; // 50% de adicional
const PERCENTUAL_EXTRA_70 = 0.7; // 70% de adicional (Adicionado conforme solicitação)
const PERCENTUAL_EXTRA_FERIADO_FIMSEMANA = 1.0; // 100% de adicional

const DetalheFolhaPonto: React.FC<DetalheFolhaPontoProps> = ({ funcionario, mes, onEditRegistro, onEditFaltaAbono, onDeleteRegistro, onManageWorkedDayOff }) => {
  const { salario, horas_mensais, registros, dias_folga_fixos, folga_domingo_obrigatoria, ferias } = funcionario;
  const { role } = useSessao();
  const [selfieModalOpen, setSelfieModalOpen] = useState(false);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  
  const valorHoraNormal = salario / (horas_mensais || JORNADA_MENSAL_PADRAO);
  
  // Valores das horas extras
  const valorHoraExtra50 = valorHoraNormal * (1 + PERCENTUAL_EXTRA_NORMAL);
  const valorHoraExtra70 = valorHoraNormal * (1 + PERCENTUAL_EXTRA_70);
  const valorHoraExtra100 = valorHoraNormal * (1 + PERCENTUAL_EXTRA_FERIADO_FIMSEMANA);

  let totalMinutosTrabalhados = 0; // Horas normais (até o limite da jornada)
  let totalMinutosExtras50 = 0; // Horas extras 50% (Excedente da jornada, não 100%)
  let totalMinutosExtras70 = 0; // Horas extras 70% (Novo campo, 0 por padrão)
  let totalMinutosExtras100 = 0; // Horas extras 100% (Folgas trabalhadas)
  
  // 1. Agrupamento de registros por dia (YYYY-MM-DD)
  const registrosPorDia: Record<string, RegistroPonto[]> = {};
  const registrosOrdenados = [...registros].sort((a, b) => parseISO(a.horario_registro).getTime() - parseISO(b.horario_registro).getTime());
  
  for (const registro of registrosOrdenados) {
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
  const hoje = new Date();
  const todosOsDiasDoMes = eachDayOfInterval({ start: inicioMes, end: fimMes });
  
  const diasProcessados: Record<string, { 
    minutos: number, 
    registros: RegistroPonto[], 
    isFalta: boolean, 
    isAbono: boolean, 
    isTurnoAberto: boolean, 
    isFolgaFixa: boolean, 
    isFerias: boolean,
    hasPontoRecords: boolean,
    decisionRecord: 'Compensacao' | 'Extra100' | null,
    needsManagement: boolean,
    minutosAbonados: number, // Novo campo para armazenar minutos de abono
  }> = {};
  
  for (const data of todosOsDiasDoMes) {
    const diaString = format(data, 'yyyy-MM-dd');
    const registrosDoDia = registrosPorDia[diaString] || [];
    
    let minutosDia = 0;
    let entrada: Date | null = null;
    let isFalta = false;
    let isAbono = false;
    let minutosAbonados = 0; // Inicializa minutos abonados
    let isTurnoAberto = false;
    let hasPontoRecords = false;
    let decisionRecord: 'Compensacao' | 'Extra100' | null = null;
    
    // Lógica de Folga Fixa
    const diaDaSemana = DAY_MAP[getDay(data)];
    let isFolgaFixa = dias_folga_fixos.includes(diaDaSemana);
    if (folga_domingo_obrigatoria && diaDaSemana === 'Sunday') {
        isFolgaFixa = true;
    }
    
    // Lógica de Férias
    const isFerias = ferias.some(f => {
        const start = parseISO(f.data_inicio + 'T00:00:00');
        const end = parseISO(f.data_fim + 'T23:59:59');
        return isWithinInterval(data, { start, end });
    });

    // Processamento de registros de ponto (Entrada/Saída, Falta, Abono, Compensacao, Extra100)
    for (const registro of registrosDoDia) {
        if (registro.tipo === 'Falta') {
            isFalta = true;
            break; 
        }
        if (registro.tipo === 'Abono') {
            isAbono = true;
            // Extrai as horas abonadas do observacao
            const horasAbonadas = parseInt(registro.observacao?.match(/(\d+)h/)?.[1] || '8'); 
            minutosAbonados = horasAbonadas * 60;
            minutosDia = minutosAbonados; // Define o total do dia como o abono
            break; 
        }
        
        if (registro.tipo === 'Compensacao') {
            decisionRecord = 'Compensacao';
        }
        if (registro.tipo === 'Extra100') {
            decisionRecord = 'Extra100';
        }
        
        if (registro.tipo === 'Entrada' || registro.tipo === 'Saida') {
            hasPontoRecords = true;
            
            const horario = parseISO(registro.horario_registro);
            
            if (registro.tipo === 'Entrada') {
                entrada = horario;
                isTurnoAberto = true;
            } else if (registro.tipo === 'Saida' && entrada) {
                // Verifica se a Saída é válida (após uma Entrada)
                const minutosTrabalhados = differenceInMinutes(horario, entrada);
                minutosDia += minutosTrabalhados;
                entrada = null;
                isTurnoAberto = false;
            } else if (registro.tipo === 'Saida' && !entrada) {
                // Saída sem Entrada anterior (ignora para cálculo, mas mantém o registro)
                isTurnoAberto = false;
            }
        }
    }
    
    // Se o último registro do dia foi Entrada, o turno está aberto.
    if (entrada) {
        if (isSameDay(data, hoje)) {
            // Se for o dia atual, soma o tempo até agora
            minutosDia += differenceInMinutes(hoje, entrada);
            isTurnoAberto = true;
        } else {
            // Se for um dia passado e o turno está aberto, não soma minutos, mas sinaliza o erro
            isTurnoAberto = true;
        }
    } else {
        isTurnoAberto = false;
    }
    
    // --- LÓGICA DE FOLGA TRABALHADA ---
    let needsManagement = false;
    let minutosTrabalhadosFolga = 0;
    
    if (isFolgaFixa && hasPontoRecords && !isFerias) {
        // Se trabalhou na folga, calcula as horas trabalhadas (minutosDia)
        minutosTrabalhadosFolga = minutosDia;
        
        if (!decisionRecord) {
            // Precisa de gestão se trabalhou na folga e não há decisão
            needsManagement = true;
            minutosDia = 0; // Zera o tempo normal para não contar no totalMinutosTrabalhados
        } else if (decisionRecord === 'Extra100') {
            // Se a decisão foi pagar 100% extra
            totalMinutosExtras100 += minutosTrabalhadosFolga;
            minutosDia = 0; // Não conta como hora normal
        } else if (decisionRecord === 'Compensacao') {
            // Se a decisão foi compensar, as horas são ignoradas para o cálculo de salário
            minutosDia = 0;
        }
    }
    
    // Acumular totais (apenas se não for folga trabalhada, nem falta/abono, nem férias)
    if (!isFolgaFixa && !isFalta && !isFerias) {
        // Se for abono, minutosDia já está definido como minutosAbonados
        // Se for ponto batido, minutosDia é o tempo trabalhado
        totalMinutosTrabalhados += minutosDia;
    }
    
    // Se for falta, zera minutosDia para evitar contagem dupla
    if (isFalta) {
        minutosDia = 0;
    }


    diasProcessados[diaString] = {
        minutos: minutosDia,
        registros: registrosDoDia,
        isFalta,
        isAbono,
        minutosAbonados, // Armazena para exibição
        isTurnoAberto,
        isFolgaFixa,
        isFerias,
        hasPontoRecords,
        decisionRecord,
        needsManagement,
    };
  }
  
  // 3. Calcular horas extras (Simplificado: tudo acima da jornada mensal é extra 50%)
  const jornadaMensalMinutos = (horas_mensais || JORNADA_MENSAL_PADRAO) * 60;
  
  let minutosExcedentes = 0;
  if (totalMinutosTrabalhados > jornadaMensalMinutos) {
    minutosExcedentes = totalMinutosTrabalhados - jornadaMensalMinutos;
    totalMinutosTrabalhados = jornadaMensalMinutos;
    
    // Por padrão, o excedente é 50%. Se o cliente quiser 70%, a lógica de diferenciação deve ser implementada aqui.
    totalMinutosExtras50 = minutosExcedentes; 
  }
  
  const minutosDiferenca = totalMinutosTrabalhados - jornadaMensalMinutos; // Saldo de horas (positivo = extra, negativo = falta)
  
  // 4. Calcular valor total
  const valorTotalNormal = (totalMinutosTrabalhados / 60) * valorHoraNormal;
  const valorTotalExtra50 = (totalMinutosExtras50 / 60) * valorHoraExtra50;
  const valorTotalExtra70 = (totalMinutosExtras70 / 60) * valorHoraExtra70; // Atualmente 0
  const valorTotalExtra100 = (totalMinutosExtras100 / 60) * valorHoraExtra100;
  
  const valorTotalExtras = valorTotalExtra50 + valorTotalExtra70 + valorTotalExtra100;
  const valorTotalPagar = valorTotalNormal + valorTotalExtras;

  const formatarHoras = (minutos: number): string => {
    const sign = minutos < 0 ? '-' : '';
    const absMinutos = Math.abs(minutos);
    const horas = Math.floor(absMinutos / 60);
    const mins = Math.round(absMinutos % 60);
    return `${sign}${horas}h ${mins}m`;
  };
  
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const handleViewSelfie = (url: string) => {
    setSelfieUrl(url);
    setSelfieModalOpen(true);
  };
  
  const handleDelete = async (registroId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro de Falta/Abono/Compensação? O dia voltará ao estado anterior.')) return;

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
          
          {/* LINHA 1: JORNADA E SALDO */}
          <div className="col-span-2 md:col-span-4 grid grid-cols-4 gap-4 border-b pb-3">
            <div><p className="text-sm text-muted-foreground">Salário Base</p><p className="font-bold text-lg">{formatCurrency(salario)}</p></div>
            <div><p className="text-sm text-muted-foreground">Jornada Mensal</p><p className="font-bold text-lg">{horas_mensais}h</p></div>
            <div><p className="text-sm text-muted-foreground">Horas Trabalhadas</p><p className="font-bold text-lg">{formatarHoras(totalMinutosTrabalhados)}</p></div>
            <div>
                <p className="text-sm text-muted-foreground">Diferença (Saldo)</p>
                <p className={cn("font-bold text-lg", minutosDiferenca < 0 ? "text-red-500" : "text-green-600")}>
                    {formatarHoras(minutosDiferenca)}
                </p>
            </div>
          </div>
          
          {/* LINHA 2: HORAS EXTRAS */}
          <div className="col-span-2 md:col-span-4 grid grid-cols-4 gap-4 border-b pb-3">
            <div className="col-span-1"><p className="text-sm text-muted-foreground">Horas Extras (50%)</p><p className="font-bold text-lg text-orange-500">{formatarHoras(totalMinutosExtras50)}</p></div>
            <div className="col-span-1"><p className="text-sm text-muted-foreground">Horas Extras (70%)</p><p className="font-bold text-lg text-yellow-600">{formatarHoras(totalMinutosExtras70)}</p></div>
            <div className="col-span-1"><p className="text-sm text-muted-foreground">Horas Extras (100%)</p><p className="font-bold text-lg text-red-500">{formatarHoras(totalMinutosExtras100)}</p></div>
            <div className="col-span-1"><p className="text-sm text-muted-foreground">Total Horas Extras</p><p className="font-bold text-lg text-primary">{formatarHoras(totalMinutosExtras50 + totalMinutosExtras70 + totalMinutosExtras100)}</p></div>
          </div>
          
          {/* LINHA 3: VALORES A PAGAR */}
          <div className="col-span-2 md:col-span-4 grid grid-cols-4 gap-4 pt-2">
            <div className="col-span-1"><p className="text-sm text-muted-foreground">Valor Salário Normal</p><p className="font-bold text-lg">{formatCurrency(valorTotalNormal)}</p></div>
            <div className="col-span-1"><p className="text-sm text-muted-foreground">Valor Extras (50%)</p><p className="font-bold text-lg text-orange-500">{formatCurrency(valorTotalExtra50)}</p></div>
            <div className="col-span-1"><p className="text-sm text-muted-foreground">Valor Extras (100%)</p><p className="font-bold text-lg text-red-500">{formatCurrency(valorTotalExtra100)}</p></div>
            <div className="col-span-1"><p className="text-sm text-muted-foreground">Valor Total a Pagar (Estimado)</p><p className="font-extrabold text-2xl text-primary">{formatCurrency(valorTotalPagar)}</p></div>
          </div>
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
                        const { minutos, registros, isFalta, isAbono, isTurnoAberto, isFolgaFixa, isFerias, hasPontoRecords, decisionRecord, needsManagement, minutosAbonados } = diasProcessados[diaString];
                        
                        const isDiaAtual = isSameDay(data, hoje);
                        const isDiaFuturo = data > hoje;
                        
                        let statusDisplay;
                        let actionButton = null;
                        
                        // 1. Determinar Status e Ação
                        if (isFerias) {
                            statusDisplay = <span className="text-sm text-purple-600 flex items-center"><Plane className="w-4 h-4 mr-1" /> Férias</span>;
                        } else if (isFolgaFixa) {
                            if (needsManagement) {
                                statusDisplay = <span className="text-sm text-yellow-600 flex items-center font-bold"><AlertTriangle className="w-4 h-4 mr-1" /> Folga Trabalhada (Aguardando Gestão)</span>;
                                if (canEdit) {
                                    actionButton = (
                                        <Button 
                                            variant="default" 
                                            size="sm" 
                                            onClick={() => onManageWorkedDayOff(data, registros.filter(r => r.tipo === 'Entrada' || r.tipo === 'Saida'))}
                                            title="Gerenciar Compensação"
                                            className="h-6 text-xs bg-yellow-600 hover:bg-yellow-700"
                                        >
                                            Gerenciar
                                        </Button>
                                    );
                                }
                            } else if (decisionRecord === 'Extra100') {
                                statusDisplay = <span className="text-sm text-red-600 flex items-center"><DollarSign className="w-4 h-4 mr-1" /> Pago Extra (100%)</span>;
                            } else if (decisionRecord === 'Compensacao') {
                                statusDisplay = <span className="text-sm text-blue-600 flex items-center"><CalendarCheck className="w-4 h-4 mr-1" /> Compensado (Banco de Horas)</span>;
                            } else {
                                statusDisplay = <span className="text-sm text-muted-foreground">Folga Fixa</span>;
                            }
                        } else if (isFalta) {
                            const atestadoUrl = registros.find(r => r.tipo === 'Falta')?.atestado_url;
                            statusDisplay = atestadoUrl 
                                ? <span className="text-sm text-green-600 flex items-center"><FileText className="w-4 h-4 mr-1" /> Falta Justificada</span>
                                : <span className="text-sm text-red-600 flex items-center"><AlertTriangle className="w-4 h-4 mr-1" /> Falta Injustificada</span>;
                        } else if (isAbono) {
                            const observacao = registros.find(r => r.tipo === 'Abono')?.observacao;
                            statusDisplay = <span className="text-sm text-blue-600 flex items-center"><Clock className="w-4 h-4 mr-1" /> Abono ({observacao})</span>;
                        } else if (registros.length === 0) {
                            statusDisplay = <span className="text-sm text-muted-foreground">{isDiaFuturo ? 'Futuro' : 'Sem Registro'}</span>;
                        } else {
                            // Exibe as horas calculadas
                            statusDisplay = (
                                <span className={cn(isTurnoAberto && !isFalta && !isAbono && !isDiaAtual ? "text-yellow-600 font-bold" : "")}>
                                    {formatarHoras(minutos)}
                                    {isTurnoAberto && !isFalta && !isAbono && !isDiaAtual && (
                                        <AlertTriangle className="w-4 h-4 ml-1 inline-block align-text-bottom" />
                                    )}
                                </span>
                            );
                        }

                        // 2. Encontra registros para edição/exclusão
                        const registroFaltaAbonoCompensacao = registros.find(r => r.tipo === 'Falta' || r.tipo === 'Abono' || r.tipo === 'Compensacao' || r.tipo === 'Extra100');
                        const hasPontoRecordsOnly = hasPontoRecords && !registroFaltaAbonoCompensacao;
                        
                        // 3. Determina a cor de fundo
                        const rowClassName = cn(
                            isFolgaFixa && 'bg-secondary/30',
                            isFerias && 'bg-purple-100/50 dark:bg-purple-900/20',
                            (isFalta || isAbono) && 'bg-blue-100/50 dark:bg-blue-900/20',
                            needsManagement && 'bg-yellow-100/50 dark:bg-yellow-900/20 border-l-4 border-yellow-500',
                        );

                        return (
                            <TableRow key={diaString} className={rowClassName}>
                                <TableCell className="font-medium">{format(data, 'dd/MM (EEE)', { locale: ptBR })}</TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-2 items-center">
                                        {registros.filter(r => r.tipo !== 'Compensacao' && r.tipo !== 'Extra100').map(r => (
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
                                        {canEdit && !isDiaFuturo && !isFerias && !needsManagement && (
                                            <div className="flex space-x-1 ml-2">
                                                {/* Edição/Exclusão de Falta/Abono/Compensação/Extra100 */}
                                                {registroFaltaAbonoCompensacao && (
                                                    <>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => {
                                                                if (isFolgaFixa && hasPontoRecords) {
                                                                    // Se for folga fixa trabalhada e já tem decisão, reabre o dialog de gestão de folga
                                                                    onManageWorkedDayOff(data, registros.filter(r => r.tipo === 'Entrada' || r.tipo === 'Saida'));
                                                                } else {
                                                                    // Se for Falta/Abono, usa o dialog de GerenciarFaltas
                                                                    onEditFaltaAbono(registroFaltaAbonoCompensacao, data);
                                                                }
                                                            }}
                                                            title="Editar Decisão"
                                                            className="h-6 w-6 text-primary hover:text-primary/80"
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => handleDelete(registroFaltaAbonoCompensacao.id)}
                                                            title="Excluir Decisão"
                                                            className="h-6 w-6 text-red-500 hover:text-red-700"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </>
                                                )}
                                                {/* Botão de Ajuste de Ponto (Aparece se houver registros de Entrada/Saída E não houver decisão de Falta/Abono/Compensação) */}
                                                {hasPontoRecordsOnly && (
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
                                                {/* Botão de Marcar Falta (Aparece se não houver registro e não for folga fixa/ferias/futuro) */}
                                                {!hasPontoRecordsOnly && !registroFaltaAbonoCompensacao && !isFolgaFixa && (
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
                                        {/* Renderiza o botão de Gerenciar Folga Trabalhada se necessário */}
                                        {actionButton}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right font-semibold">
                                    {isAbono ? formatarHoras(minutosAbonados) : statusDisplay}
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