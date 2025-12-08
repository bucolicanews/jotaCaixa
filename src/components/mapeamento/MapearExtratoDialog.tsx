import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CheckCircle, Check } from 'lucide-react';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { ExtratoNaoMapeado, ParcelaSugestao } from '@/types/extrato';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { PlanoContas } from '@/types/plano-contas';
import { cn } from '@/lib/utils';

interface MapearExtratoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extrato: ExtratoNaoMapeado | null;
  sugestoes: ParcelaSugestao[];
  carregandoSugestoes: boolean;
  onConfirmar: (parcelaId: string | null, tipo: 'CP' | 'CR' | null, contaContabilId?: string) => Promise<void>;
}

export const MapearExtratoDialog: React.FC<MapearExtratoDialogProps> = ({
  open,
  onOpenChange,
  extrato,
  sugestoes,
  carregandoSugestoes,
  onConfirmar,
}) => {
  const { usuario } = useSessao();
  const [contaContabilId, setContaContabilId] = useState<string>('');
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [parcelaProcessando, setParcelaProcessando] = useState<string | null>(null);

  useEffect(() => {
    if (open && usuario?.id) {
      fetchContasContabeis();
    }
  }, [open, usuario?.id]);

  useEffect(() => {
    if (!open) {
      setContaContabilId('');
      setParcelaProcessando(null);
    }
  }, [open]);

  const fetchContasContabeis = async () => {
    if (!usuario?.id) return;
    
    const { data } = await supabase
      .from('plano_contas')
      .select('id, Conta, Descricao')
      .eq('proprietario_id', usuario.id)
      .eq('Analitica', 'Sim')
      .order('Conta');
    
    setContasContabeis(data as PlanoContas[] || []);
  };

  const handleVincularParcela = async (parcela: ParcelaSugestao) => {
    setSalvando(true);
    setParcelaProcessando(parcela.id);
    await onConfirmar(parcela.id, parcela.tipo, contaContabilId || undefined);
    setSalvando(false);
    setParcelaProcessando(null);
    onOpenChange(false);
  };

  const handleMarcarConciliado = async () => {
    setSalvando(true);
    await onConfirmar(null, null, contaContabilId || undefined);
    setSalvando(false);
    onOpenChange(false);
  };

  const getCompatibilidadeBadge = (score: number) => {
    if (score >= 90) return <Badge className="bg-green-600">ALTA</Badge>;
    if (score >= 70) return <Badge className="bg-yellow-500">MEDIA</Badge>;
    return <Badge className="bg-orange-500">BAIXA</Badge>;
  };

  if (!extrato) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mapeamento de Transacao Pendente</DialogTitle>
          <DialogDescription>
            Selecione a parcela correspondente a esta transacao do extrato bancario.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <span className="text-lg">Transacao do Extrato</span>
            </h4>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground block">Data</span>
                <span className="font-medium">{formatarData(extrato.data)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Valor</span>
                <span className="font-bold text-lg">{formatCurrency(Math.abs(extrato.valor))}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Tipo</span>
                <Badge variant={extrato.tipo === 'Entrada' ? 'success' : 'destructive'}>
                  {extrato.tipo === 'Entrada' ? 'Entrada (CR)' : 'Saida (CP)'}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground block">Descricao</span>
                <span className="font-medium">{extrato.descricao}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold">Parcelas Candidatas ({sugestoes.length})</h4>
            
            {carregandoSugestoes ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Buscando parcelas compativeis...
              </div>
            ) : sugestoes.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground border rounded-lg">
                Nenhuma parcela compativel encontrada (valor +/- 10%).
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[50px]">N</TableHead>
                      <TableHead className="w-[80px]">Parcelas</TableHead>
                      <TableHead>Fornecedor/Cliente</TableHead>
                      <TableHead>Descricao</TableHead>
                      <TableHead className="w-[100px]">Valor</TableHead>
                      <TableHead className="w-[100px]">Vencimento</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                      <TableHead className="w-[70px]">Origem</TableHead>
                      <TableHead className="w-[110px]">Compatibilidade</TableHead>
                      <TableHead className="w-[80px] text-center">Acao</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sugestoes.map((s, index) => (
                      <TableRow 
                        key={s.id} 
                        className={cn(
                          "hover:bg-muted/30",
                          index === 0 && "bg-green-50 dark:bg-green-950/20"
                        )}
                      >
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>
                          <span className="font-medium">{s.numero_parcela}/{s.numero_parcela}</span>
                        </TableCell>
                        <TableCell className="font-medium">{s.fornecedor_cliente}</TableCell>
                        <TableCell className="text-sm">{s.descricao}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(s.valor_parcela)}</TableCell>
                        <TableCell>{formatarData(s.data_vencimento)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">aberta</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{s.tipo}</Badge>
                        </TableCell>
                        <TableCell>
                          {getCompatibilidadeBadge(s.score)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            onClick={() => handleVincularParcela(s)}
                            disabled={salvando}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {parcelaProcessando === s.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="h-4 w-4 mr-1" />
                                OK
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950/20">
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Marcar como Conciliado (Sem Parcela)
            </h4>
            <p className="text-sm text-muted-foreground mb-3">
              Use esta opcao para lancamentos que vieram direto do banco e nao possuem parcela correspondente em Contas a Pagar/Receber.
            </p>
            
            <div className="flex gap-4 items-end">
              <div className="flex-1 space-y-2">
                <Label>Conta Contabil (Opcional)</Label>
                <Select value={contaContabilId || "none"} onValueChange={(val) => setContaContabilId(val === "none" ? "" : val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma conta contabil..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {contasContabeis.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.Conta} - {c.Descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={handleMarcarConciliado} 
                disabled={salvando}
                variant="outline"
                className="border-green-600 text-green-600 hover:bg-green-100 dark:hover:bg-green-950"
              >
                {salvando && !parcelaProcessando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Marcar como Conciliado
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
