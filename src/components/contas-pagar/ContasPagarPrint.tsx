import React from 'react';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ContasPagarPrintProps {
    data: any[];
    activeTab: string;
    filtroPeriodo: DateRange | undefined;
}

const TAB_TITLES: Record<string, string> = {
    'sintetico': 'Resumo dos Lançamentos a Pagar',
    'parcelas': 'Detalhamento de Todas as Parcelas a Pagar',
    'pagamentos': 'Histórico de Pagamentos Efetuados',
};

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const ContasPagarPrint: React.FC<ContasPagarPrintProps> = ({ data, activeTab, filtroPeriodo }) => {
    
    const getPeriodoDisplay = () => {
        if (!filtroPeriodo?.from) return 'Todo o Período';
        
        const from = format(filtroPeriodo.from, 'dd/MM/yyyy', { locale: ptBR });
        const to = filtroPeriodo.to ? format(filtroPeriodo.to, 'dd/MM/yyyy', { locale: ptBR }) : 'Hoje';
        
        return `Período: ${from} - ${to}`;
    };
    
    if (data.length === 0) {
        return <div>Nenhum dado para imprimir.</div>;
    }
    
    const headers = Object.keys(data[0]);
    
    const getColumnStyle = (header: string) => {
        switch (header) {
            case 'ID Conta':
            case 'ID Parcela':
            case 'ID Pagamento':
                return { width: '8%', fontSize: '8pt' }; 
            case 'Fornecedor':
                return { width: '15%' };
            case 'Descrição':
                return { width: '25%' };
            case 'Nº Parcela':
                return { width: '5%', textAlign: 'center' as const };
            case 'Valor Parcela':
            case 'Vlr Pago':
            case 'Valor Total':
            case 'Valor Pago':
                return { width: '8%', textAlign: 'right' as const };
            case 'Vencimento':
            case 'Data Pagamento':
                return { width: '8%' };
            case 'Status':
            case 'Origem':
            case 'Forma Pagamento':
                return { width: '6%' };
            case 'Conta Origem':
                return { width: '8%' };
            case 'Progresso':
                return { width: '6%', textAlign: 'center' as const };
            default:
                return {};
        }
    };
    
    const valueColumns = ['Valor Total', 'Valor Parcela', 'Vlr Pago', 'Valor Pago'];
    
    const totals: Record<string, number> = {};
    
    data.forEach(row => {
        headers.forEach(header => {
            if (valueColumns.includes(header)) {
                const rawValue = row[header];
                let numericValue = 0;
                
                if (typeof rawValue === 'number') {
                    numericValue = rawValue;
                } else if (typeof rawValue === 'string') {
                    const cleaned = rawValue.replace(/[R$\.]/g, '').replace(',', '.').trim();
                    numericValue = parseFloat(cleaned) || 0;
                }
                
                totals[header] = (totals[header] || 0) + numericValue;
            }
        });
    });

    return (
        <div className="print-container">
            <div className="print-header">
                <h1 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>RELATÓRIO DE CONTAS A PAGAR</h1>
                <h2 style={{ fontSize: '12px', fontWeight: 'normal', marginBottom: '5px' }}>{TAB_TITLES[activeTab] || 'Relatório Personalizado'}</h2>
                <p style={{ fontSize: '10px', color: '#555' }}>{getPeriodoDisplay()} | Gerado em: {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
            </div>

            <div className="print-section">
                <table className="print-table">
                    <thead>
                        <tr>
                            {headers.map(header => (
                                <th key={header} style={getColumnStyle(header)}>
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, index) => (
                            <tr key={index}>
                                {headers.map(header => {
                                    let displayValue = row[header];
                                    const style = getColumnStyle(header);
                                    
                                    if (valueColumns.includes(header) && typeof row[header] === 'number') {
                                        displayValue = formatCurrency(row[header]);
                                    }
                                    
                                    return (
                                        <td key={header} style={style}>
                                            {displayValue}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                        
                        {Object.keys(totals).length > 0 && (
                            <tr style={{ fontWeight: 'bold', borderTop: '2px solid #000' }}>
                                {headers.map(header => {
                                    const style = getColumnStyle(header);
                                    if (valueColumns.includes(header)) {
                                        return (
                                            <td key={header} style={{ ...style, backgroundColor: '#e0e0e0' }}>
                                                {formatCurrency(totals[header])}
                                            </td>
                                        );
                                    }
                                    if (header === 'Fornecedor' || header === 'Descrição') {
                                        return <td key={header} style={{ ...style, textAlign: 'left', backgroundColor: '#e0e0e0' }}>TOTAL GERAL</td>;
                                    }
                                    return <td key={header} style={{ ...style, backgroundColor: '#e0e0e0' }}></td>;
                                })}
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ContasPagarPrint;