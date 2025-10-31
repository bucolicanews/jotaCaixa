import React from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RegistroPonto, Ferias } from '@/types/ponto';

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
    // Adicionando campos faltantes para resolver TS2339
    minutosAbonados: number;
    needsManagement: boolean;
}

interface FolhaPontoPrintProps {
  empresaNome: string;
  funcionario: FuncionarioDetalhe;
  mes: Date;
  diasProcessados: Record<string, DiaProcessado>;
  totalMinutosTrabalhados: number;
  minutosDiferenca: number;
}

const FolhaPontoPrint: React.FC<FolhaPontoPrintProps> = ({ 
    empresaNome, 
    funcionario, 
    mes, 
    diasProcessados, 
    totalMinutosTrabalhados, 
    minutosDiferenca 
}) => {
    
    const formatarHoras = (minutos: number): string => {
        const sign = minutos < 0 ? '-' : '';
        const absMinutos = Math.abs(minutos);
        const horas = Math.floor(absMinutos / 60);
        const mins = Math.round(absMinutos % 60);
        return `${sign}${horas}h ${mins}m`;
    };
    
    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    const isExtraHours = minutosDiferenca < 0;
    const displayDifference = formatarHoras(minutosDiferenca);
    const displayExtraHours = formatarHoras(Math.abs(minutosDiferenca));
    
    const diasOrdenados = Object.keys(diasProcessados).sort();
    
    const getObservacaoPrincipal = (diaData: DiaProcessado): string => {
        if (diaData.isFerias) return 'FÉRIAS';
        if (diaData.isFalta) {
            const faltaRegistro = diaData.registros.find(r => r.tipo === 'Falta');
            return faltaRegistro?.atestado_url ? 'Falta Justificada (Atestado Anexado)' : 'Falta Injustificada';
        }
        if (diaData.isAbono) {
            const abonoRegistro = diaData.registros.find(r => r.tipo === 'Abono');
            if (diaData.isCompensacaoAbono) {
                return abonoRegistro?.observacao || 'Folga Compensatória';
            }
            return `Abono (${abonoRegistro?.observacao || '8h'})`;
        }
        if (diaData.isFolgaFixa && diaData.hasPontoRecords) {
            if (diaData.decisionRecord === 'Extra100') return 'Folga Trabalhada (Paga Extra 100%)';
            if (diaData.decisionRecord === 'Compensacao') return 'Folga Trabalhada (Compensada)';
            if (diaData.needsManagement) return 'Folga Trabalhada (Gestão Pendente)';
        }
        if (diaData.isFolgaFixa && !diaData.hasPontoRecords) return 'Folga Fixa';
        
        return '';
    };

    return (
        <div className="print-container">
            <div className="print-header">
                <h1 style={{ fontSize: '18px', fontWeight: 'bold' }}>FOLHA DE PONTO MENSAL</h1>
                <p style={{ fontSize: '14px' }}>Empresa: {empresaNome}</p>
                <p style={{ fontSize: '14px' }}>Funcionário: {funcionario.nome}</p>
                <p style={{ fontSize: '14px' }}>Mês de Referência: {format(mes, 'MMMM/yyyy', { locale: ptBR })}</p>
            </div>

            <div className="print-section">
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>Resumo Financeiro/Jornada</h2>
                <table className="print-table" style={{ width: '50%' }}>
                    <tbody>
                        <tr><th>Salário Base</th><td>{formatCurrency(funcionario.salario)}</td></tr>
                        <tr><th>Jornada Mensal</th><td>{funcionario.horas_mensais}h</td></tr>
                        <tr><th>Horas Trabalhadas</th><td>{formatarHoras(totalMinutosTrabalhados)}</td></tr>
                        <tr>
                            <th>{isExtraHours ? 'Horas Extras' : 'Diferença (Saldo)'}</th>
                            <td style={{ color: isExtraHours ? 'green' : 'red' }}>
                                {isExtraHours ? displayExtraHours : displayDifference}
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
                            <th style={{ width: '10%' }}>Data</th>
                            <th style={{ width: '10%' }}>Dia</th>
                            <th style={{ width: '30%' }}>Entradas</th>
                            <th style={{ width: '30%' }}>Saídas</th>
                            <th style={{ width: '10%' }}>Total Dia</th>
                            <th style={{ width: '10%' }}>Observações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {diasOrdenados.map(diaString => {
                            const diaData = diasProcessados[diaString];
                            const data = parseISO(diaString);
                            const diaSemana = format(data, 'EEE', { locale: ptBR });
                            
                            const batidas = diaData.registros.filter(r => r.tipo === 'Entrada' || r.tipo === 'Saida');
                            const entradas = batidas.filter(r => r.tipo === 'Entrada');
                            const saidas = batidas.filter(r => r.tipo === 'Saida');
                            
                            const observacaoPrincipal = getObservacaoPrincipal(diaData);
                                
                            const isFolga = diaData.isFolgaFixa && !diaData.hasPontoRecords && !diaData.isFerias;
                            const isFaltaOuAbono = diaData.isFalta || diaData.isAbono;
                            
                            let totalDiaDisplay = '';
                            if (diaData.isFerias) {
                                totalDiaDisplay = 'FÉRIAS';
                            } else if (isFolga) {
                                totalDiaDisplay = 'FOLGA';
                            } else if (isFaltaOuAbono) {
                                totalDiaDisplay = diaData.isFalta ? 'FALTA' : formatarHoras(diaData.minutosAbonados);
                            } else if (diaData.needsManagement) {
                                totalDiaDisplay = formatarHoras(diaData.minutosTrabalhadosFolga);
                            } else {
                                totalDiaDisplay = formatarHoras(diaData.minutos);
                            }

                            return (
                                <tr key={diaString}>
                                    <td>{format(data, 'dd/MM')}</td>
                                    <td>{diaSemana}</td>
                                    <td>{entradas.map(r => format(parseISO(r.horario_registro), 'HH:mm')).join(' | ')}</td>
                                    <td>{saidas.map(r => format(parseISO(r.horario_registro), 'HH:mm')).join(' | ')}</td>
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
                <div className="print-signature-line">Assinatura da Empresa ({empresaNome})</div>
            </div>
        </div>
    );
};

export default FolhaPontoPrint;