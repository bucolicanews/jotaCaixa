import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';

interface Lancamento {
  data_movimentacao: string;
  descricao: string;
  valor: number;
  tipo: 'Entrada' | 'Saida';
  saldo_contas: { nome: string } | null;
}

interface FluxoCaixaPrintProps {
  empresaId: string;
  lancamentos: Lancamento[];
  totalEntradas: number;
  totalSaidas: number;
  saldoFinalOuVariacao: number;
  tituloSaldoFinal: string;
  filtroPeriodo: DateRange | undefined;
  saldoInicialConta: number; // NOVO CAMPO
}

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatarData = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');

const FluxoCaixaPrint: React.FC<FluxoCaixaPrintProps> = ({
  lancamentos,
  totalEntradas,
  totalSaidas,
  saldoFinalOuVariacao,
  tituloSaldoFinal,
  filtroPeriodo,
  saldoInicialConta, // Usando o novo campo
}) => {
    
    const getPeriodoDisplay = () => {
        if (!filtroPeriodo?.from) return 'Todo o Período';
        
        const from = format(filtroPeriodo.from, 'dd/MM/yyyy', { locale: ptBR });
        const to = filtroPeriodo.to ? format(filtroPeriodo.to, 'dd/MM/yyyy', { locale: ptBR }) : 'Hoje';
        
        return `Período: ${from} - ${to}`;
    };

  return (
    <div className="print-container">
      <div className="print-header">
        <h1 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>RELATÓRIO DE FLUXO DE CAIXA</h1>
        <p style={{ fontSize: '10px', color: '#555' }}>{getPeriodoDisplay()} | Gerado em: {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
      </div>

      <div className="print-section" style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Resumo Financeiro</h2>
        <table className="print-table" style={{ width: '100%', border: 'none' }}>
            <tbody>
                {saldoInicialConta !== 0 && (
                    <tr>
                        <th style={{ width: '30%', textAlign: 'left', border: 'none', padding: '5px 0' }}>Saldo Inicial da Conta</th>
                        <td style={{ width: '20%', textAlign: 'right', border: 'none', padding: '5px 0', fontWeight: 'bold' }}>{formatCurrency(saldoInicialConta)}</td>
                        <td colSpan={2} style={{ border: 'none' }}></td>
                    </tr>
                )}
                <tr>
                    <th style={{ width: '30%', textAlign: 'left', border: 'none', padding: '5px 0' }}>Total de Entradas</th>
                    <td style={{ width: '20%', textAlign: 'right', color: 'green', border: 'none', padding: '5px 0' }}>{formatCurrency(totalEntradas)}</td>
                    <th style={{ width: '30%', textAlign: 'left', border: 'none', padding: '5px 0' }}>Total de Saídas</th>
                    <td style={{ width: '20%', textAlign: 'right', color: 'red', border: 'none', padding: '5px 0' }}>{formatCurrency(totalSaidas)}</td>
                </tr>
                <tr style={{ borderTop: '1px solid #000' }}>
                    <th colSpan={3} style={{ textAlign: 'left', padding: '5px 0' }}>{tituloSaldoFinal}</th>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '5px 0', color: saldoFinalOuVariacao >= 0 ? 'blue' : 'red' }}>{formatCurrency(saldoFinalOuVariacao)}</td>
                </tr>
            </tbody>
        </table>
      </div>

      <div className="print-section">
        <h2 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>Lançamentos Detalhados ({lancamentos.length})</h2>
        <table className="print-table">
          <thead>
            <tr>
              <th style={{ width: '15%' }}>Data</th>
              <th style={{ width: '20%' }}>Conta/Caixa</th>
              <th style={{ width: '40%' }}>Descrição</th>
              <th style={{ width: '10%', textAlign: 'center' }}>Tipo</th>
              <th style={{ width: '15%', textAlign: 'right' }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {lancamentos.map((l, index) => (
              <tr key={index}>
                <td>{formatarData(l.data_movimentacao)}</td>
                <td>{l.saldo_contas?.nome || 'N/A'}</td>
                <td>{l.descricao}</td>
                <td style={{ textAlign: 'center' }}>{l.tipo}</td>
                <td style={{ textAlign: 'right', color: l.tipo === 'Entrada' ? 'green' : 'red' }}>{formatCurrency(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FluxoCaixaPrint;