import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { formatCurrency } from '@/utils/formatters';

interface ExtratoRecord {
    id: string;
    data: string;
    descricao: string;
    valor: number;
    tipo: 'Entrada' | 'Saida';
    identificacao?: string | null;
    conta_contabil_id?: string | null;
    saldo_contas: { nome: string } | null;
}

interface ExtratosPrintProps {
    data: ExtratoRecord[];
    filtroPeriodo: DateRange | undefined;
    logoUrl: string | null;
    ownerName: string;
}

const ExtratosPrint: React.FC<ExtratosPrintProps> = ({ data, filtroPeriodo, logoUrl, ownerName }) => {
    
    const getPeriodoDisplay = () => {
        if (!filtroPeriodo?.from) return 'Todo o Período';
        
        const from = format(filtroPeriodo.from, 'dd/MM/yyyy', { locale: ptBR });
        const to = filtroPeriodo.to ? format(filtroPeriodo.to, 'dd/MM/yyyy', { locale: ptBR }) : 'Hoje';
        
        return `Período: ${from} - ${to}`;
    };
    
    const totalEntradas = data.filter(e => e.tipo === 'Entrada').reduce((sum, e) => sum + Math.abs(e.valor), 0);
    const totalSaidas = data.filter(e => e.tipo === 'Saida').reduce((sum, e) => sum + Math.abs(e.valor), 0);
    const variacaoLiquida = totalEntradas - totalSaidas;

    return (
        <div className="print-container">
            <div className="print-header">
                {logoUrl && <img src={logoUrl} alt={ownerName} className="print-logo" />}
                <div className="print-header-content">
                    <h1 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>RELATÓRIO DE EXTRATOS BANCÁRIOS</h1>
                    <p style={{ fontSize: '10px', color: '#555' }}>Empresa: {ownerName}</p>
                    <p style={{ fontSize: '10px', color: '#555' }}>{getPeriodoDisplay()} | Gerado em: {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
                </div>
            </div>

            <div className="print-section" style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Resumo do Período</h2>
                <table className="print-table" style={{ width: '100%', border: 'none' }}>
                    <tbody>
                        <tr>
                            <th style={{ width: '30%', textAlign: 'left', border: 'none', padding: '5px 0' }}>Total de Entradas</th>
                            <td style={{ width: '20%', textAlign: 'right', color: 'green', border: 'none', padding: '5px 0' }}>{formatCurrency(totalEntradas)}</td>
                            <th style={{ width: '30%', textAlign: 'left', border: 'none', padding: '5px 0' }}>Total de Saídas</th>
                            <td style={{ width: '20%', textAlign: 'right', color: 'red', border: 'none', padding: '5px 0' }}>{formatCurrency(totalSaidas)}</td>
                        </tr>
                        <tr style={{ borderTop: '1px solid #000' }}>
                            <th colSpan={3} style={{ textAlign: 'left', padding: '5px 0' }}>Variação Líquida</th>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '5px 0', color: variacaoLiquida >= 0 ? 'blue' : 'red' }}>{formatCurrency(variacaoLiquida)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="print-section">
                <h2 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Transações Detalhadas ({data.length})</h2>
                <table className="print-table">
                    <thead>
                        <tr>
                            <th style={{ width: '10%' }}>Data</th>
                            <th style={{ width: '15%' }}>Conta/Caixa</th>
                            <th style={{ width: '35%' }}>Descrição</th>
                            <th style={{ width: '10%' }}>Identificação</th>
                            <th style={{ width: '10%', textAlign: 'center' }}>Tipo</th>
                            <th style={{ width: '10%', textAlign: 'right' }}>Valor</th>
                            <th style={{ width: '10%' }}>Contábil</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((e, index) => (
                            <tr key={index}>
                                <td>{format(parseISO(e.data), 'dd/MM/yyyy')}</td>
                                <td>{e.saldo_contas?.nome || 'N/A'}</td>
                                <td>{e.descricao}</td>
                                <td>{e.identificacao || '-'}</td>
                                <td style={{ textAlign: 'center' }}>{e.tipo}</td>
                                <td style={{ textAlign: 'right', color: e.tipo === 'Entrada' ? 'green' : 'red' }}>{formatCurrency(Math.abs(e.valor))}</td>
                                <td>{e.conta_contabil_id || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ExtratosPrint;