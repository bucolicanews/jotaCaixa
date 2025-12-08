import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Link2, Trash2, Loader2 } from 'lucide-react';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { ExtratoNaoMapeado } from '@/types/extrato';
import { cn } from '@/lib/utils';

interface TabelaNaoMapeadasProps {
  extratos: ExtratoNaoMapeado[];
  carregando: boolean;
  onMapear: (extrato: ExtratoNaoMapeado) => void;
  onDeletar: (extratoId: string) => Promise<void>;
}

export const TabelaNaoMapeadas: React.FC<TabelaNaoMapeadasProps> = ({
  extratos,
  carregando,
  onMapear,
  onDeletar,
}) => {
  const [processando, setProcessando] = React.useState<string | null>(null);

  const handleDeletar = async (id: string) => {
    setProcessando(id);
    await onDeletar(id);
    setProcessando(null);
  };

  if (carregando) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Data</TableHead>
            <TableHead className="w-[150px]">Conta</TableHead>
            <TableHead>Descricao</TableHead>
            <TableHead className="w-[80px] text-center">Tipo</TableHead>
            <TableHead className="w-[120px] text-right">Valor</TableHead>
            <TableHead className="w-[150px]">Identificacao</TableHead>
            <TableHead className="w-[100px] text-right">Acoes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {extratos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                Nenhum extrato pendente de mapeamento.
              </TableCell>
            </TableRow>
          ) : (
            extratos.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-sm">{formatarData(e.data)}</TableCell>
                <TableCell className="font-medium text-sm">{e.saldo_contas?.nome || 'N/A'}</TableCell>
                <TableCell className="text-sm">{e.descricao}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={e.tipo === 'Entrada' ? 'success' : 'destructive'}>
                    {e.tipo}
                  </Badge>
                </TableCell>
                <TableCell className={cn("text-right font-semibold", e.valor >= 0 ? 'text-green-600' : 'text-red-600')}>
                  {formatCurrency(Math.abs(e.valor))}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{e.identificacao || '-'}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => onMapear(e)} 
                    title="Mapear para Parcela"
                    disabled={processando === e.id}
                  >
                    <Link2 className="w-4 h-4 text-blue-500" />
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        title="Excluir"
                        disabled={processando === e.id}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Extrato?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta acao e irreversivel. O registro do extrato sera permanentemente excluido.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeletar(e.id)} className="bg-red-600 hover:bg-red-700">
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
