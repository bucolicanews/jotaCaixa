import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, FileSignature, Clock, Eye } from 'lucide-react';
import { format, parseISO, eachDayOfInterval, getDay, isSameDay, differenceInMinutes, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale'; // IMPORT CORRIGIDO
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RegistroPonto, Ferias } from '@/types/ponto';
import { 
    AlertDialog, 
    AlertDialogAction, 
    AlertDialogCancel, 
    AlertDialogContent, 
    AlertDialogDescription, 
    AlertDialogFooter, 
    AlertDialogHeader, 
    AlertDialogTitle, 
    AlertDialogTrigger // Importação adicionada
} from '@/components/ui/alert-dialog';
import { useSessao } from '@/hooks/use-sessao';
import { AdminUsuarioProfile } from '@/types/usuario';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';

// Constantes CLT (Simplificadas)
const JORNADA_MENSAL_PADRAO = 220; // Horas mensais padrão CLT
const JORNADA_DIARIA_PADRAO = 8; // Horas diárias padrão CLT

interface FuncionarioDetalhe {
    id: string;
    nome: string;
    salario: number;
    horas_mensais: number;
    registros: RegistroPonto[];
    dias_folga_fixos: string[];
    folga_domingo_obrigatoria: boolean;
    ferias: Ferias[];
    data_inicio_contrato?: string | null; // ADICIONADO
}

interface DetalheFolhaPontoProps {
    funcionario: FuncionarioDetalhe;
    mes: Date;
    onEditRegistro: (dia: Date) => void;
    onEditFaltaAbono: (registro: RegistroPonto | null, dia: Date) => void;
    onDeleteRegistro: (registroId: string) => void;
    onManageWorkedDayOff: (dia: Date, registros: RegistroPonto[]) => void;
    isReadOnly: boolean; // NOVO PROP
}

// Exportando a função utilitária
export const parseHorasObservacao = (observacao: string | null, defaultHours: number = 0): number => {
    if (!observacao) return defaultHours;
    
    // 1. Tenta extrair Abono=Yh (para faltas justificadas parciais/totais)
    const matchAbono = observacao.match(/Abono=(\d+)h/);
    if (matchAbono) {
        return parseInt(matchAbono[1], 10);
    }
    
    // 2. Tenta extrair Xh (para abonos manuais simples)
    const matchSimple = observacao.match(/(\d+)h/);
    if (matchSimple) {
        return parseInt(matchSimple[1], 10);
    }
    
    return defaultHours;
};

// Definindo a função utilitária
const formatarHoras = (minutos: number): string => {
    const sign = minutos < 0 ? '-' : '';
    const absMinutos = Math.abs(minutos);
    const horas = Math.floor(absMinutos / 60);
    const mins = Math.round(absMinutos % 60);
    return `${sign}${horas}h ${mins}m`;
};

// Função para extrair as 4 primeiras batidas do dia
const getBatidasDoDia = (registros: RegistroPonto[]) => {
    const batidas = registros
        .filter(r => r.tipo === 'Entrada' || r.tipo === 'Saida')
        .sort((a, b) => parseISO(a.horario_registro).getTime() - parseISO(b.horario_registro).getTime());
        
    const times = batidas.map(r => format(parseISO(r.horario_registro), 'HH:mm'));
    
    return {
        e1: times[0] || '',
        s1: times[1] || '',
        e2: times[2] || '',
        s2: times[3] || '',
    };
};

