import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Edit, Unlink, Trash2, Loader2 } from 'lucide-react';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { ExtratoMapeado } from '@/types/extrato';
import { cn } from '@/lib/utils';

interface TabelaMapeadasProps {
  extratos: ExtratoMapeado[];
  carregando: boolean;
  onEditar: (extrato: ExtratoMapeado) => void;
  onDesmapear: (extratoId: string) => Promise<void>;
  onDeletar: (extratoId: string) => Promise<void>;
}

export const TabelaMapeadas: React.FC<TabelaMapeadasProps> = ({
  extratos,
  carregando,
  onEditar,
  onDesmapear,
  onDeletar,
}) => {
  const [processando, setProcessando] = React.useState<string | null>(null);

  const handleDesmapear = async (id: string) => {
    setProcessando(id);
    await onDesmapear(id);
    setProcessando(null);
  };

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
            <TableHead className="w-[100px] text-right">Valor</TableHead>
            <TableHead className="w-[200px]">Parcela Vinculada</TableHead>
            <TableHead className="w-[150px]">Conta Contabil</TableHead>
            <TableHead className="w-[80px] text-center">Status</TableHead>
            <TableHead className="w-[120px] text-right">Acoes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {extratos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
                Nenhum extrato mapeado.
              </TableCell>
            </TableRow>
          ) : (
            extratos.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-sm">{formatarData(e.data)}</TableCell>
                <TableCell className="font-medium text-sm">{e.saldo_contas?.nome || 'N/A'}</TableCell>
                <TableCell className="text-sm">{e.descricao}</TableCell>
                <TableCell className={cn("text-right font-semibold", e.valor >= 0 ? 'text-green-600' : 'text-red-600')}>
                  {formatCurrency(Math.abs(e.valor))}
                </TableCell>
                <TableCell className="text-sm">
                  {e.parcela_info ? (
                    <span>
                      <Badge variant="outline" className="mr-1">{e.mapeado_tipo}</Badge>
                      {e.parcela_info.fornecedor_cliente} - Parcela {e.parcela_info.numero_parcela}
                    </span>
                  ) : (
                    'N/A'
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {e.plano_contas ? `${e.plano_contas.Conta} - ${e.plano_contas.Descricao}` : 'N/A'}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={e.conciliado ? 'success' : 'secondary'}>
                    {e.conciliado ? 'Conciliado' : 'Pendente'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => onEditar(e)} 
                    title="Editar Conta Contabil"
                    disabled={processando === e.id}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        title="Desmapear"
                        disabled={processando === e.id}
                      >
                        <Unlink className="w-4 h-4 text-orange-500" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Desmapear Extrato?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O extrato sera marcado como nao conciliado e o vinculo com a parcela sera removido.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDesmapear(e.id)}>
                          Desmapear
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  
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
