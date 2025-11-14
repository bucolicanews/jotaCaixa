import React, { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { AdminUsuarioProfile } from '@/types/usuario';
import { RegistroPonto, Ferias } from '@/types/ponto';
import { 
    format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, 
    isWithinInterval, isSameDay, differenceInMinutes 
} from 'date-fns';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Clock, Edit, Trash2, FileSignature, Loader2, MapPin, Camera, Download } from 'lucide-react';

// Constantes CLT (Simplificadas)
const JORNADA_MENSAL_PADRAO = 220; 
const JORNADA_DIARIA_PADRAO = 8; 

// Interfaces e Tipos
interface FuncionarioDetalhe {
    id: string;
    nome: string;
    salario: number;
    horas_mensais: number;
    registros: RegistroPonto[];
    dias_folga_fixos: string[];
    folga_domingo_obrigatoria: boolean;
    ferias: Ferias[];
    admin_id?: string; 
}

interface DetalheFolhaPontoProps {
    funcionario: FuncionarioDetalhe;
    mes: Date;
    onEditRegistro: (dia: Date) => void;
    onEditFaltaAbono: (registro: RegistroPonto | null, dia: Date) => void;
    onDeleteRegistro: (registroId: string) => void;
    onManageWorkedDayOff: (dia: Date, registros: RegistroPonto[]) => void;
}

// Funções utilitárias (Exportada para uso em FolhaPonto.tsx)
export const formatarHoras = (minutos: number): string => {
    const sign = minutos < 0 ? '-' : '';
    const absMinutos = Math.abs(minutos);
    const horas = Math.floor(absMinutos / 60);
    const mins = Math.round(absMinutos % 60);
    return `${sign}${horas}h ${mins}m`;
};

export const parseHorasObservacao = (observacao: string | null | undefined, defaultHours: number): number => {
    if (!observacao) return defaultHours;
    const match = observacao.match(/(\d+)h/);
    if (match) {
        return parseInt(match[1], 10);
    }
    if (observacao.includes('Falta Dia Todo (0h Abonadas)')) {
        return 0;
    }
    return defaultHours;
};