// Exportando o componente principal
export const DetalheFolhaPonto: React.FC<DetalheFolhaPontoProps> = ({
    funcionario,
    mes,
    onEditRegistro,
    onEditFaltaAbono,
    onDeleteRegistro,
    onManageWorkedDayOff,
    isReadOnly, // USANDO O NOVO PROP
}) => {
    const [isDeleting, setIsDeleting] = useState(false);
    
    // CORREÇÃO TS2352: Usando 'as unknown as' para conversão segura
    const isFuncionarioAdmin = !!((funcionario as unknown as AdminUsuarioProfile).admin_id);
    const tabelaRegistros = isFuncionarioAdmin ? 'admin_registros_ponto' : 'registros_ponto';
    
    const DAY_MAP: Record<number, string> = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };

    const { diasProcessados, totalMinutosTrabalhados, minutosDiferenca, totalMinutosExtras100 } = useMemo(() => {
        let totalMinutosTrabalhados = 0;
        let totalMinutosExtras100 = 0;
        
        const registrosPorDia: Record<string, RegistroPonto[]> = {};
        const registrosOrdenados = [...funcionario.registros].sort((a, b) => parseISO(a.horario_registro).getTime() - parseISO(b.horario_registro).getTime());
        
        for (const registro of registrosOrdenados) {
            const horario = parseISO(registro.horario_registro);
            const dia = format(horario, 'yyyy-MM-dd');
            if (!registrosPorDia[dia]) registrosPorDia[dia] = [];
            registrosPorDia[dia].push(registro);
        }
        
        const inicioMes = startOfMonth(mes);
        const fimMes = endOfMonth(mes);
        const hoje = new Date();
        const todosOsDiasDoMes = eachDayOfInterval({ start: inicioMes, end: fimMes });
        
        const diasProcessados: Record<string, any> = {};
        
        for (const data of todosOsDiasDoMes) {
            const diaString = format(data, 'yyyy-MM-dd');
            const registrosDoDia = registrosPorDia[diaString] || [];
            
            let minutosDia = 0;
            let entrada: Date | null = null;
            let isFalta = false;
            let isAbono = false;
            let minutosAbonados = 0; 
            let isTurnoAberto = false;
            let hasPontoRecords = false;
            let decisionRecord: 'Compensacao' | 'Extra100' | null = null;
            let isCompensacaoAbono = false;
            let isFaltaJustificada = false;
            let minutosAbonadosCredited = 0;
            
            const diaDaSemana = DAY_MAP[getDay(data)];
            let isFolgaFixa = funcionario.dias_folga_fixos?.includes(diaDaSemana) || false;
            if ((funcionario.folga_domingo_obrigatoria ?? true) && diaDaSemana === 'Sunday') isFolgaFixa = true;
            
            const isFerias = funcionario.ferias.some(f => {
                const start = parseISO(f.data_inicio + 'T00:00:00');
                const end = endOfDay(parseISO(f.data_fim + 'T00:00:00')); // Usando endOfDay para incluir o dia final
                return isWithinInterval(data, { start, end });
            });

            for (const registro of registrosDoDia) {
                if (registro.tipo === 'Falta' || registro.tipo === 'Abono') {
                    if (registro.tipo === 'Falta') isFalta = true;
                    if (registro.tipo === 'Abono') isAbono = true;
                    
                    // 1. Verifica se é falta justificada e calcula horas abonadas
                    if (registro.tipo === 'Falta' && registro.atestado_url) {
                        isFaltaJustificada = true;
                        minutosAbonadosCredited = parseHorasObservacao(registro.observacao ?? null, JORNADA_DIARIA_PADRAO) * 60;
                    }
                    
                    // 2. Calcula minutos para abono manual
                    minutosAbonados = parseHorasObservacao(registro.observacao ?? null, JORNADA_DIARIA_PADRAO) * 60;
                    
                    if (registro.observacao?.includes('Compensação de folga trabalhada')) {
                        isCompensacaoAbono = true;
                        minutosAbonados = 0;
                    }
                    
                    continue;
                }
                
                if (registro.tipo === 'Compensacao') decisionRecord = 'Compensacao';
                if (registro.tipo === 'Extra100') decisionRecord = 'Extra100';
                
                if (registro.tipo === 'Entrada' || registro.tipo === 'Saida') {
                    hasPontoRecords = true;
                    const horario = parseISO(registro.horario_registro);
                    
                    if (registro.tipo === 'Entrada') {
                        entrada = horario;
                        isTurnoAberto = true;
                    } else if (registro.tipo === 'Saida' && entrada) {
                        const minutosTrabalhados = differenceInMinutes(horario, entrada);
                        minutosDia += minutosTrabalhados;
                        entrada = null;
                        isTurnoAberto = false;
                    } else if (registro.tipo === 'Saida' && !entrada) {
                        isTurnoAberto = false;
                    }
                }
            }
            
            if (entrada) {
                if (isSameDay(data, hoje)) {
                    minutosDia += differenceInMinutes(hoje, entrada);
                    isTurnoAberto = true;
                } else {
                    minutosDia = 0;
                    isTurnoAberto = true;
                }
            } else {
                isTurnoAberto = false;
            }
            
            let minutosTrabalhadosFolga = 0;
            let needsManagement = false;
            
            if (isFolgaFixa && hasPontoRecords && !isFerias) {
                minutosTrabalhadosFolga = minutosDia;
                
                if (!decisionRecord) {
                    needsManagement = true;
                } else if (decisionRecord === 'Extra100') {
                    totalMinutosExtras100 += minutosTrabalhadosFolga;
                }
            }
            
            // LÓGICA DE ACUMULAÇÃO CORRIGIDA
            if (!isFolgaFixa && !isFerias && !isCompensacaoAbono) {
                if (isAbono) {
                    totalMinutosTrabalhados += minutosAbonados;
                } else if (isFalta) {
                    if (isFaltaJustificada) {
                        totalMinutosTrabalhados += minutosAbonadosCredited;
                    } else if (hasPontoRecords) {
                        totalMinutosTrabalhados += minutosDia;
                    }
                } else {
                    totalMinutosTrabalhados += minutosDia;
                }
            }
            
            if (isFalta) {
                if (isFaltaJustificada) {
                    minutosDia = minutosAbonadosCredited;
                } else {
                    minutosDia = 0;
                }
            } else if (isAbono && !isCompensacaoAbono) {
                minutosDia = minutosAbonados;
            }


            diasProcessados[diaString] = {
                minutos: minutosDia,
                registros: registrosDoDia,
                isFalta,
                isAbono,
                minutosAbonados, 
                isTurnoAberto,
                isFolgaFixa,
                isFerias,
                hasPontoRecords,
                decisionRecord,
                needsManagement,
                minutosTrabalhadosFolga,
                isCompensacaoAbono,
                isFaltaJustificada,
                minutosAbonadosCredited,
            };
        }
        
        const jornadaMensalMinutos = (funcionario.horas_mensais || JORNADA_MENSAL_PADRAO) * 60;
        const minutosDiferenca = jornadaMensalMinutos - totalMinutosTrabalhados; 

        return { diasProcessados, totalMinutosTrabalhados, minutosDiferenca, totalMinutosExtras100 };
    }, [funcionario, mes, JORNADA_DIARIA_PADRAO, DAY_MAP]);

    const diasOrdenados = Object.keys(diasProcessados).sort();
    const isExtraHours = minutosDiferenca < 0;
    
    const handleDeleteRegistro = async (registroId: string) => {
        if (!window.confirm('Tem certeza que deseja excluir este registro?')) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase
                .from(tabelaRegistros)
                .delete()
                .eq('id', registroId);
            
            if (error) throw error;
            showSuccess('Registro excluído com sucesso.');
            onDeleteRegistro(registroId);
        } catch (error: any) {
            showError('Falha ao excluir registro: ' + error.message);
        } finally {
            setIsDeleting(false);
        }
    };
    
    const handleViewAtestado = (url: string) => {
        window.open(url, '_blank');
    };
    
    const getObservacaoPrincipal = (diaData: any): string => {
        if (diaData.isFerias) return 'FÉRIAS';
        if (diaData.isFalta) {
            const faltaRegistro = diaData.registros.find((r: RegistroPonto) => r.tipo === 'Falta');
            return faltaRegistro?.atestado_url ? 'Falta Justificada (Atestado Anexado)' : 'Falta Injustificada';
        }
        if (diaData.isAbono) {
            const abonoRegistro = diaData.registros.find((r: RegistroPonto) => r.tipo === 'Abono');
            if (diaData.isCompensacaoAbono) {
                return abonoRegistro?.observacao || 'Folga Compensatória';
            }
            return `Abono (${parseHorasObservacao(abonoRegistro?.observacao || null, JORNADA_DIARIA_PADRAO)}h)`;
        }
        if (diaData.isFolgaFixa && diaData.hasPontoRecords) {
            if (diaData.decisionRecord === 'Extra100') return 'Folga Trabalhada (Paga Extra 100%)';
            if (diaData.decisionRecord === 'Compensacao') return 'Folga Trabalhada (Compensada)';
            if (diaData.needsManagement) return 'Folga Trabalhada (Gestão Pendente)';
        }
        if (diaData.isFolgaFixa && !diaData.hasPontoRecords) return 'Folga Fixa';
        
        return '';
    };
    
    const getBatidas = (registros: RegistroPonto[]) => {
        const batidas = registros
            .filter(r => r.tipo === 'Entrada' || r.tipo === 'Saida')
            .sort((a, b) => parseISO(a.horario_registro).getTime() - parseISO(b.horario_registro).getTime());
            
        const times = batidas.map(r => format(parseISO(r.horario_registro), 'HH:mm'));
        
        // Retorna as 4 primeiras batidas (E1, S1, E2, S2)
        return {
            e1: times[0] || '',
            s1: times[1] || '',
            e2: times[2] || '',
            s2: times[3] || '',
        };
    };


    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-xl">Folha de Ponto de {funcionario.nome}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Resumo */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-secondary rounded-md">
                        <p className="text-sm font-medium text-muted-foreground">Jornada Mensal</p>
                        <p className="text-xl font-bold mt-1">{funcionario.horas_mensais}h</p>
                    </div>
                    <div className="p-3 bg-secondary rounded-md">
                        <p className="text-sm font-medium text-muted-foreground">Horas Trabalhadas</p>
                        <p className="text-xl font-bold mt-1">{formatarHoras(totalMinutosTrabalhados)}</p>
                    </div>
                    <div className={cn("p-3 rounded-md", isExtraHours ? "bg-green-100 dark:bg-green-900/20" : "bg-red-100 dark:bg-red-900/20")}>
                        <p className="text-sm font-medium text-foreground">Saldo de Horas</p>
                        <p className={cn("text-xl font-bold mt-1", isExtraHours ? "text-green-600" : "text-red-600")}>
                            {formatarHoras(minutosDiferenca)}
                        </p>
                    </div>
                    <div className="p-3 bg-yellow-100 dark:bg-yellow-900/20 rounded-md">
                        <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Horas Extras 100%</p>
                        <p className="text-xl font-bold mt-1">{formatarHoras(totalMinutosExtras100)}</p>
                    </div>
                </div>

                {/* Tabela Detalhada */}
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[80px]">Data</TableHead>
                                <TableHead className="w-[80px]">Dia</TableHead>
                                <TableHead colSpan={2} className="text-center border-x">Primeiro Turno</TableHead>
                                <TableHead colSpan={2} className="text-center border-r">Segundo Turno</TableHead>
                                <TableHead className="w-[150px]">Total Dia</TableHead> {/* AUMENTADO */}
                                <TableHead className="min-w-[100px]">Observações</TableHead> {/* REDUZIDO */}
                                {/* OCULTA A COLUNA AÇÕES SE FOR READONLY */}
                                {!isReadOnly && <TableHead className="w-[120px] text-right">Ações</TableHead>}
                            </TableRow>
                            <TableRow>
                                <TableHead className="w-[80px]"></TableHead>
                                <TableHead className="w-[80px]"></TableHead>
                                <TableHead className="w-[100px] text-center">Entrada</TableHead> {/* AUMENTADO */}
                                <TableHead className="w-[100px] text-center border-r">Saída</TableHead> {/* AUMENTADO */}
                                <TableHead className="w-[100px] text-center">Entrada</TableHead> {/* AUMENTADO */}
                                <TableHead className="w-[100px] text-center border-r">Saída</TableHead> {/* AUMENTADO */}
                                <TableHead className="w-[150px]"></TableHead> {/* AUMENTADO */}
                                <TableHead className="min-w-[100px]"></TableHead>
                                {!isReadOnly && <TableHead className="w-[120px] text-right"></TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {diasOrdenados.map(diaString => {
                                const data = parseISO(diaString);
                                const diaData = diasProcessados[diaString];
                                
                                const { 
                                    minutos, 
                                    registros: registrosDoDia, 
                                    isFalta, 
                                    isAbono, 
                                    isFolgaFixa, 
                                    isFerias, 
                                    hasPontoRecords, 
                                    decisionRecord, 
                                    needsManagement, 
                                    minutosTrabalhadosFolga, 
                                    isCompensacaoAbono, 
                                    isFaltaJustificada,
                                    minutosAbonadosCredited,
                                } = diaData;
                                
                                const { e1, s1, e2, s2 } = getBatidas(registrosDoDia);
                                
                                const statusDisplay = isFalta ? 'FALTA' : (isAbono ? 'ABONO' : 'N/A');
                                
                                const totalDiaDisplay = isFolgaFixa && hasPontoRecords && (decisionRecord || needsManagement) 
                                    ? formatarHoras(minutosTrabalhadosFolga) 
                                    : (isFaltaJustificada || isAbono && !isCompensacaoAbono ? formatarHoras(minutosAbonadosCredited || minutos) : statusDisplay);

                                const hoje = new Date();
                                
                                let rowClassName = '';
                                if (isFerias) rowClassName = 'bg-blue-500/10';
                                else if (isFolgaFixa && hasPontoRecords) rowClassName = 'bg-yellow-500/10';
                                else if (isFalta && isFaltaJustificada) rowClassName = 'bg-blue-500/10';
                                else if (isFalta && !isFaltaJustificada) rowClassName = 'bg-red-500/10';
                                else if (isAbono) rowClassName = 'bg-green-500/10';
                                else if (registrosDoDia.length === 0 && data < hoje) rowClassName = 'bg-red-500/10';
                                
                                const observacaoPrincipal = getObservacaoPrincipal(diaData);

                                const absenceRecord = registrosDoDia.find((r: RegistroPonto) => r.tipo === 'Falta' || r.tipo === 'Abono');
                                const atestadoUrl = absenceRecord?.atestado_url;

                                return (
                                    <TableRow key={diaString} className={rowClassName}>
                                        <TableCell className="font-medium">{format(data, 'dd/MM')}</TableCell>
                                        <TableCell className="text-sm">{format(data, 'EEEE', { locale: ptBR })}</TableCell>
                                        
                                        {/* Batidas em Colunas Separadas */}
                                        <TableCell className="font-mono text-xs text-center">{e1}</TableCell>
                                        <TableCell className="font-mono text-xs text-center border-r">{s1}</TableCell>
                                        <TableCell className="font-mono text-xs text-center">{e2}</TableCell>
                                        <TableCell className="font-mono text-xs text-center border-r">{s2}</TableCell>
                                        
                                        <TableCell className="font-semibold">{totalDiaDisplay}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col space-y-1">
                                                <div className="flex items-center space-x-2">
                                                    <Badge variant={
                                                        isFalta && isFaltaJustificada ? 'default' : 
                                                        isFalta ? 'destructive' : 
                                                        isAbono ? 'success' : 'secondary'
                                                    }>
                                                        {observacaoPrincipal}
                                                    </Badge>
                                                    {atestadoUrl && (
                                                        <Button 
                                                            variant="link" 
                                                            size="sm" 
                                                            onClick={() => handleViewAtestado(atestadoUrl)}
                                                            className="h-auto p-0 text-blue-500 hover:text-blue-700 text-xs"
                                                            title="Visualizar Atestado Anexado"
                                                        >
                                                            <Eye className="w-3 h-3 mr-1" /> Atestado
                                                        </Button>
                                                    )}
                                                </div>
                                                {/* Registros detalhados (apenas se houver mais de 4 batidas ou observações complexas) */}
                                                {registrosDoDia.filter(r => r.tipo !== 'Falta' && r.tipo !== 'Abono' && r.tipo !== 'Entrada' && r.tipo !== 'Saida').map((r: RegistroPonto) => (
                                                    <div key={r.id} className="text-xs text-muted-foreground flex items-center space-x-1">
                                                        <Clock className="w-3 h-3" />
                                                        <span>{r.tipo}</span>
                                                        {r.observacao && <span className="truncate max-w-[150px]">({r.observacao})</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </TableCell>
                                        {/* COLUNA AÇÕES */}
                                        {!isReadOnly && (
                                            <TableCell className="text-right">
                                                <div className="flex justify-end space-x-1">
                                                    {hasPontoRecords && !isFerias && !isFalta && !isAbono && (
                                                        <Button 
                                                            variant="outline" 
                                                            size="icon" 
                                                            onClick={() => onEditRegistro(data)}
                                                            title="Ajustar Batidas"
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                    
                                                    {(!hasPontoRecords || isFalta || isAbono) && !isFerias && (
                                                        <Button 
                                                            variant="outline" 
                                                            size="icon" 
                                                            onClick={() => onEditFaltaAbono(registrosDoDia.find((r: RegistroPonto) => r.tipo === 'Falta' || r.tipo === 'Abono') || null, data)}
                                                            title={isFalta || isAbono ? "Editar Falta/Abono" : "Registrar Falta/Abono"}
                                                        >
                                                            <FileSignature className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                    
                                                    {needsManagement && (
                                                        <Button 
                                                            variant="default" 
                                                            size="sm" 
                                                            onClick={() => onManageWorkedDayOff(data, registrosDoDia)}
                                                            title="Gerenciar Folga Trabalhada"
                                                        >
                                                            Gerenciar
                                                        </Button>
                                                    )}
                                                    
                                                    {(isFalta || isAbono || decisionRecord) && (
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button variant="ghost" size="icon" title="Excluir Registro">
                                                                    <Trash2 className="w-4 h-4 text-red-500" />
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent>
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle>Excluir Registro?</AlertDialogTitle>
                                                                    <AlertDialogDescription>
                                                                        Esta ação irá remover o registro de {isFalta ? 'Falta' : (isAbono ? 'Abono' : 'Decisão')} para este dia.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={() => handleDeleteRegistro(registrosDoDia[0].id)} disabled={isDeleting}>
                                                                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Excluir'}
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    )}
                                                </div>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};