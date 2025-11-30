import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';

interface ContaBalancete {
  id: string;
  Conta: string;
  Descricao: string;
  Analitica: 'Sim' | 'Não';
  saldo_inicial: number;
  total_debito: number;
  total_credito: number;
  saldo_final: number;
  natureza_final: 'Devedora' | 'Credora';
}

interface TotaisBalancete {
    totalDebito: number;
    totalCredito: number;
    totalSaldoFinal: number;
}

interface BalancetePrintProps {
  empresaNome: string;
  filtroPeriodo: DateRange;
  contas: ContaBalancete[];
  totais: TotaisBalancete;
  logoUrl: string | null;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const BalancetePrint: React.FC<BalancetePrintProps> = ({
  empresaNome,
  filtroPeriodo,
  contas,
  totais,
  logoUrl,
}) => {
    
    const getPeriodoDisplay = () => {
        const from = format(filtroPeriodo.from!, 'dd/MM/yyyy', { locale: ptBR });
        const to = filtroPeriodo.to ? format(filtroPeriodo.to, 'dd/MM/yyyy', { locale: ptBR }) : 'Hoje';
        return `Período: ${from} - ${to}`;
    };

    return (
        <div className="print-container">
            <div className="print-header">
                {logoUrl && <img src={logoUrl} alt={empresaNome} className="print-logo" />}
                <div className="print-header-content">
                    <h1 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>BALANCETE DE VERIFICAÇÃO</h1>
                    <p style={{ fontSize: '10px', color: '#555' }}>Empresa: {empresaNome}</p>
                    <p style={{ fontSize: '10px', color: '#555' }}>{getPeriodoDisplay()} | Gerado em: {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
                </div>
            </div>

            <div className="print-section">
                <table className="print-table" style={{ width: '100%' }}>
                    <thead>
                        <tr>
                            <th style={{ width: '10%' }}>Conta</th>
                            <th style={{ width: '25%' }}>Descrição</th>
                            <th style={{ width: '10%', textAlign: 'center' }}>Natureza</th>
                            <th style={{ width: '15%', textAlign: 'right' }}>Saldo Inicial</th>
                            <th style={{ width: '15%', textAlign: 'right' }}>Débito (Mês)</th>
                            <th style={{ width: '15%', textAlign: 'right' }}>Crédito (Mês)</th>
                            <th style={{ width: '10%', textAlign: 'right' }}>Saldo Final</th>
                        </tr>
                    </thead>
                    <tbody>
                        {contas.map(c => {
                            const isSintetica = c.Analitica === 'Não';
                            const level = c.Conta.split('.').filter(p => p.length > 0).length;
                            const paddingLeft = (level - 1) * 10;
                            
                            return (
                                <tr key={c.id} style={{ 
                                    fontWeight: isSintetica ? 'bold' : 'normal', 
                                    backgroundColor: isSintetica ? '#f0f0f0' : 'white',
                                    fontSize: isSintetica ? '10pt' : '9pt',
                                }}>
                                    <td style={{ paddingLeft: `${paddingLeft}px` }}>{c.Conta}</td>
                                    <td>{c.Descricao}</td>
                                    <td style={{ textAlign: 'center', fontSize: '8pt' }}>{c.natureza_final}</td>
                                    <td style={{ textAlign: 'right' }}>{formatCurrency(c.saldo_inicial)}</td>
                                    <td style={{ textAlign: 'right', color: 'red' }}>{formatCurrency(c.total_debito)}</td>
                                    <td style={{ textAlign: 'right', color: 'green' }}>{formatCurrency(c.total_credito)}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: c.saldo_final < 0 ? 'red' : 'blue' }}>
                                        {formatCurrency(c.saldo_final)}
                                    </td>
                                </tr>
                            );
                        })}
                        
                        {/* Linha de Totais */}
                        <tr style={{ fontWeight: 'bold', borderTop: '2px solid #000', backgroundColor: '#c0c0c0' }}>
                            <td colSpan={4}>TOTAIS GERAIS</td>
                            <td style={{ textAlign: 'right', color: 'red' }}>{formatCurrency(totais.totalDebito)}</td>
                            <td style={{ textAlign: 'right', color: 'green' }}>{formatCurrency(totais.totalCredito)}</td>
                            <td style={{ textAlign: 'right', color: 'blue' }}>{formatCurrency(totais.totalSaldoFinal)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <div className="print-signatures">
                <div className="print-signature-line">Assinatura do Contador</div>
                <div className="print-signature-line">Assinatura da Empresa ({empresaNome})</div>
            </div>
        </div>
    );
};

export default BalancetePrint;