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
    
    // Mapeamento de largura de coluna para otimizar o A4
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

    return (
        <div className="print-container">
            <div className="print-header">
                <h1 style={{ fontSize: '18px', fontWeight: 'bold' }}>RELATÓRIO DE CONTAS A RECEBER</h1>
                <p style={{ fontSize: '14px' }}>{TAB_TITLES[activeTab] || 'Relatório Personalizado'}</p>
                <p style={{ fontSize: '12px', color: '#555' }}>{getPeriodoDisplay()}</p>
                <p style={{ fontSize: '12px', color: '#555' }}>Gerado em: {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
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
                                {headers.map(header => (
                                    <td key={header} style={getColumnStyle(header)}>
                                        {row[header]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ContasReceberPrint;