// Exportando o componente principal
export const DetalheFolhaPonto: React.FC<DetalheFolhaPontoProps> = ({
    funcionario,
    mes,
    onEditRegistro,
    onEditFaltaAbono,
    onDeleteRegistro,
    onManageWorkedDayOff,
}) => {
    const { } = useSessao(); 
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
            
            const diaDaSemana = DAY_MAP[getDay(data)];
            let isFolgaFixa = funcionario.dias_folga_fixos?.includes(diaDaSemana) || false;
            if ((funcionario.folga_domingo_obrigatoria ?? true) && diaDaSemana === 'Sunday') isFolgaFixa = true;
            
            const isFerias = funcionario.ferias.some((f: Ferias) => {
                const start = parseISO(f.data_inicio + 'T00:00:00');
                const end = parseISO(f.data_fim + 'T23:59:59');
                return isWithinInterval(data, { start, end });
            });

            for (const registro of registrosDoDia) {
                if (registro.tipo === 'Falta' || registro.tipo === 'Abono') {
                    if (registro.tipo === 'Falta') isFalta = true;
                    if (registro.tipo === 'Abono') isAbono = true;
                    
                    const horasCreditadas = parseHorasObservacao(registro.observacao, JORNADA_DIARIA_PADRAO);
                    minutosAbonados = Math.round(horasCreditadas * 60);
                    
                    if (registro.observacao?.includes('Compensação de folga trabalhada')) {
                        isCompensacaoAbono = true;
                        minutosAbonados = 0;
                    } else if (isFalta && registro.atestado_url) {
                        isFaltaJustificada = true;
                    }
                    
                    // Se for Falta Dia Todo (0h Abonadas), garante que minutosDia seja 0
                    if (registro.observacao?.includes('Falta Dia Todo (0h Abonadas)')) {
                        minutosDia = 0;
                    } else {
                        // Se for Abono, credita as horas. Se for Falta, minutosDia é 0 (a menos que seja justificada, mas a lógica de acumulação abaixo cuida disso)
                        minutosDia = isAbono ? minutosAbonados : 0;
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
                } else if (decisionRecord === 'Compensacao') {
                    // Não acumula minutos trabalhados
                }
            }
            
            // LÓGICA CORRIGIDA: Acumula minutos se não for folga fixa, não for férias E não for compensação
            if (!isFolgaFixa && !isFerias && !isCompensacaoAbono) {
                // Se for Abono, acumula as horas abonadas (minutosAbonados)
                if (isAbono) {
                    totalMinutosTrabalhados += minutosAbonados;
                } 
                // Se for Falta, acumula 0 (a menos que tenha batidas, que já estão em minutosDia)
                else if (isFalta) {
                    // NOVO: Se for falta JUSTIFICADA, acumula a jornada padrão (8h)
                    if (isFaltaJustificada) {
                        totalMinutosTrabalhados += JORNADA_DIARIA_PADRAO * 60;
                    }
                    // Se for falta, mas houver batidas (ajuste manual), acumula as batidas
                    else if (hasPontoRecords) {
                        totalMinutosTrabalhados += minutosDia;
                    }
                    // Se for falta sem batidas, acumula 0
                }
                // Se for dia normal com batidas, acumula minutosDia
                else {
                    totalMinutosTrabalhados += minutosDia;
                }
            }
            
            // LÓGICA CORRIGIDA: Define minutosDia para exibição
            if (isFalta) {
                // NOVO: Se for falta justificada, exibe a jornada padrão (8h)
                minutosDia = isFaltaJustificada ? JORNADA_DIARIA_PADRAO * 60 : 0; 
            } else if (isAbono && !isCompensacaoAbono) {
                minutosDia = minutosAbonados; // Abono = horas abonadas
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
            };
        }
        
        const jornadaMensalMinutos = (funcionario.horas_mensais || JORNADA_MENSAL_PADRAO) * 60;
        const minutosDiferenca = totalMinutosTrabalhados - jornadaMensalMinutos; 

        return { diasProcessados, totalMinutosTrabalhados, minutosDiferenca, totalMinutosExtras100 };
    }, [funcionario, mes, JORNADA_DIARIA_PADRAO, DAY_MAP, JORNADA_MENSAL_PADRAO]);

    const diasOrdenados = Object.keys(diasProcessados).sort();
    const isExtraHours = minutosDiferenca > 0;
    
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
                                <TableHead className="w-[80px]">Dia</TableHead>
                                <TableHead className="w-[150px]">Batidas</TableHead>
                                <TableHead className="w-[100px]">Total Dia</TableHead>
                                <TableHead>Registros</TableHead>
                                <TableHead className="w-[120px] text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {diasOrdenados.map(diaString => {
                                const data = parseISO(diaString);
                                const diaData = diasProcessados[diaString];
                                
                                // Fixes Errors 3-15 by defining the variables inside the loop scope
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
                                    isFaltaJustificada 
                                } = diaData;
                                
                                const statusDisplay = isFalta ? 'FALTA' : (isAbono ? 'ABONO' : 'N/A');
                                
                                // Determines the time to be displayed in the Total Day column (Fixes Errors 3-15)
                                const totalDiaDisplay = isFolgaFixa && hasPontoRecords && (decisionRecord || needsManagement) 
                                    ? formatarHoras(minutosTrabalhadosFolga) 
                                    : (isFaltaJustificada || isAbono && !isCompensacaoAbono ? formatarHoras(minutos) : statusDisplay);

                                // CORREÇÃO TS2304: Definindo 'hoje' no escopo do loop
                                const hoje = new Date();
                                
                                let rowClassName = '';
                                if (isFerias) rowClassName = 'bg-blue-500/10';
                                else if (isFolgaFixa && hasPontoRecords) rowClassName = 'bg-yellow-500/10';
                                // Falta Justificada (Azul)
                                else if (isFalta && isFaltaJustificada) rowClassName = 'bg-blue-500/10';
                                // Falta Injustificada (Vermelho)
                                else if (isFalta && !isFaltaJustificada) rowClassName = 'bg-red-500/10';
                                else if (isAbono) rowClassName = 'bg-green-500/10';
                                
                                // CORREÇÃO TS7006: Tipando 'r' como RegistroPonto
                                const batidas = registrosDoDia.filter((r: RegistroPonto) => r.tipo === 'Entrada' || r.tipo === 'Saida').map((r: RegistroPonto) => format(parseISO(r.horario_registro), 'HH:mm')).join(' / ');
                                
                                // Determina o status principal para a coluna de registros
                                let statusPrincipal = '';
                                if (isFerias) statusPrincipal = 'FÉRIAS';
                                // ALTERAÇÃO DE TEXTO SOLICITADA AQUI
                                else if (isFalta) statusPrincipal = isFaltaJustificada ? 'Falta Justificada' : 'Falta Injutificada';
                                else if (isAbono) statusPrincipal = 'Abono';
                                else if (isFolgaFixa && hasPontoRecords) statusPrincipal = 'Folga Trabalhada';
                                else if (isFolgaFixa) statusPrincipal = 'Folga Fixa';
                                // CORREÇÃO TS2552: Usando 'hoje' definido no escopo
                                else if (registrosDoDia.length === 0 && data < hoje) statusPrincipal = 'FALTA (Não Registrado)';
                                
                                // Se houver registros de decisão (Compensacao/Extra100), sobrescreve o status principal
                                if (decisionRecord === 'Compensacao') statusPrincipal = 'Compensação Registrada';
                                if (decisionRecord === 'Extra100') statusPrincipal = 'Extra 100% Registrado';
                                
                                // Se precisar de gestão, sobrescreve
                                if (needsManagement) statusPrincipal = 'Aguardando Gestão de Folga';

                                return (
                                    <TableRow key={diaString} className={rowClassName}>
                                        <TableCell className="font-medium">{format(data, 'dd/MM')}</TableCell>
                                        <TableCell className="font-mono text-sm">{batidas || '-'}</TableCell>
                                        <TableCell className="font-semibold">{totalDiaDisplay}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col space-y-1">
                                                <Badge 
                                                    variant={
                                                        isFalta && isFaltaJustificada ? 'default' : // Falta Justificada é default (azul)
                                                        isFalta ? 'destructive' : 
                                                        isAbono ? 'success' : 
                                                        'secondary'
                                                    }
                                                >
                                                    {statusPrincipal}
                                                </Badge>
                                                {registrosDoDia.map((r: RegistroPonto) => {
                                                    // Se for Falta ou Abono, não exibe o horário (apenas o tipo e observação)
                                                    const isFaltaOrAbono = r.tipo === 'Falta' || r.tipo === 'Abono';
                                                    
                                                    return (
                                                        <div key={r.id} className="text-xs text-muted-foreground flex items-center space-x-1">
                                                            <Clock className="w-3 h-3" />
                                                            {/* REMOÇÃO DO HORÁRIO PARA FALTA/ABONO */}
                                                            <span>{isFaltaOrAbono ? r.tipo : `${r.tipo}: ${format(parseISO(r.horario_registro), 'HH:mm')}`}</span>
                                                            {r.observacao && <span className="truncate max-w-[150px]">({r.observacao})</span>}
                                                            
                                                            {/* RESTAURANDO LINKS DE ANEXO */}
                                                            {r.maps_url && (
                                                                <a href={r.maps_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700" title="Ver Localização">
                                                                    <MapPin className="w-3 h-3" />
                                                                </a>
                                                            )}
                                                            {r.selfie_url && (
                                                                <a href={r.selfie_url} target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:text-purple-700" title="Ver Selfie">
                                                                    <Camera className="w-3 h-3" />
                                                                </a>
                                                            )}
                                                            {r.atestado_url && (
                                                                <a href={r.atestado_url} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-700" title="Baixar Atestado">
                                                                    <Download className="w-3 h-3" />
                                                                </a>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end space-x-1">
                                                {/* Ações de Ajuste de Ponto (Entrada/Saída) */}
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
                                                
                                                {/* Ações de Falta/Abono */}
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
                                                
                                                {/* Ações de Gestão de Folga Trabalhada */}
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
                                                
                                                {/* Ações de Deletar (Apenas Falta/Abono/Decisão) */}
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