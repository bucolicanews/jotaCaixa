import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ContratoGerado } from '@/types/contratos';

interface ContratosPrintProps {
    data: ContratoGerado[];
    titulo: string;
    isSupervisao: boolean;
}

const ContratosPrint: React.FC<ContratosPrintProps> = ({ data, titulo, isSupervisao }) => {
    
    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    const formatDate = (dateString: string) => format(new Date(dateString), 'dd/MM/yyyy', { locale: ptBR });
    
    if (data.length === 0) {
        return <div>Nenhum contrato para imprimir.</div>;
    }

    return (
        <div className="print-container">
            <div className="print-header">
                <h1 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>RELATÓRIO DE CONTRATOS</h1>
                <h2 style={{ fontSize: '12px', fontWeight: 'normal', marginBottom: '5px' }}>{titulo}</h2>
                <p style={{ fontSize: '10px', color: '#555' }}>Gerado em: {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
            </div>

            <div className="print-section">
                <table className="print-table">
                    <thead>
                        <tr>
                            <th style={{ width: '15%' }}>Cliente</th>
                            {isSupervisao && <th style={{ width: '15%' }}>Empresa Proprietária</th>}
                            <th style={{ width: '10%', textAlign: 'right' }}>Valor Total</th>
                            <th style={{ width: '10%' }}>Data Início</th>
                            <th style={{ width: '10%' }}>Status</th>
                            <th style={{ width: '40%' }}>Link Assinatura</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((c) => {
                            const clienteNome = (c as any).tbl_empresas_clientes?.nome || 'N/A'; // RENOMEADO
                            const empresaProprietaria = c.proprietario_id || 'Admin'; // Usando proprietario_id
                            
                            return (
                                <tr key={c.id}>
                                    <td>{clienteNome}</td>
                                    {isSupervisao && <td style={{ fontSize: '8pt' }}>{empresaProprietaria}</td>}
                                    <td style={{ textAlign: 'right' }}>{formatCurrency(c.valor_total)}</td>
                                    <td>{formatDate(c.data_inicio)}</td>
                                    <td>{c.status.charAt(0).toUpperCase() + c.status.slice(1)}</td>
                                    <td style={{ fontSize: '8pt', wordWrap: 'break-word', whiteSpace: 'normal' }}>
                                        {c.link_assinatura_externo || `Contrato ID: ${c.id}`}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ContratosPrint;