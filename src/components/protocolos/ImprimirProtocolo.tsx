import { FC } from 'react';
import { Protocolo } from '@/types/protocolo';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ImprimirProtocoloProps {
  protocolo: Protocolo;
}

export const ImprimirProtocolo: FC<ImprimirProtocoloProps> = ({ protocolo }) => {
  const formatarData = (data: string | null | undefined) => {
    if (!data) return '___/___/____';
    try {
      return format(new Date(data), 'dd/MM/yyyy HH:mm', { locale: ptBR });
    } catch {
      return '___/___/____';
    }
  };

  const formatarDataCurta = (data: string | null | undefined) => {
    if (!data) return '___/___/____';
    try {
      return format(new Date(data), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return '___/___/____';
    }
  };

  const Via = ({ numero }: { numero: number }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', marginBottom: '2mm' }}>
      <tbody>
        <tr>
          <td colSpan={2} style={{ textAlign: 'center', borderBottom: '2px solid #000', padding: '2mm', background: '#f0f0f0' }}>
            <div style={{ fontSize: '14pt', fontWeight: 'bold' }}>PROTOCOLO DE ENTREGA</div>
            <div style={{ fontSize: '10pt', fontWeight: 'bold' }}>{numero}ª VIA - {numero === 1 ? 'EMPRESA' : 'CLIENTE'}</div>
          </td>
        </tr>
        <tr>
          <td colSpan={2} style={{ textAlign: 'center', padding: '2mm', borderBottom: '1px solid #000', background: '#e8e8e8' }}>
            <div style={{ fontSize: '8pt' }}>Nº PROTOCOLO</div>
            <div style={{ fontSize: '14pt', fontWeight: 'bold' }}>{protocolo.numero_protocolo}</div>
          </td>
        </tr>
        <tr>
          <td style={{ width: '50%', padding: '2mm', borderBottom: '1px solid #000', borderRight: '1px solid #000', fontSize: '9pt' }}>
            <strong>Cliente:</strong><br />{protocolo.tbl_clientes?.nome || 'N/A'}
          </td>
          <td style={{ width: '50%', padding: '2mm', borderBottom: '1px solid #000', fontSize: '9pt' }}>
            <strong>Data Criação:</strong><br />{formatarData(protocolo.data_criacao || protocolo.created_at)}
          </td>
        </tr>
        <tr>
          <td colSpan={2} style={{ padding: '2mm', borderBottom: '1px solid #000', fontSize: '9pt' }}>
            <strong>Título:</strong> {protocolo.titulo || 'N/A'}
          </td>
        </tr>
        {protocolo.descricao && (
          <tr>
            <td colSpan={2} style={{ padding: '2mm', borderBottom: '1px solid #000', fontSize: '9pt' }}>
              <strong>Observação:</strong>
              <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', marginTop: '1mm' }}>
                {protocolo.descricao}
              </div>
            </td>
          </tr>
        )}
        {protocolo.anexos && protocolo.anexos.length > 0 && (
          <tr>
            <td colSpan={2} style={{ padding: '2mm', borderBottom: '1px solid #000', fontSize: '8pt' }}>
              <strong>Anexos ({protocolo.anexos.length}):</strong>{' '}
              {protocolo.anexos.slice(0, 3).map((a, i) => {
                const name = a.split('/').pop()?.split('-').slice(1).join('-') || `Anexo ${i+1}`;
                return name.substring(0, 20) + (i < Math.min(protocolo.anexos!.length, 3) - 1 ? ', ' : '');
              })}
              {protocolo.anexos.length > 3 && ` +${protocolo.anexos.length - 3}`}
            </td>
          </tr>
        )}
        <tr>
          <td style={{ width: '50%', padding: '2mm', borderRight: '1px solid #000', fontSize: '8pt', textAlign: 'center' }}>
            <strong>ENTREGUE POR</strong><br />
            {protocolo.usuario_criador_nome || '_____________________'}<br />
            <span style={{ fontSize: '7pt', color: '#666' }}>Data: {formatarDataCurta(protocolo.data_impressao)}</span>
          </td>
          <td style={{ width: '50%', padding: '2mm', fontSize: '8pt', textAlign: 'center' }}>
            <strong>RECEBIDO POR</strong><br />
            {protocolo.nome_resp_recebimento || '_____________________'}<br />
            <span style={{ fontSize: '7pt', color: '#666' }}>Data: {formatarDataCurta(protocolo.data_recebimento)}</span>
          </td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body, html { margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden; }
          #print-protocolo, #print-protocolo * { visibility: visible; }
          #print-protocolo { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100%; 
            background: #fff;
          }
          .no-print { display: none !important; }
        }
        @media screen {
          #print-protocolo {
            max-width: 210mm;
            margin: 0 auto;
            padding: 10px;
            background: #fff;
          }
        }
      `}</style>
      
      <div id="print-protocolo">
        <Via numero={1} />
        <div style={{ borderBottom: '1px dashed #999', margin: '1mm 0' }} />
        <Via numero={2} />
      </div>
    </>
  );
};
