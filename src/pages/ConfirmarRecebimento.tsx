import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle, XCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface Protocolo {
  id: string;
  numero_protocolo: string;
  status: string;
  tbl_clientes: { nome: string } | null;
}

type ConfirmationStatus = 'idle' | 'loading' | 'success' | 'error' | 'already_confirmed';

const ConfirmarRecebimento = () => {
  const { id } = useParams<{ id: string }>();
  const [protocolo, setProtocolo] = useState<Protocolo | null>(null);
  const [status, setStatus] = useState<ConfirmationStatus>('idle');
  const [message, setMessage] = useState('');
  const [isLoadingPage, setIsLoadingPage] = useState(true);

  useEffect(() => {
    const fetchProtocolo = async () => {
      if (!id) {
        setMessage('ID do protocolo não fornecido.');
        setStatus('error');
        setIsLoadingPage(false);
        return;
      }

      try {
        // Busca o protocolo (usando RLS público para SELECT)
        const { data, error } = await supabase
          .from('protocolos')
          .select('id, numero_protocolo, status, tbl_clientes(nome)')
          .eq('id', id)
          .single();

        if (error || !data) {
          throw new Error('Protocolo não encontrado ou erro ao buscar.');
        }

        setProtocolo(data as Protocolo);
        if (data.status === 'Entregue') {
          setStatus('already_confirmed');
          setMessage('Este protocolo já foi confirmado anteriormente.');
        }
      } catch (error: any) {
        setStatus('error');
        setMessage(error.message);
      } finally {
        setIsLoadingPage(false);
      }
    };

    fetchProtocolo();
  }, [id]);

  const handleConfirm = async () => {
    if (!id) return;
    setStatus('loading');

    try {
      // Chama a RPC para confirmar o recebimento
      const { data, error } = await supabase.rpc('confirmar_recebimento_protocolo', {
        p_protocolo_id: id,
      });

      if (error) throw error;
      
      const result = data as { success: boolean, message: string }[];

      if (result[0]?.success) {
        setStatus('success');
        setMessage(result[0].message);
      } else {
        setStatus('error');
        setMessage(result[0]?.message || 'Ocorreu um erro ao confirmar.');
      }
    } catch (error: any) {
      setStatus('error');
      setMessage('Ocorreu uma falha ao tentar confirmar: ' + error.message);
    }
  };

  const renderStatus = () => {
    switch (status) {
      case 'success':
        return (
          <div className="text-center text-green-600 flex flex-col items-center gap-4">
            <CheckCircle className="h-16 w-16" />
            <p className="text-xl font-bold">{message}</p>
          </div>
        );
      case 'already_confirmed':
         return (
          <div className="text-center text-blue-600 flex flex-col items-center gap-4">
            <CheckCircle className="h-16 w-16" />
            <p className="text-xl font-bold">{message}</p>
          </div>
        );
      case 'error':
        return (
          <div className="text-center text-red-600 flex flex-col items-center gap-4">
            <XCircle className="h-16 w-16" />
            <p className="text-xl font-bold">{message || 'Ocorreu um erro.'}</p>
          </div>
        );
      default:
        return (
            <Button onClick={handleConfirm} disabled={status === 'loading'} className="w-full text-lg p-6">
                {status === 'loading' ? (
                    <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                ) : (
                    <CheckCircle className="mr-2 h-6 w-6" />
                )}
                Confirmar Recebimento
            </Button>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <FileText className="mx-auto h-12 w-12 text-primary" />
          <CardTitle className="text-2xl font-bold mt-2">Confirmação de Protocolo</CardTitle>
          <CardDescription>Confirme o recebimento do protocolo abaixo.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingPage ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : protocolo ? (
            <div className="space-y-6">
                <div className="space-y-2 text-center">
                    <p className="text-sm text-muted-foreground">Cliente</p>
                    <p className="text-lg font-semibold">{protocolo.tbl_clientes?.nome || 'Não identificado'}</p>
                </div>
                 <div className="space-y-2 text-center">
                    <p className="text-sm text-muted-foreground">Número do Protocolo</p>
                    <p className="text-lg font-semibold">{protocolo.numero_protocolo || 'Não identificado'}</p>
                </div>
              <div className="pt-4">
                {renderStatus()}
              </div>
            </div>
          ) : (
            <div className="text-center text-red-500 flex flex-col items-center gap-4">
                <XCircle className="h-16 w-16" />
                <p className="text-xl font-bold">{message || 'Não foi possível carregar os dados do protocolo.'}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConfirmarRecebimento;