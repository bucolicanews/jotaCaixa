import React from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { formatCurrency, formatarData } from '@/utils/formatters';

interface ContaRazao {
    id: string;
    Conta: string;
    Descricao: string;
    natureza_contabil: 'Devedora' | 'Credora';
}

interface LancamentoRazao {
    data_movimentacao: string;
    descricao: string;
    valor: number;
    tipo: 'Entrada' | 'Saida';
    origem: string;
    saldo_anterior: number;
    saldo_acumulado: number;
}

interface RazaoPrintProps {
  filtroPeriodo: DateRange;
  contas: ContaRazao[];
  lancamentosPorConta: Record<string, LancamentoRazao[]>;
}

const RazaoPrint: React.FC<RazaoPrintProps> = ({
  filtroPeriodo,
  contas,
  lancamentosPorConta,
}) => {
    
    const getPeriodoDisplay = () => {
        const from = format(filtroPeriodo.from!, 'dd/MM/yyyy', { locale: ptBR });
        const to = filtroPeriodo.to ? format(filtroPeriodo.to, 'dd/MM/yyyy', { locale: ptBR }) : 'Hoje';
        return `Período: ${from} - ${to}`;
    };

    return (
        <div className="print-container">
            <div className="print-header">
                <h1 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>LIVRO RAZÃO</h1>
                <p style={{ fontSize: '10px', color: '#555' }}>{getPeriodoDisplay()} | Gerado em: {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
            </div>

            <div className="print-section space-y-8">
                {contas.map(conta => {
                    const lancamentos = lancamentosPorConta[conta.id] || [];
                    const saldoInicial = lancamentos.length > 0 ? lancamentos[0].saldo_anterior : 0;
                    const saldoFinal = lancamentos.length > 0 ? lancamentos[lancamentos.length - 1].saldo_acumulado : saldoInicial;
                    
                    const totalDebito = lancamentos.filter(l => l.tipo === 'Entrada').reduce((sum, l) => sum + l.valor, 0);
                    const totalCredito = lancamentos.filter(l => l.tipo === 'Saida').reduce((sum, l) => sum + l.valor, 0);
                    
                    return (
                        <div key={conta.id} style={{ marginBottom: '30px', pageBreakInside: 'avoid' }}>
                            <h2 style={{ fontSize: '14px', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '5px' }}>
                                {conta.Conta} - {conta.Descricao} 
                                <span style={{ float: 'right', fontWeight: 'normal', fontSize: '10pt' }}>Natureza: {conta.natureza_contabil}</span>
                            </h2>
                            
                            <table className="print-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '10%' }}>Data</th>
                                        <th style={{ width: '10%' }}>Origem</th>
                                        <th style={{ width: '30%' }}>Descrição</th>
                                        <th style={{ width: '15%', textAlign: 'right' }}>Débito</th>
                                        <th style={{ width: '15%', textAlign: 'right' }}>Crédito</th>
                                        <th style={{ width: '20%', textAlign: 'right' }}>Saldo Acumulado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Linha de Saldo Inicial */}
                                    <tr style={{ fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>
                                        <td colSpan={5}>SALDO INICIAL</td>
                                        <td style={{ textAlign: 'right', color: saldoInicial < 0 ? 'red' : 'blue' }}>
                                            {formatCurrency(saldoInicial)}
                                        </td>
                                    </tr>
                                    
                                    {lancamentos.map((l, index) => (
                                        <tr key={index}>
                                            <td>{formatarData(l.data_movimentacao)}</td>
                                            <td style={{ fontSize: '8pt' }}>{l.origem}</td>
                                            <td style={{ fontSize: '9pt' }}>{l.descricao}</td>
                                            <td style={{ textAlign: 'right', color: 'red' }}>{l.tipo === 'Entrada' ? formatCurrency(l.valor) : '-'}</td>
                                            <td style={{ textAlign: 'right', color: 'green' }}>{l.tipo === 'Saida' ? formatCurrency(l.valor) : '-'}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 'medium', color: l.saldo_acumulado < 0 ? 'red' : 'blue' }}>
                                                {formatCurrency(l.saldo_acumulado)}
                                            </td>
                                        </tr>
                                    ))}
                                    
                                    {/* Linha de Totais do Período */}
                                    <tr style={{ fontWeight: 'bold', borderTop: '1px solid #000', backgroundColor: '#e0e0e0' }}>
                                        <td colSpan={3}>TOTAIS DO PERÍODO</td>
                                        <td style={{ textAlign: 'right', color: 'red' }}>{formatCurrency(totalDebito)}</td>
                                        <td style={{ textAlign: 'right', color: 'green' }}>{formatCurrency(totalCredito)}</td>
                                        <td style={{ textAlign: 'right' }}></td>
                                    </tr>
                                    
                                    {/* Linha de Saldo Final */}
                                    <tr style={{ fontWeight: 'bold', borderTop: '2px solid #000', backgroundColor: '#c0c0c0' }}>
                                        <td colSpan={5}>SALDO FINAL</td>
                                        <td style={{ textAlign: 'right', fontSize: '11pt', color: saldoFinal < 0 ? 'red' : 'blue' }}>
                                            {formatCurrency(saldoFinal)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    );
                })}
            </div>
            
            <div className="print-signatures" style={{ marginTop: '50px' }}>
                <div className="print-signature-line">Assinatura do Contador</div>
                <div className="print-signature-line">Assinatura da Empresa</div>
            </div>
        </div>
    );
};

export default RazaoPrint;