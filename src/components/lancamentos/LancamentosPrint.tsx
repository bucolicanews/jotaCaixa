import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrency, formatarData } from '@/utils/formatters';

interface LancamentoDetalhado {
    id: string;
    data_movimentacao: string;
    valor: number;
    tipo: 'Entrada' | 'Saida';
    descricao: string;
    origem: string;
    plano_contas: { Conta: string, Descricao: string } | null;
    saldo_contas: { nome: string } | null;
}

interface LancamentosPrintProps {
    lancamentos: LancamentoDetalhado[];
    ownerName: string;
    logoUrl: string | null;
}

const getOrigemDisplay = (origem: string) => {
    switch (origem) {
        case 'lancamento_manual': return 'Manual';
        case 'conciliacao_extrato': return 'Conciliação';
        case 'lancamento_cr': return 'CR (Inicial)';
        case 'recebimento_manual': return 'CR (Recebimento)';
        case 'lancamento_cp': return 'CP (Inicial)';
        case 'pagamento_manual': return 'CP (Pagamento)';
        case 'assinatura_stripe': return 'Assinatura';
        case 'movimentacao_direta': return 'Mov. Direta';
        case 'estorno_direto': return 'Estorno';
        case 'movimentacao_direta_estornada': return 'Estornada';
        case 'ignorado_manual': return 'Ignorado';
        default: return origem;
    }
};

const LancamentosPrint: React.FC<LancamentosPrintProps> = ({ lancamentos, ownerName, logoUrl }) => {
    
    // CRÍTICO: Filtra lançamentos ignorados antes de calcular totais e exibir
    const lancamentosValidos = lancamentos.filter(l => l.origem !== 'ignorado_manual');
    
    const totalDebito = lancamentosValidos.filter(l => l.tipo === 'Entrada' && l.origem !== 'estorno_direto').reduce((sum, l) => sum + l.valor, 0);
    const totalCredito = lancamentosValidos.filter(l => l.tipo === 'Saida' && l.origem !== 'estorno_direto').reduce((sum, l) => sum + l.valor, 0);

    return (
        <div className="print-container">
            <div className="print-header">
                {logoUrl && <img src={logoUrl} alt={ownerName} className="print-logo" />}
                <div className="print-header-content">
                    <h1 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>RELATÓRIO DE TODOS OS LANÇAMENTOS</h1>
                    <p style={{ fontSize: '10px', color: '#555' }}>Empresa: {ownerName} | Gerado em: {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
                </div>
            </div>

            <div className="print-section" style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Resumo do Movimento (Lançamentos Válidos)</h2>
                <table className="print-table" style={{ width: '100%', border: 'none' }}>
                    <tbody>
                        <tr>
                            <th style={{ width: '30%', textAlign: 'left', border: 'none', padding: '5px 0' }}>Total Débito</th>
                            <td style={{ width: '20%', textAlign: 'right', color: 'red', border: 'none', padding: '5px 0', fontWeight: 'bold' }}>{formatCurrency(totalDebito)}</td>
                            <th style={{ width: '30%', textAlign: 'left', border: 'none', padding: '5px 0' }}>Total Crédito</th>
                            <td style={{ width: '20%', textAlign: 'right', color: 'green', border: 'none', padding: '5px 0', fontWeight: 'bold' }}>{formatCurrency(totalCredito)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="print-section">
                <h2 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Lançamentos Detalhados ({lancamentosValidos.length})</h2>
                <table className="print-table">
                    <thead>
                        <tr>
                            <th style={{ width: '10%' }}>Data</th>
                            <th style={{ width: '10%' }}>Tipo</th>
                            <th style={{ width: '10%', textAlign: 'right' }}>Valor</th>
                            <th style={{ width: '30%' }}>Descrição</th>
                            <th style={{ width: '20%' }}>Conta Contábil</th>
                            <th style={{ width: '10%' }}>Origem</th>
                            <th style={{ width: '10%' }}>Conta Caixa</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lancamentosValidos.map((l) => {
                            const isDebito = l.tipo === 'Entrada';
                            const contaDisplay = l.plano_contas ? `${l.plano_contas.Conta} - ${l.plano_contas.Descricao}` : 'N/A';
                            const origemDisplay = getOrigemDisplay(l.origem);
                            
                            return (
                                <tr key={l.id} style={{ opacity: l.origem === 'movimentacao_direta_estornada' ? 0.5 : 1 }}>
                                    <td>{formatarData(l.data_movimentacao)}</td>
                                    <td>{isDebito ? 'Débito' : 'Crédito'}</td>
                                    <td style={{ textAlign: 'right', color: isDebito ? 'red' : 'green' }}>{formatCurrency(l.valor)}</td>
                                    <td>{l.descricao}</td>
                                    <td style={{ fontSize: '8pt' }}>{contaDisplay}</td>
                                    <td style={{ fontSize: '8pt' }}>{origemDisplay}</td>
                                    <td style={{ fontSize: '8pt' }}>{l.saldo_contas?.nome || '-'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default LancamentosPrint;