import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Printer, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { ConciliacaoHistorico } from '@/types/conciliacao';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import { Badge } from './ui/badge'; // FIX: Import Badge

interface HistoricoConciliacaoDialogProps {
  historico: ConciliacaoHistorico | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatTimestamp = (dateString: string) => format(new Date(dateString), 'dd/MM/yyyy HH:mm', { locale: ptBR });

const HistoricoConciliacaoDialog: React.FC<HistoricoConciliacaoDialogProps> = ({ historico, open, onOpenChange }) => {
  const { printContent } = usePrint();

  if (!historico) return null;
  
  const transacoes = historico.extrato_json || [];
  const contaNome = historico.saldo_contas?.nome || 'N/A';

  const handleDownload = () => {
    const dataStr = JSON.stringify(transacoes, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `extrato_conciliado_${historico.nome_arquivo}_${format(new Date(), 'yyyyMMdd')}.json`);
    link.click();
  };
  
  const handlePrint = () => {
    const printComponent = (
        <div style={{ padding: '20px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold' }}>Extrato Conciliado</h1>
            <p style={{ fontSize: '14px' }}>Conta: {contaNome}</p>
            <p style={{ fontSize: '14px' }}>Arquivo: {historico.nome_arquivo}</p>
            <p style={{ fontSize: '14px' }}>Data da Conciliação: {formatTimestamp(historico.criado_em)}</p>
            
            <table className="print-table" style={{ marginTop: '20px' }}>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th>Tipo</th>
                        <th style={{ textAlign: 'right' }}>Valor</th>
                        <th>Conta Contábil</th>
                    </tr>
                </thead>
                <tbody>
                    {transacoes.map((t, i) => (
                        <tr key={i}>
                            <td>{t.data}</td>
                            <td>{t.descricao}</td>
                            <td>{t.tipo}</td>
                            <td style={{ textAlign: 'right', color: t.tipo === 'Entrada' ? 'green' : 'red' }}>{formatCurrency(Math.abs(t.valor))}</td>
                            <td>{t.conta_contabil_id || 'N/A'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
    
    const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
    printContent(htmlContent, `Extrato Conciliado - ${historico.nome_arquivo}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Detalhes da Conciliação</DialogTitle>
          <DialogDescription>
            Arquivo: <span className="font-mono text-primary">{historico.nome_arquivo}</span> | Conta: {contaNome}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex justify-end space-x-2 mb-4">
            <Button onClick={handleDownload} variant="outline"><Download className="w-4 h-4 mr-2" /> Baixar JSON</Button>
            <Button onClick={handlePrint} variant="secondary"><Printer className="w-4 h-4 mr-2" /> Imprimir Extrato</Button>
        </div>

        <div className="flex-1 overflow-y-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Conta Contábil Mapeada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transacoes.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma transação registrada.</TableCell></TableRow>
              ) : (
                transacoes.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell>{t.data}</TableCell>
                    <TableCell>{t.descricao}</TableCell>
                    <TableCell>
                      <Badge variant={t.tipo === 'Entrada' ? 'success' : 'destructive'} className="flex items-center justify-center">
                        {t.tipo === 'Entrada' ? <ArrowUpCircle className="w-3 h-3 mr-1" /> : <ArrowDownCircle className="w-3 h-3 mr-1" />}
                        {t.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className={cn("text-right font-semibold", t.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600')}>
                      {formatCurrency(Math.abs(t.valor))}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{t.conta_contabil_id || 'PENDENTE'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HistoricoConciliacaoDialog;