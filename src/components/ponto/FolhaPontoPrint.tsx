import React, { useMemo } from 'react';
import { format, parseISO, eachDayOfInterval, getDay, isSameDay, differenceInMinutes, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RegistroPonto, Ferias } from '@/types/ponto';
import { parseHorasObservacao } from '@/components/ponto/DetalheFolhaPonto'; // Importando a função utilitária

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

interface DiaProcessado {
    minutos: number;
    registros: RegistroPonto[];
    isFalta: boolean;
    isAbono: boolean;
    isFolgaFixa: boolean;
    isFerias: boolean;
    hasPontoRecords: boolean;
    decisionRecord: 'Compensacao' | 'Extra100' | null;
    minutosTrabalhadosFolga: number;
    isCompensacaoAbono: boolean;
    minutosAbonadosCredited: number;
    needsManagement: boolean;
}

interface FolhaPontoPrintProps {
  funcionario: FuncionarioDetalhe;
  mes: Date;
  logoUrl: string | null;
  ownerName: string;
}

const JORNADA_MENSAL_PADRAO = 220; 
const JORNADA_DIARIA_PADRAO = 8; 
const DAY_MAP: Record<number, string> = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };

const formatarHoras = (minutos: number): string => {
    const sign = minutos < 0 ? '-' : '';
    const absMinutos = Math.abs(minutos);
    const horas = Math.floor(absMinutos / 60);
    const mins = Math.round(absMinutos % 60);
    return `${sign}${horas}h ${mins}m`;
};

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const FolhaPontoPrint: React.FC<FolhaPontoPrintProps> = ({ 
    funcionario, 
    mes, 
    logoUrl, 
    ownerName, 
}) => {
    
    // --- Lógica de Cálculo (Replicada do DetalheFolhaPonto) ---
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
        
        const diasProcessados: Record<string, DiaProcessado> = {};
        
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
                const end = endOfDay(parseISO(f.data_fim + 'T00:00:00'));
                return isWithinInterval(data, { start, end });
            });

            for (const registro of registrosDoDia) {
                if (registro.tipo === 'Falta' || registro.tipo === 'Abono') {
                    if (registro.tipo === 'Falta') isFalta = true;
                    if (registro.tipo === 'Abono') isAbono = true;
                    
                    if (registro.tipo === 'Falta' && registro.atestado_url) {
                        isFaltaJustificada = true;
                        minutosAbonadosCredited = parseHorasObservacao(registro.observacao ?? null, JORNADA_DIARIA_PADRAO) * 60;
                    }
                    
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
    // --- Fim Lógica de Cálculo ---

    const diasOrdenados = Object.keys(diasProcessados).sort();
    const isExtraHours = minutosDiferenca < 0;
    
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
    
    const getBatidasDoDia = (registros: RegistroPonto[]) => {
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
        <div className="print-container">
            <div className="print-header">
                {logoUrl && <img src={logoUrl} alt={ownerName} className="print-logo" />}
                <div className="print-header-content" style={{ marginLeft: logoUrl ? '15px' : '0', textAlign: 'left' }}>
                    <h1 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>FOLHA DE PONTO MENSAL</h1>
                    <p style={{ fontSize: '10px', color: '#555' }}>Empresa: {ownerName}</p>
                    {/* LINHA REMOVIDA: <p style={{ fontSize: '10px', color: '#555' }}>Funcionário: {funcionario.nome}</p> */}
                    <p style={{ fontSize: '10px', color: '#555' }}>Mês de Referência: {format(mes, 'MMMM/yyyy', { locale: ptBR })}</p>
                </div>
            </div>

            <div className="print-section">
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>Resumo Financeiro/Jornada</h2>
                <table className="print-table" style={{ width: '50%' }}>
                    <tbody>
                        <tr><th style={{ width: '50%' }}>Salário Base</th><td style={{ width: '50%' }}>{formatCurrency(funcionario.salario)}</td></tr>
                        <tr><th>Jornada Mensal</th><td>{funcionario.horas_mensais}h</td></tr>
                        <tr><th>Horas Trabalhadas</th><td>{formatarHoras(totalMinutosTrabalhados)}</td></tr>
                        <tr>
                            <th>{isExtraHours ? 'Horas Extras' : 'Diferença (Saldo)'}</th>
                            <td style={{ color: isExtraHours ? 'green' : 'red' }}>
                                {isExtraHours ? formatarHoras(Math.abs(minutosDiferenca)) : formatarHoras(minutosDiferenca)}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="print-section">
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>Detalhe Diário</h2>
                <table className="print-table">
                    <thead>
                        <tr>
                            <th rowSpan={2} style={{ width: '8%' }}>Data</th>
                            <th rowSpan={2} style={{ width: '8%' }}>Dia</th>
                            <th colSpan={2} style={{ width: '24%', textAlign: 'center' }}>Primeiro Turno</th>
                            <th colSpan={2} style={{ width: '24%', textAlign: 'center' }}>Segundo Turno</th>
                            <th rowSpan={2} style={{ width: '10%' }}>Total Dia</th>
                            <th rowSpan={2} style={{ width: '26%' }}>Observações</th>
                        </tr>
                        <tr>
                            <th style={{ width: '12%' }}>Entrada</th>
                            <th style={{ width: '12%' }}>Saída</th>
                            <th style={{ width: '12%' }}>Entrada</th>
                            <th style={{ width: '12%' }}>Saída</th>
                        </tr>
                    </thead>
                    <tbody>
                        {diasOrdenados.map(diaString => {
                            const diaData = diasProcessados[diaString];
                            const data = parseISO(diaString);
                            const diaSemana = format(data, 'EEE', { locale: ptBR });
                            
                            const { e1, s1, e2, s2 } = getBatidasDoDia(diaData.registros);
                            
                            const observacaoPrincipal = getObservacaoPrincipal(diaData);
                                
                            const isFolga = diaData.isFolgaFixa && !diaData.hasPontoRecords && !diaData.isFerias;
                            const isFaltaOuAbono = diaData.isFalta || diaData.isAbono;
                            
                            let totalDiaDisplay = '';
                            if (diaData.isFerias) {
                                totalDiaDisplay = 'FÉRIAS';
                            } else if (isFolga) {
                                totalDiaDisplay = 'FOLGA';
                            } else if (isFaltaOuAbono) {
                                totalDiaDisplay = diaData.isFalta ? 'FALTA' : formatarHoras(diaData.minutosAbonadosCredited || diaData.minutosAbonados);
                            } else if (diaData.needsManagement) {
                                totalDiaDisplay = formatarHoras(diaData.minutosTrabalhadosFolga);
                            } else {
                                totalDiaDisplay = formatarHoras(diaData.minutos);
                            }

                            return (
                                <tr key={diaString}>
                                    <td>{format(data, 'dd/MM')}</td>
                                    <td>{diaSemana}</td>
                                    <td style={{ textAlign: 'center' }}>{e1}</td>
                                    <td style={{ textAlign: 'center' }}>{s1}</td>
                                    <td style={{ textAlign: 'center' }}>{e2}</td>
                                    <td style={{ textAlign: 'center' }}>{s2}</td>
                                    <td>{totalDiaDisplay}</td>
                                    <td>{observacaoPrincipal}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            
            <div className="print-signatures">
                <div className="print-signature-line">Assinatura do Funcionário</div>
                <div className="print-signature-line">Assinatura da Empresa ({ownerName})</div>
            </div>
        </div>
    );
};

export default FolhaPontoPrint;