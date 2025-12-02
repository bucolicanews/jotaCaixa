import React from 'react';

interface ExportacaoCalimaPrintProps {
    skippedLaunches: string[];
    periodo: string;
}

const ExportacaoCalimaPrint: React.FC<ExportacaoCalimaPrintProps> = ({ skippedLaunches, periodo }) => {
    return (
        <div className="print-container">
            <div className="print-header">
                <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: 'red' }}>RELATÓRIO DE ERROS DE EXPORTAÇÃO CALIMA</h1>
                <p style={{ fontSize: '14px' }}>Motivo: Falta de Vínculo Contábil (Conta Saldo ou Conta Resultado)</p>
                <p style={{ fontSize: '14px' }}>Período Analisado: {periodo}</p>
                <p style={{ fontSize: '14px', marginTop: '10px' }}>Total de Lançamentos Ignorados: {skippedLaunches.length}</p>
            </div>

            <div className="print-section">
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>Detalhes dos Erros</h2>
                <ul style={{ listStyleType: 'disc', paddingLeft: '20px' }}>
                    {skippedLaunches.map((msg, index) => (
                        <li key={index} style={{ marginBottom: '5px', fontSize: '10pt' }}>
                            {msg}
                        </li>
                    ))}
                </ul>
            </div>
            
            <div className="print-section" style={{ marginTop: '30px' }}>
                <p style={{ fontWeight: 'bold' }}>Ação Necessária:</p>
                <p>Verifique se as contas de saldo em Bancos/Caixas e as contas de resultado em Plano de Contas estão corretamente vinculadas a contas analíticas.</p>
            </div>
        </div>
    );
};

export default ExportacaoCalimaPrint;