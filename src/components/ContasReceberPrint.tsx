import React from 'react';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ContasReceberPrintProps {
    data: any[];
    activeTab: string;
    filtroPeriodo: DateRange | undefined;
}

const TAB_TITLES: Record<string, string> = {
    'parcela_sintetica': 'Resumo dos Lançamentos',
    'parcelas': 'Detalhamento de Todas as Parcelas',
    'recebimentos': 'Histórico de Parcelas Recebidas',
};

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const ContasReceberPrint: React.FC<ContasReceberPrintProps> = ({ data, activeTab, filtroPeriodo }) => {
    
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
    
    // Mapeamento de largura de coluna e alinhamento
    const getColumnStyle = (header: string) => {
        switch (header) {
            case 'ID Parcela':
            case 'ID Conta':
            case 'ID Recebimento':
                return { width: '10%', fontSize: '8pt' };
            case 'Cliente':
                return { width: '15%' };
            case 'Descrição':
                return { width: '25%' };
            case 'Nº Parcela':
                return { width: '5%', textAlign: 'center' as const };
            case 'Valor Parcela':
            case 'Valor Pago':
            case 'Valor Total':
            case 'Valor Recebido':
                return { width: '10%', textAlign: 'right' as const };
            case 'Vencimento':
            case 'Data Recebimento':
                return { width: '10%' };
            case 'Status':
            case 'Origem':
            case 'Forma Pagamento':
                return { width: '7%' };
            default:
                return {};
        }
    };
    
    // Colunas que precisam de cálculo de total
    const valueColumns = ['Valor Total', 'Valor Parcela', 'Valor Pago', 'Valor Recebido'];
    
    const totals: Record<string, number> = {};
    
    data.forEach(row => {
        headers.forEach(header => {
            if (valueColumns.includes(header)) {
                // Converte o valor para número, tratando strings formatadas (se houver)
                const rawValue = row[header];
                let numericValue = 0;
                
                if (typeof rawValue === 'number') {
                    numericValue = rawValue;
                } else if (typeof rawValue === 'string') {
                    // Tenta limpar a string (remove R$, pontos e substitui vírgula por ponto)
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
                <h1 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>RELATÓRIO DE CONTAS A RECEBER</h1>
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
                                    
                                    // Formata valores monetários para exibição
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
                        
                        {/* Linha de Totais */}
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
                                    if (header === 'Cliente' || header === 'Descrição') {
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

export default ContasReceberPrint;