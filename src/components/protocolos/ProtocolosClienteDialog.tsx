import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';

interface ProtocolosClienteDialogProps {
  clienteId: string;
  clienteNome: string;
  children: React.ReactNode;
}

interface Protocolo {
  id: string;
  numero_protocolo: string;
  status: string;
  created_at: string;
  url_img_protocolo: string | null;
  anexos: string[] | null;
}

const ProtocolosClienteDialog: React.FC<ProtocolosClienteDialogProps> = ({ clienteId, clienteNome, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  const fetchProtocolosCliente = async () => {
    if (!isOpen) return []; // Não busca se o dialog não estiver aberto

    const { data, error } = await supabase
      .from('protocolos')
      .select('*')
      .eq('id_cliente', clienteId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error('Erro ao buscar protocolos do cliente: ' + error.message);
    }
    return data as Protocolo[];
  };

  const { data: protocolos = [], isLoading, isError, error } = useQuery({
    queryKey: ['protocolos', clienteId],
    queryFn: fetchProtocolosCliente,
    enabled: isOpen, // A query só é ativada quando o dialog está aberto
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Protocolos de: {clienteNome}</DialogTitle>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          {isError && (
            <div className="text-red-500 text-center p-4">
              <p>Ocorreu um erro ao carregar os protocolos.</p>
              <p className="text-sm">{error.message}</p>
            </div>
          )}
          {!isLoading && !isError && protocolos.length === 0 && (
            <div className="text-center text-muted-foreground p-8">
              Nenhum protocolo encontrado para este cliente.
            </div>
          )}
          {!isLoading && !isError && protocolos.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Protocolo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Anexos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {protocolos.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{p.numero_protocolo || '-'}</TableCell>
                    <TableCell><Badge>{p.status}</Badge></TableCell>
                    <TableCell>{format(new Date(p.created_at), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {p.url_img_protocolo && (
                          <a href={p.url_img_protocolo} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm"><Download className="w-3 h-3 mr-1" /> Imagem</Button>
                          </a>
                        )}
                        {p.anexos?.map((anexoUrl, index) => (
                           <a key={index} href={anexoUrl} target="_blank" rel="noopener noreferrer">
                             <Button variant="secondary" size="sm"><Download className="w-3 h-3 mr-1" /> Anexo {index + 1}</Button>
                           </a>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProtocolosClienteDialog;