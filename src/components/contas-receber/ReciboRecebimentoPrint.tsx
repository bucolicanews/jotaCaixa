import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrency } from '@/utils/formatters';
import { CheckCircle, Building2 } from 'lucide-react';

interface ReciboData {
    parcelaId: string;
    numeroParcela: number;
    valorTotal: number;
    valorRecebido: number;
    dataPagamento: string;
    formaPagamento: string;
    descricaoConta: string;
    clienteNome: string;
    clienteDocumento: string;
    
    // Dados da Empresa (Admin/Cliente)
    ownerName: string;
    ownerDocumento: string;
    logoUrl: string | null;
}

interface ReciboRecebimentoPrintProps {
    data: ReciboData;
}

const ReciboRecebimentoPrint: React.FC<ReciboRecebimentoPrintProps> = ({ data }) => {
    
    const dataPagamentoFormatada = format(new Date(data.dataPagamento), 'dd/MM/yyyy', { locale: ptBR });
    const valorRecebidoFormatado = formatCurrency(data.valorRecebido);
    
    // Função para converter número em extenso (simplificada)
    const valorPorExtenso = (valor: number) => {
        // Implementação simplificada para fins de exemplo
        const [inteiro, decimal] = valor.toFixed(2).split('.');
        const extenso = `(${valorRecebidoFormatado} por extenso)`;
        return extenso;
    };

    return (
        <div className="print-container" style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
            
            {/* Cabeçalho da Empresa */}
            <div className="print-header" style={{ borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '20px', display: 'flex', alignItems: 'center' }}>
                {data.logoUrl ? (
                    <img src={data.logoUrl} alt={data.ownerName} className="print-logo" style={{ maxHeight: '50px', maxWidth: '150px', objectFit: 'contain', marginRight: '15px' }} />
                ) : (
                    <Building2 style={{ width: '40px', height: '40px', marginRight: '15px', color: '#1e40af' }} />
                )}
                <div style={{ flexGrow: 1 }}>
                    <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>{data.ownerName}</h1>
                    <p style={{ fontSize: '10px', color: '#555', margin: 0 }}>CNPJ/CPF: {data.ownerDocumento}</p>
                </div>
            </div>

            {/* Título do Recibo */}
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#16a34a', margin: 0 }}>RECIBO DE PAGAMENTO</h2>
                <p style={{ fontSize: '14px', color: '#555', margin: '5px 0 0 0' }}>Comprovante de Recebimento Nº {data.parcelaId.substring(0, 8)}</p>
            </div>

            {/* Corpo do Recibo */}
            <div style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '8px', backgroundColor: '#f9f9f9', marginBottom: '30px' }}>
                <p style={{ fontSize: '16px', lineHeight: '1.8' }}>
                    Recebemos de <strong>{data.clienteNome}</strong>, portador(a) do documento <strong>{data.clienteDocumento}</strong>, a importância de:
                </p>
                
                <div style={{ backgroundColor: '#e0f7e9', border: '2px solid #16a34a', padding: '15px', borderRadius: '6px', margin: '15px 0', textAlign: 'center' }}>
                    <p style={{ fontSize: '30px', fontWeight: 'bold', color: '#16a34a', margin: 0 }}>
                        {valorRecebidoFormatado}
                    </p>
                </div>
                
                <p style={{ fontSize: '14px', lineHeight: '1.6', fontStyle: 'italic', color: '#333' }}>
                    {valorPorExtenso(data.valorRecebido)}
                </p>
                
                <p style={{ fontSize: '16px', lineHeight: '1.8', marginTop: '20px' }}>
                    Referente à <strong>{data.descricaoConta}</strong>, Parcela Nº <strong>{data.numeroParcela}</strong>, quitada na data de <strong>{dataPagamentoFormatada}</strong>, através da forma de pagamento <strong>{data.formaPagamento}</strong>.
                </p>
            </div>

            {/* Rodapé e Assinatura */}
            <div style={{ textAlign: 'center', fontSize: '14px', color: '#333' }}>
                <p>
                    {data.ownerName}, {format(new Date(), 'dd')} de {format(new Date(), 'MMMM', { locale: ptBR })} de {format(new Date(), 'yyyy')}.
                </p>
                
                <div style={{ marginTop: '50px', borderTop: '1px solid #000', width: '50%', margin: '50px auto 0 auto', paddingTop: '5px' }}>
                    <p style={{ margin: 0, fontWeight: 'bold' }}>{data.ownerName}</p>
                    <p style={{ margin: 0, fontSize: '12px' }}>{data.ownerDocumento}</p>
                </div>
                
                <p style={{ marginTop: '30px', fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle style={{ width: '16px', height: '16px', marginRight: '5px', color: '#16a34a' }} />
                    Documento gerado eletronicamente.
                </p>
            </div>
        </div>
    );
};

export default ReciboRecebimentoPrint;