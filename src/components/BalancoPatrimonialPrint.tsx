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
  sub_tipo: 'Circulante' | 'Nao Circulante' | 'N/A';
}

interface BalancoPatrimonialPrintProps {
  empresaNome: string;
  endDate: Date;
  contas: ContaBalanco[]; // Contas já filtradas (se for o caso)
  totalAtivo: number;
  totalPassivoPL: number;
  isBalanced: boolean;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const BalancoPatrimonialPrint: React.FC<BalancoPatrimonialPrintProps> = ({
  empresaNome,
  endDate,
  contas,
  totalAtivo,
  totalPassivoPL,
  isBalanced,
}) => {
  
  const getContasPorTipo = (tipo: ContaBalanco['tipo_principal']) => {
    return contas.filter(c => c.tipo_principal === tipo);
  };
  
  const renderContas = (contasList: ContaBalanco[]) => {
    return contasList.map(c => {
      const isSintetica = c.Analitica === 'Não';
      const isZero = Math.abs(c.saldo_final) < 0.01;
      
      if (isZero && isSintetica) return null;

      // Calcula o nível de indentação baseado no código da conta (ex: 1.1.1.1)
      const level = c.Conta.split('.').filter(p => p.length > 0).length;
      const paddingLeft = (level - 1) * 10; // 10px por nível

      return (
        <tr key={c.id} style={{ 
            fontWeight: isSintetica ? 'bold' : 'normal', 
            backgroundColor: isSintetica ? '#f0f0f0' : 'white',
            fontSize: isSintetica ? '10pt' : '9pt',
        }}>
          <td style={{ paddingLeft: `${paddingLeft}px`, width: '15%' }}>{c.Conta}</td>
          <td style={{ width: '60%' }}>{c.Descricao}</td>
          <td style={{ textAlign: 'right', width: '25%', color: c.saldo_final < 0 ? 'red' : 'inherit' }}>
            {formatCurrency(c.saldo_final)}
          </td>
        </tr>
      );
    });
  };
  
  const renderHierarquiaPrint = (contas: ContaBalanco[], tipoPrincipal: 'Ativo' | 'Passivo') => {
    const circulante = contas.filter(c => c.sub_tipo === 'Circulante');
    const naoCirculante = contas.filter(c => c.sub_tipo === 'Nao Circulante');
    
    const totalCirculante = circulante.reduce((sum, c) => sum + c.saldo_final, 0);
    const totalNaoCirculante = naoCirculante.reduce((sum, c) => sum + c.saldo_final, 0);
    
    const renderGroup = (group: ContaBalanco[], title: string, total: number) => {
        if (group.length === 0) return null;
        
        // Filtra contas sintéticas que não têm saldo e contas analíticas com saldo zero
        const filteredGroup = group.filter(c => {
            const isSintetica = c.Analitica === 'Não';
            const isZero = Math.abs(c.saldo_final) < 0.01;
            
            if (isSintetica && isZero) return false;
            
            return true;
        });
        
        if (filteredGroup.length === 0) return null;

        return (
            <>
                <tr style={{ fontWeight: 'bold', backgroundColor: '#e0e0e0' }}>
                    <td colSpan={2} style={{ paddingLeft: '10px' }}>{title}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(total)}</td>
                </tr>
                {renderContas(group)}
            </>
        );
    };

    return (
        <>
            {renderGroup(circulante, `${tipoPrincipal} Circulante`, totalCirculante)}
            {renderGroup(naoCirculante, `${tipoPrincipal} Não Circulante`, totalNaoCirculante)}
        </>
    );
  };
  
  const totalPassivo = getContasPorTipo('Passivo').reduce((sum, c) => sum + c.saldo_final, 0);

  return (
    <div className="print-container">
      <div className="print-header">
        <h1 style={{ fontSize: '18px', fontWeight: 'bold' }}>BALANÇO PATRIMONIAL</h1>
        <p style={{ fontSize: '14px' }}>Empresa: {empresaNome}</p>
        <p style={{ fontSize: '14px' }}>Data de Referência: {format(endDate, 'dd/MM/yyyy', { locale: ptBR })}</p>
        <p style={{ fontSize: '14px', color: isBalanced ? 'green' : 'red' }}>Status: {isBalanced ? 'Equilibrado' : 'Desequilibrado'}</p>
      </div>

      <div className="print-section" style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
        
        {/* Lado Esquerdo: ATIVO */}
        <div style={{ flex: 1, border: '1px solid #000', padding: '10px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'green', marginBottom: '10px' }}>ATIVO</h2>
          <table className="print-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: '15%' }}>Conta</th>
                <th style={{ width: '60%' }}>Descrição</th>
                <th style={{ width: '25%', textAlign: 'right' }}>Saldo Final</th>
              </tr>
            </thead>
            <tbody>
              {renderHierarquiaPrint(getContasPorTipo('Ativo'), 'Ativo')}
              <tr style={{ fontWeight: 'bold', borderTop: '2px solid #000', backgroundColor: '#e0e0e0' }}>
                <td colSpan={2}>TOTAL DO ATIVO</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(totalAtivo)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Lado Direito: PASSIVO + PL */}
        <div style={{ flex: 1, border: '1px solid #000', padding: '10px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'red', marginBottom: '10px' }}>PASSIVO E PATRIMÔNIO LÍQUIDO</h2>
          <table className="print-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: '15%' }}>Conta</th>
                <th style={{ width: '60%' }}>Descrição</th>
                <th style={{ width: '25%', textAlign: 'right' }}>Saldo Final</th>
              </tr>
            </thead>
            <tbody>
              {renderHierarquiaPrint(getContasPorTipo('Passivo'), 'Passivo')}
              <tr style={{ fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>
                <td colSpan={2}>TOTAL DO PASSIVO</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(totalPassivo)}</td>
              </tr>
              
              <tr style={{ fontWeight: 'bold', backgroundColor: '#e0e0e0' }}>
                <td colSpan={3} style={{ paddingLeft: '10px', paddingTop: '10px' }}>PATRIMÔNIO LÍQUIDO</td>
              </tr>
              {renderContas(getContasPorTipo('Patrimonio Liquido'))}
              {renderContas(getContasPorTipo('Resultado'))}
              
              <tr style={{ fontWeight: 'bold', borderTop: '2px solid #000', backgroundColor: '#e0e0e0' }}>
                <td colSpan={2}>TOTAL DO PASSIVO + PL</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(totalPassivoPL)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BalancoPatrimonialPrint;