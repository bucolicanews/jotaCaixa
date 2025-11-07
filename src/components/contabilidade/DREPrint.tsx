import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';

interface ContaDRE {
  id: string;
  Conta: string;
  Descricao: string;
  Analitica: 'Sim' | 'Não';
  saldo_final: number;
  tipo_dre: 'Receita' | 'Custo' | 'Despesa' | 'Resultado';
}

interface DREPrintProps {
  empresaNome: string;
  filtroPeriodo: DateRange;
  contas: ContaDRE[];
  totalReceita: number;
  totalCusto: number;
  totalDespesa: number;
  resultadoLiquido: number;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const DREPrint: React.FC<DREPrintProps> = ({
  empresaNome,
  filtroPeriodo,
  contas,
  totalReceita,
  totalCusto,
  totalDespesa,
  resultadoLiquido,
}) => {
    
    const getPeriodoDisplay = () => {
        const from = format(filtroPeriodo.from!, 'dd/MM/yyyy', { locale: ptBR });
        const to = filtroPeriodo.to ? format(filtroPeriodo.to, 'dd/MM/yyyy', { locale: ptBR }) : 'Hoje';
        return `Período: ${from} - ${to}`;
    };
    
    const renderContas = (contasList: ContaDRE[]) => {
        return contasList.map(c => {
            const isSintetica = c.Analitica === 'Não';
            const isZero = Math.abs(c.saldo_final) < 0.01;
            
            if (isZero && c.Analitica === 'Sim') return null;

            const level = c.Conta.split('.').filter(p => p.length > 0).length;
            const paddingLeft = (level - 1) * 10;

            return (
                <tr key={c.id} style={{ 
                    fontWeight: isSintetica ? 'bold' : 'normal', 
                    backgroundColor: isSintetica ? '#f0f0f0' : 'white',
                    fontSize: isSintetica ? '10pt' : '9pt',
                }}>
                    <td style={{ paddingLeft: `${paddingLeft}px`, width: '20%' }}>{c.Conta}</td>
                    <td style={{ width: '55%' }}>{c.Descricao}</td>
                    <td style={{ textAlign: 'right', width: '25%', color: c.saldo_final < 0 ? 'red' : 'inherit' }}>
                        {formatCurrency(c.saldo_final)}
                    </td>
                </tr>
            );
        });
    };
    
    const renderSection = (title: string, contasList: ContaDRE[], total: number, totalLabel: string, color: string) => {
        // Filtra contas nulas (analíticas com saldo zero)
        const renderedRows = renderContas(contasList).filter(row => row !== null);
        
        if (renderedRows.length === 0 && contasList.filter(c => c.Analitica === 'Não').length === 0) {
            return null; // Não renderiza a seção se não houver contas analíticas ou sintéticas com saldo
        }
        
        return (
            <div className="print-section" style={{ pageBreakBefore: 'avoid' }}>
                <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: color, marginBottom: '5px' }}>{title}</h2>
                <table className="print-table" style={{ width: '100%' }}>
                    <thead>
                        <tr>
                            <th style={{ width: '20%' }}>Conta</th>
                            <th style={{ width: '55%' }}>Descrição</th>
                            <th style={{ width: '25%', textAlign: 'right' }}>Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        {renderedRows}
                        <tr style={{ fontWeight: 'bold', borderTop: '2px solid #000', backgroundColor: '#e0e0e0' }}>
                            <td colSpan={2}>{totalLabel}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(total)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    };

    const receitas = contas.filter(c => c.tipo_dre === 'Receita');
    const custos = contas.filter(c => c.tipo_dre === 'Custo');
    const despesas = contas.filter(c => c.tipo_dre === 'Despesa');

    return (
        <div className="print-container">
            <div className="print-header">
                <h1 style={{ fontSize: '18px', fontWeight: 'bold' }}>DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE)</h1>
                <p style={{ fontSize: '14px' }}>Empresa: {empresaNome}</p>
                <p style={{ fontSize: '14px' }}>{getPeriodoDisplay()}</p>
            </div>

            {/* Seção de Receitas */}
            {renderSection('1. RECEITA BRUTA', receitas, totalReceita, 'TOTAL RECEITA BRUTA', 'green')}
            
            {/* Seção de Custos */}
            {renderSection('2. CUSTO DAS VENDAS (CMV/CPV)', custos, totalCusto, 'TOTAL CUSTOS', 'red')}
            
            {/* Resultado Bruto */}
            <div className="print-section" style={{ pageBreakBefore: 'avoid' }}>
                <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: 'blue', marginBottom: '5px' }}>RESULTADO BRUTO</h2>
                <table className="print-table" style={{ width: '100%' }}>
                    <tbody>
                        <tr style={{ fontWeight: 'bold', backgroundColor: '#e0e0e0' }}>
                            <td style={{ width: '75%' }}>RECEITA BRUTA - CUSTOS</td>
                            <td style={{ textAlign: 'right', width: '25%' }}>{formatCurrency(totalReceita - totalCusto)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            {/* Seção de Despesas */}
            {renderSection('3. DESPESAS OPERACIONAIS', despesas, totalDespesa, 'TOTAL DESPESAS', 'red')}
            
            {/* Resultado Líquido */}
            <div className="print-section" style={{ pageBreakBefore: 'avoid' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: resultadoLiquido >= 0 ? 'green' : 'red', marginBottom: '5px' }}>RESULTADO LÍQUIDO DO EXERCÍCIO</h2>
                <table className="print-table" style={{ width: '100%' }}>
                    <tbody>
                        <tr style={{ fontWeight: 'bold', borderTop: '2px solid #000', backgroundColor: '#c0c0c0' }}>
                            <td style={{ width: '75%' }}>RESULTADO BRUTO - DESPESAS</td>
                            <td style={{ textAlign: 'right', width: '25%' }}>{formatCurrency(resultadoLiquido)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default DREPrint;