import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Cliente } from '@/types/cliente';
import { EmpresaSistema } from '@/pages/Clientes'; // Importando o tipo EmpresaSistema

interface ClientesPrintProps {
    data: (Cliente | EmpresaSistema)[];
    titulo: string;
    isSupervisao: boolean;
    activeTab: 'clientes_cr' | 'empresas_sistema';
    activeEmpresaTab?: 'pendentes' | 'ativos' | 'inativos' | 'avulsos';
    logoUrl: string | null; // NOVO PROP
    ownerName: string; // NOVO PROP
}

const ClientesPrint: React.FC<ClientesPrintProps> = ({ data, titulo, isSupervisao, activeTab, activeEmpresaTab, logoUrl, ownerName }) => {
    
    if (data.length === 0) {
        return <div>Nenhum dado para imprimir.</div>;
    }
    
    const getStatusDisplay = (empresa: EmpresaSistema) => {
        if (!empresa.aprovado) return 'Pendente';
        if (empresa.data_fim_acesso === null && empresa.aprovado) return 'Bloqueado';
        
        const dataFimAcesso = empresa.data_fim_acesso ? new Date(empresa.data_fim_acesso) : null;
        const isAtivo = dataFimAcesso && dataFimAcesso >= new Date();
        
        if (empresa.tipo_cliente?.endsWith('_Avulso')) return 'Avulso';
        if (isAtivo) return 'Ativo';
        return 'Expirado';
    };

    const renderClientesCRTable = () => (
        <table className="print-table">
            <thead>
                <tr>
                    <th style={{ width: '20%' }}>Nome Fantasia</th>
                    <th style={{ width: '20%' }}>Razão Social</th>
                    <th style={{ width: '15%' }}>Documento</th>
                    <th style={{ width: '20%' }}>Email</th>
                    <th style={{ width: '10%' }}>Telefone</th>
                    {isSupervisao && <th style={{ width: '10%' }}>Proprietário</th>}
                </tr>
            </thead>
            <tbody>
                {data.map((c) => {
                    const cliente = c as Cliente;
                    return (
                        <tr key={cliente.id}>
                            <td>{cliente.nome_fantasia || cliente.nome}</td>
                            <td>{cliente.razao_social || '-'}</td>
                            <td>{cliente.documento || '-'}</td>
                            <td>{cliente.email || '-'}</td>
                            <td>{cliente.telefone || '-'}</td>
                            {isSupervisao && <td style={{ fontSize: '8pt' }}>{cliente.proprietario_id || 'N/A'}</td>}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );

    const renderEmpresasSistemaTable = () => (
        <table className="print-table">
            <thead>
                <tr>
                    <th style={{ width: '25%' }}>Nome da Empresa</th>
                    <th style={{ width: '25%' }}>Email (Login)</th>
                    <th style={{ width: '15%' }}>Plano</th>
                    <th style={{ width: '15%' }}>Acesso Expira</th>
                    <th style={{ width: '20%' }}>Status</th>
                </tr>
            </thead>
            <tbody>
                {data.map((e) => {
                    const empresa = e as EmpresaSistema;
                    const status = getStatusDisplay(empresa);
                    const dataExpiracaoDisplay = empresa.data_fim_acesso ? format(new Date(empresa.data_fim_acesso), 'dd/MM/yyyy') : 'N/A';
                    
                    return (
                        <tr key={empresa.id}>
                            <td>{empresa.nome}</td>
                            <td>{empresa.email}</td>
                            <td>{empresa.plano_id || 'N/A'}</td>
                            <td>{dataExpiracaoDisplay}</td>
                            <td>{status}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );

    // Usando isSupervisao e activeEmpresaTab no título para garantir que sejam lidos
    const subTitulo = activeTab === 'empresas_sistema' && activeEmpresaTab 
        ? ` - Status: ${activeEmpresaTab.charAt(0).toUpperCase() + activeEmpresaTab.slice(1)}`
        : '';
        
    const finalTitulo = titulo + (isSupervisao ? ' (Modo Supervisão)' : '') + subTitulo;

    return (
        <div className="print-container">
            <div className="print-header">
                {logoUrl && <img src={logoUrl} alt={ownerName} className="print-logo" />}
                <div className="print-header-content">
                    <h1>{finalTitulo}</h1>
                    <p>Empresa: {ownerName} | Gerado em: {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
                </div>
            </div>

            <div className="print-section">
                {activeTab === 'clientes_cr' ? renderClientesCRTable() : renderEmpresasSistemaTable()}
            </div>
        </div>
    );
};

export default ClientesPrint;