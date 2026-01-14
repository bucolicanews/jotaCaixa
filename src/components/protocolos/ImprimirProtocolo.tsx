import { FC } from 'react';
import { Protocolo } from '@/types/protocolo';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSessao } from '@/hooks/use-sessao';

interface ImprimirProtocoloProps {
  protocolo: Protocolo;
}

export const ImprimirProtocolo: FC<ImprimirProtocoloProps> = ({ protocolo }) => {
  const { perfil } = useSessao();

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
    <div style={{ pageBreakInside: 'avoid', marginBottom: '10mm' }}>
      <table className="print-table" style={{ border: '2px solid #000' }}>
        <tbody>
          {/* CABEÇALHO */}
          <tr>
            <td colSpan={2} className="print-header-cell print-bg-light-gray" style={{ borderBottom: '2px solid #000' }}>
              <div style={{ fontSize: '16pt', fontWeight: 'bold' }}>PROTOCOLO DE ENTREGA</div>
              <div style={{ fontSize: '12pt', fontWeight: 'bold' }}>{numero}ª VIA - {numero === 1 ? 'EMPRESA' : 'CLIENTE'}</div>
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ padding: '1mm', borderBottom: '1px solid #000', fontSize: '10pt', textAlign: 'center' }}>
              <strong>{(perfil as any)?.razao_social || (perfil as any)?.nome || ''}</strong>
            </td>
          </tr>
          {/* Nº PROTOCOLO */}
          <tr>
            <td colSpan={2} className="print-bg-medium-gray" style={{ textAlign: 'center', padding: '2mm', borderBottom: '1px solid #000' }}>
              <div style={{ fontSize: '10pt' }}>Nº PROTOCOLO</div>
              <div style={{ fontSize: '16pt', fontWeight: 'bold' }}>{protocolo.numero_protocolo}</div>
            </td>
          </tr>
          {/* CLIENTE / DATA */}
          <tr>
            <td style={{ width: '50%', padding: '2mm', borderBottom: '1px solid #000', borderRight: '1px solid #000', fontSize: '10pt' }}>
              <strong>Cliente:</strong><br />{protocolo.tbl_clientes?.nome || 'N/A'}
            </td>
            <td style={{ width: '50%', padding: '2mm', borderBottom: '1px solid #000', fontSize: '10pt' }}>
              <strong>Data Criação:</strong><br />{formatarData(protocolo.data_criacao || protocolo.created_at)}
            </td>
          </tr>
          {/* TÍTULO */}
          <tr>
            <td colSpan={2} style={{ padding: '2mm', borderBottom: '1px solid #000', fontSize: '10pt' }}>
              <strong>Título:</strong> {protocolo.titulo || 'N/A'}
            </td>
          </tr>
          {/* OBSERVAÇÃO */}
          {protocolo.descricao && (
            <tr>
              <td colSpan={2} style={{ padding: '2mm', borderBottom: '1px solid #000', fontSize: '10pt' }}>
                <strong>Observação:</strong>
                <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', marginTop: '1mm' }}>{protocolo.descricao}</div>
              </td>
            </tr>
          )}
          {/* ANEXOS */}
          {protocolo.anexos && protocolo.anexos.length > 0 && (
            <tr>
              <td colSpan={2} style={{ padding: '2mm', borderBottom: '1px solid #000', fontSize: '9pt' }}>
                <strong>Anexos ({protocolo.anexos.length}):</strong>{' '}
                {protocolo.anexos.slice(0, 3).map((a, i) => {
                  const name = a.split('/').pop()?.split('-').slice(1).join('-') || `Anexo ${i + 1}`;
                  return name.substring(0, 20) + (i < Math.min(protocolo.anexos.length, 3) - 1 ? ', ' : '');
                })}
                {protocolo.anexos.length > 3 && ` +${protocolo.anexos.length - 3}`}
              </td>
            </tr>
          )}
          {/* ASSINATURAS */}
          <tr>
            <td style={{ width: '50%', padding: '2mm', borderRight: '1px solid #000', fontSize: '9pt', textAlign: 'center', color: 'black' }}>
              <strong>ENTREGUE POR</strong>
              <div style={{ marginTop: '15mm', borderTop: '1px solid #000', paddingTop: '5px' }}>
                {protocolo.usuario_criador_nome || 'Assinatura do Entregador'}
              </div>
              <span style={{ fontSize: '8pt', color: '#666' }}>Data: {formatarDataCurta(protocolo.data_impressao)}</span>
            </td>
            <td style={{ width: '50%', padding: '2mm', fontSize: '9pt', textAlign: 'center', color: 'black' }}>
              <strong>RECEBIDO POR</strong>
              <div style={{ marginTop: '15mm', borderTop: '1px solid #000', paddingTop: '5px' }}>
                {protocolo.nome_resp_recebimento || 'Assinatura do Recebedor'}
              </div>
              <span style={{ fontSize: '8pt', color: '#666' }}>Data: {formatarDataCurta(protocolo.data_recebimento)}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <Via numero={1} />
      <div style={{ borderBottom: '1px dashed #999', margin: '10mm 0', pageBreakAfter: 'always' }} />
      <Via numero={2} />
    </div>
  );
};