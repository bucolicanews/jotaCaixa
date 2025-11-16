import React from 'react';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ContasPagarPrintProps {
    data: any[];
    activeTab: string;
    filtroPeriodo: DateRange | undefined;
    logoUrl: string | null; // NOVO PROP
    ownerName: string; // NOVO PROP
}

const TAB_TITLES: Record<string, string> = {
    'sintetico': 'Resumo dos Lançamentos a Pagar',
    'parcelas': 'Detalhamento de Todas as Parcelas a Pagar',
    'pagamentos': 'Histórico de Pagamentos Efetuados',
};

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const ContasPagarPrint: React.FC<ContasPagarPrintProps> = ({ data, activeTab, filtroPeriodo, logoUrl, ownerName }) => {
    
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
    
    // Mapeamento de largura de coluna em PORCENTAGEM (Ajustado para Paisagem)
    const getColumnStyle = (header: string) => {
        // Total de colunas no Sintético (8)
        if (activeTab === 'sintetico') {
            switch (header) {
                case 'ID Conta': return { width: '10%', fontSize: '8pt' }; // Aumentado para quebrar ID
                case 'Fornecedor': return { width: '12%' };
                case 'Descrição': return { width: '25%' };
                case 'Vencimento': return { width: '10%' };
                case 'Valor Total': return { width: '10%', textAlign: 'right' as const };
                case 'Progresso': return { width: '8%', textAlign: 'center' as const };
                case 'Status': return { width: '10%' };
                case 'Origem': return { width: '15%' };
                default: return {};
            }
        }
        // Total de colunas no Parcelas (10)
        if (activeTab === 'parcelas') {
            switch (header) {
                case 'ID Parcela': return { width: '8%', fontSize: '8pt' };
                case 'ID Conta': return { width: '8%', fontSize: '8pt' };
                case 'Fornecedor': return { width: '10%' };
                case 'Descrição': return { width: '15%' };
                case 'Nº Parcela': return { width: '5%', textAlign: 'center' as const };
                case 'Vencimento': return { width: '8%' };
                case 'Valor Parcela': return { width: '8%', textAlign: 'right' as const };
                case 'Vlr Pago': return { width: '8%', textAlign: 'right' as const };
                case 'Status': return { width: '8%' };
                case 'Origem': return { width: '12%' };
                default: return {};
            }
        }
        // Total de colunas no Pagamentos (7)
        if (activeTab === 'pagamentos') {
            switch (header) {
                case 'ID Pagamento': return { width: '10%', fontSize: '8pt' };
                case 'Data Pagamento': return { width: '12%' };
                case 'ID Conta': return { width: '10%', fontSize: '8pt' };
                case 'Fornecedor': return { width: '15%' };
                case 'Descrição': return { width: '25%' };
                case 'Valor Pago': return { width: '13%', textAlign: 'right' as const };
                case 'Conta Origem': return { width: '15%' };
                default: return {};
            }
        }
        
        return {};
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
                {logoUrl && <img src={logoUrl} alt={ownerName} className="print-logo" />}
                <div className="print-header-content">
                    <h1>RELATÓRIO DE CONTAS A PAGAR</h1>
                    <h2 style={{ fontSize: '12px', fontWeight: 'normal', marginBottom: '5px' }}>{TAB_TITLES[activeTab] || 'Relatório Personalizado'}</h2>
                    <p>{getPeriodoDisplay()} | Empresa: {ownerName} | Gerado em: {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
                </div>
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