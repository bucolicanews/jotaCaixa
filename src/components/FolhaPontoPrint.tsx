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
                            <th style={{ width: '5%' }}>Data</th>
                            <th style={{ width: '5%' }}>Dia</th>
                            <th style={{ width: '15%' }}>1ª Entrada</th>
                            <th style={{ width: '15%' }}>1ª Saída</th>
                            <th style={{ width: '15%' }}>2ª Entrada</th>
                            <th style={{ width: '15%' }}>2ª Saída</th>
                            <th style={{ width: '10%' }}>Total Dia</th>
                            <th style={{ width: '25%' }}>Observações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {diasOrdenados.map(diaString => {
                            const diaData = diasProcessados[diaString];
                            const data = parseISO(diaString);
                            const diaSemana = format(data, 'EEE', { locale: ptBR });
                            
                            const batidas = diaData.registros
                                .filter(r => r.tipo === 'Entrada' || r.tipo === 'Saida')
                                .sort((a, b) => parseISO(a.horario_registro).getTime() - parseISO(b.horario_registro).getTime());
                            
                            // Extrai as 4 batidas principais
                            const entrada1 = batidas.find(r => r.tipo === 'Entrada');
                            const saida1 = batidas.find(r => r.tipo === 'Saida' && parseISO(r.horario_registro).getTime() > (entrada1 ? parseISO(entrada1.horario_registro).getTime() : 0));
                            const entrada2 = batidas.find(r => r.tipo === 'Entrada' && parseISO(r.horario_registro).getTime() > (saida1 ? parseISO(saida1.horario_registro).getTime() : 0));
                            const saida2 = batidas.find(r => r.tipo === 'Saida' && parseISO(r.horario_registro).getTime() > (entrada2 ? parseISO(entrada2.horario_registro).getTime() : 0));
                            
                            // Variável local para corrigir o erro TS2339
                            const isFaltaOuAbono = diaData.isFalta || diaData.isAbono;

                            // Lógica de Observações (Concisa)
                            let observacoes = '';
                            if (diaData.isFerias) {
                                observacoes = 'FÉRIAS';
                            } else if (diaData.isFalta) {
                                const atestado = diaData.registros.find(r => r.tipo === 'Falta')?.atestado_url;
                                observacoes = atestado ? 'Falta Justificada' : 'Falta Injustificada';
                            } else if (diaData.isAbono) {
                                const obs = diaData.registros.find(r => r.tipo === 'Abono')?.observacao;
                                // Simplifica a observação de compensação
                                if (obs?.includes('Compensação de folga trabalhada')) {
                                    observacoes = 'Abono (Compensação)';
                                } else {
                                    observacoes = obs || 'Abono';
                                }
                            } else if (diaData.needsManagement) {
                                observacoes = 'Folga Trabalhada (Aguardando Gestão)';
                            } else if (diaData.decisionRecord === 'Extra100') {
                                observacoes = 'Folga Paga Extra 100%';
                            } else if (diaData.decisionRecord === 'Compensacao') {
                                observacoes = 'Folga Compensada';
                            } else if (diaData.isFolgaFixa && !diaData.hasPontoRecords) {
                                observacoes = 'FOLGA FIXA';
                            } else if (batidas.length > 4) {
                                observacoes = `Mais de 4 batidas (${batidas.length} registros)`;
                            } else if (diaData.hasPontoRecords && diaData.minutos === 0) {
                                observacoes = 'Turno Aberto ou Batidas Inválidas';
                            }
                            
                            let totalDiaDisplay = '';
                            if (diaData.isFerias) {
                                totalDiaDisplay = 'FÉRIAS';
                            } else if (diaData.isFolgaFixa && !diaData.hasPontoRecords && !diaData.isFerias) {
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
                                    <td>{entrada1 ? format(parseISO(entrada1.horario_registro), 'HH:mm') : ''}</td>
                                    <td>{saida1 ? format(parseISO(saida1.horario_registro), 'HH:mm') : ''}</td>
                                    <td>{entrada2 ? format(parseISO(entrada2.horario_registro), 'HH:mm') : ''}</td>
                                    <td>{saida2 ? format(parseISO(saida2.horario_registro), 'HH:mm') : ''}</td>
                                    <td>{totalDiaDisplay}</td>
                                    <td>{observacoes}</td>
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