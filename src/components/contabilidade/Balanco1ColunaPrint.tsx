import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ContaBalanco {
  id: string;
  Conta: string;
  Descricao: string;
  Analitica: 'Sim' | 'Não';
  saldo_final: number;
  tipo_principal: 'Ativo' | 'Passivo' | 'Patrimonio Liquido' | 'Resultado' | 'Outros';
}

interface Balanco1ColunaPrintProps {
  empresaNome: string;
  endDate: Date;
  contas: ContaBalanco[];
  totalAtivo: number;
  totalPassivo: number;
  totalPatrimonioLiquido: number;
  resultadoLiquido: number;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const Balanco1ColunaPrint: React.FC<Balanco1ColunaPrintProps> = ({
  empresaNome,
  endDate,
  contas,
  totalAtivo,
  totalPassivo,
  totalPatrimonioLiquido,
  resultadoLiquido,
}) => {
  
  const getContasPorTipo = (tipo: ContaBalanco['tipo_principal']) => {
    return contas.filter(c => c.tipo_principal === tipo);
  };
  
  const renderContas = (contasList: ContaBalanco[]) => {
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
  
  const renderHeader = (title: string) => (
    <div className="print-header" style={{ marginBottom: '15px' }}>
      <h1 style={{ fontSize: '18px', fontWeight: 'bold' }}>{title}</h1>
      <p style={{ fontSize: '14px' }}>Empresa: {empresaNome}</p>
      <p style={{ fontSize: '14px' }}>Data de Referência: {format(endDate, 'dd/MM/yyyy', { locale: ptBR })}</p>
    </div>
  );
  
  const renderSignatures = () => (
    <div className="print-signatures" style={{ marginTop: '50px', pageBreakBefore: 'avoid' }}>
        <div className="print-signature-line">Assinatura do Contador</div>
        <div className="print-signature-line">Assinatura da Empresa ({empresaNome})</div>
    </div>
  );
  
  const renderTable = (title: string, contasList: ContaBalanco[], total: number, totalLabel: string, showTotalPassivoPL: boolean = false) => (
    <div className="print-section" style={{ pageBreakBefore: 'always' }}>
        {renderHeader(title)}
        <table className="print-table" style={{ width: '100%' }}>
            <thead>
                <tr>
                    <th style={{ width: '20%' }}>Conta</th>
                    <th style={{ width: '55%' }}>Descrição</th>
                    <th style={{ width: '25%', textAlign: 'right' }}>Saldo Final</th>
                </tr>
            </thead>
            <tbody>
                {renderContas(contasList)}
                <tr style={{ fontWeight: 'bold', borderTop: '2px solid #000', backgroundColor: '#e0e0e0' }}>
                    <td colSpan={2}>{totalLabel}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(total)}</td>
                </tr>
                {showTotalPassivoPL && (
                    <tr style={{ fontWeight: 'bold', borderTop: '2px solid #000', backgroundColor: '#c0c0c0' }}>
                        <td colSpan={2}>TOTAL PASSIVO + PL</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(totalPassivo + totalPatrimonioLiquido + resultadoLiquido)}</td>
                    </tr>
                )}
            </tbody>
        </table>
        {renderSignatures()}
    </div>
  );

  const ativoContas = getContasPorTipo('Ativo');
  const passivoContas = getContasPorTipo('Passivo');
  const plContas = getContasPorTipo('Patrimonio Liquido');
  const receitaContas = getContasPorTipo('Resultado').filter(c => c.Conta.startsWith('3'));
  const despesaContas = getContasPorTipo('Resultado').filter(c => c.Conta.startsWith('4') || c.Conta.startsWith('5'));
  
  const totalReceita = receitaContas.reduce((sum, c) => sum + c.saldo_final, 0);
  const totalDespesa = despesaContas.reduce((sum, c) => sum + c.saldo_final, 0);

  return (
    <div className="print-container">
      
      {/* 1. ATIVO */}
      {renderTable('BALANÇO PATRIMONIAL - ATIVO', ativoContas, totalAtivo, 'TOTAL DO ATIVO')}

      {/* 2. PASSIVO */}
      {renderTable('BALANÇO PATRIMONIAL - PASSIVO', passivoContas, totalPassivo, 'TOTAL DO PASSIVO')}
      
      {/* 3. PATRIMÔNIO LÍQUIDO */}
      {renderTable('BALANÇO PATRIMONIAL - PATRIMÔNIO LÍQUIDO', plContas, totalPatrimonioLiquido, 'TOTAL DO PATRIMÔNIO LÍQUIDO', true)}
      
      {/* 4. RECEITA */}
      {renderTable('DEMONSTRAÇÃO DO RESULTADO - RECEITAS', receitaContas, totalReceita, 'TOTAL DAS RECEITAS')}
      
      {/* 5. DESPESA */}
      {renderTable('DEMONSTRAÇÃO DO RESULTADO - DESPESAS', despesaContas, totalDespesa, 'TOTAL DAS DESPESAS')}
      
      {/* 6. RESUMO DRE (Opcional, mas útil) */}
      <div className="print-section" style={{ pageBreakBefore: 'always' }}>
        {renderHeader('DEMONSTRAÇÃO DO RESULTADO (DRE) - RESUMO')}
        <table className="print-table" style={{ width: '50%' }}>
            <tbody>
                <tr><th style={{ width: '75%' }}>Total Receitas</th><td style={{ textAlign: 'right', color: 'green' }}>{formatCurrency(totalReceita)}</td></tr>
                <tr><th>Total Despesas</th><td style={{ textAlign: 'right', color: 'red' }}>{formatCurrency(totalDespesa)}</td></tr>
                <tr style={{ fontWeight: 'bold', borderTop: '2px solid #000' }}>
                    <th>LUCRO / PREJUÍZO LÍQUIDO</th>
                    <td style={{ textAlign: 'right', color: resultadoLiquido >= 0 ? 'blue' : 'red' }}>{formatCurrency(resultadoLiquido)}</td>
                </tr>
            </tbody>
        </table>
        {renderSignatures()}
      </div>
    </div>
  );
};

export default Balanco1ColunaPrint;