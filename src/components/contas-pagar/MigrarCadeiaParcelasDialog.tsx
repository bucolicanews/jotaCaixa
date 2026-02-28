import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useOwner } from '@/hooks/use-owner';
import { formatCurrency } from '@/utils/formatters';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ParcelaReprog {
  id: string;
  numero_parcela: number;
  data_vencimento: string;
  valor_parcela: number;
  valor_pago: number | null;
  status: string;
  observacao: string | null;
  conta_pagar_id: string;
  raiz_id_atual: string | null;
}

interface ParcelaNormal {
  id: string;
  numero_parcela: number;
  data_vencimento: string;
  valor_parcela: number;
  conta_pagar_id: string;
  fornecedor?: string;
  descricao?: string;
}

interface MigrarCadeiaParcelasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatDate = (d: string) => {
  try { return format(parseISO(d), 'dd/MM/yyyy', { locale: ptBR }); } catch { return d; }
};

const MigrarCadeiaParcelasDialog: React.FC<MigrarCadeiaParcelasDialogProps> = ({ open, onOpenChange }) => {
  const { ownerId, ownerType } = useOwner();
  const isAdmin = ownerType === 'Admin' || ownerType === 'AdminUsuario';
  const tabelaParcelas = isAdmin ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar';
  const tabelaContas = isAdmin ? 'admin_contas_pagar' : 'contas_pagar';
  const ownerKey = isAdmin ? 'admin_id' : 'empresa_id';

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parcelasReprog, setParcelasReprog] = useState<ParcelaReprog[]>([]);
  const [parcelasNormais, setParcelasNormais] = useState<ParcelaNormal[]>([]);
  const [atribuicoes, setAtribuicoes] = useState<Record<string, string>>({});
  const [migradas, setMigradas] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      const { data: reprog, error: e1 } = await supabase
        .from(tabelaParcelas)
        .select('id, numero_parcela, data_vencimento, valor_parcela, valor_pago, status, observacao, conta_pagar_id')
        .eq(ownerKey, ownerId)
        .gte('numero_parcela', 99)
        .order('data_vencimento', { ascending: true });

      if (e1) throw e1;

      const semRaiz = (reprog || []).filter(p =>
        !p.observacao?.match(/parcela_raiz_id:[a-f0-9-]{36}/i)
      ).map(p => ({
        ...p,
        valor_pago: p.valor_pago ?? null,
        raiz_id_atual: p.observacao?.match(/parcela_raiz_id:([a-f0-9-]{36})/i)?.[1] ?? null,
      }));

      const contaIds = [...new Set(semRaiz.map(p => p.conta_pagar_id))];

      if (contaIds.length === 0) {
        setParcelasReprog([]);
        setParcelasNormais([]);
        setLoading(false);
        return;
      }

      const { data: normais, error: e2 } = await supabase
        .from(tabelaParcelas)
        .select(`id, numero_parcela, data_vencimento, valor_parcela, conta_pagar_id, ${tabelaContas}(fornecedor, descricao)`)
        .eq(ownerKey, ownerId)
        .lt('numero_parcela', 99)
        .in('conta_pagar_id', contaIds)
        .order('numero_parcela', { ascending: true });

      if (e2) throw e2;

      const normaisMapped: ParcelaNormal[] = (normais || []).map((p: any) => ({
        id: p.id,
        numero_parcela: p.numero_parcela,
        data_vencimento: p.data_vencimento,
        valor_parcela: p.valor_parcela,
        conta_pagar_id: p.conta_pagar_id,
        fornecedor: p[tabelaContas]?.fornecedor || '',
        descricao: p[tabelaContas]?.descricao || '',
      }));

      setParcelasReprog(semRaiz);
      setParcelasNormais(normaisMapped);

      const sugestoes: Record<string, string> = {};
      for (const rep of semRaiz) {
        const candidatas = normaisMapped
          .filter(n => n.conta_pagar_id === rep.conta_pagar_id && new Date(n.data_vencimento) <= new Date(rep.data_vencimento))
          .sort((a, b) => new Date(b.data_vencimento).getTime() - new Date(a.data_vencimento).getTime());
        if (candidatas.length > 0) sugestoes[rep.id] = candidatas[0].id;
      }
      setAtribuicoes(sugestoes);
    } catch (err: any) {
      showError('Erro ao carregar: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [ownerId, ownerKey, tabelaParcelas, tabelaContas]);

  const handleMigrar = async () => {
    const pendentes = parcelasReprog.filter(p => atribuicoes[p.id] && !migradas.has(p.id));
    if (pendentes.length === 0) { showError('Nenhuma atribuição para migrar.'); return; }
    setSaving(true);
    let ok = 0;
    try {
      for (const p of pendentes) {
        const raizId = atribuicoes[p.id];
        const obsAtual = p.observacao || '';
        const novaObs = obsAtual.replace(/parcela_raiz_id:[a-f0-9-]{36}/i, '').trim();
        const obsFinal = `parcela_raiz_id:${raizId}${novaObs ? ' ' + novaObs : ''}`;
        const { error } = await supabase.from(tabelaParcelas).update({ observacao: obsFinal }).eq('id', p.id);
        if (error) { showError(`Erro em ${p.id.slice(0, 8)}: ${error.message}`); continue; }
        ok++;
        setMigradas(prev => new Set([...prev, p.id]));
      }
      showSuccess(`${ok} parcela(s) migrada(s) com sucesso!`);
      await carregar();
    } finally {
      setSaving(false);
    }
  };

  React.useEffect(() => {
    if (open) { setMigradas(new Set()); carregar(); }
  }, [open, carregar]);

  const pendentes = parcelasReprog.filter(p => !migradas.has(p.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[85vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Migrar Cadeias de Parcelas</DialogTitle>
          <DialogDescription>
            Parcelas reprogramadas sem vínculo forte com a parcela raiz. Verifique e confirme a parcela raiz de cada uma.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : pendentes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-green-600">
            <CheckCircle2 className="w-10 h-10" />
            <p className="text-sm font-medium">Todas as parcelas já possuem vínculo com parcela raiz.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto border rounded-md">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead className="w-[5%]">Nº</TableHead>
                  <TableHead className="w-[10%]">Vencimento</TableHead>
                  <TableHead className="w-[12%] text-right">Valor</TableHead>
                  <TableHead className="w-[10%]">Status</TableHead>
                  <TableHead className="w-[18%]">ID</TableHead>
                  <TableHead className="w-[45%]">Parcela Raiz (Conta a Pagar)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendentes.map(p => {
                  const candidatas = parcelasNormais.filter(n => n.conta_pagar_id === p.conta_pagar_id);
                  const raizSelecionada = parcelasNormais.find(n => n.id === atribuicoes[p.id]);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs font-mono">{p.numero_parcela}</TableCell>
                      <TableCell className="text-xs">{formatDate(p.data_vencimento)}</TableCell>
                      <TableCell className="text-right text-xs font-medium">{formatCurrency(p.valor_parcela)}</TableCell>
                      <TableCell>
                        <Badge variant="warning" className="text-xs">{p.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground" title={p.id}>{p.id.slice(0, 8)}…</TableCell>
                      <TableCell>
                        <Select
                          value={atribuicoes[p.id] || ''}
                          onValueChange={val => setAtribuicoes(prev => ({ ...prev, [p.id]: val }))}
                        >
                          <SelectTrigger className="text-xs h-8">
                            <SelectValue placeholder="Selecione a parcela raiz..." />
                          </SelectTrigger>
                          <SelectContent>
                            {candidatas.map(c => (
                              <SelectItem key={c.id} value={c.id}>
                                Parcela {c.numero_parcela} — {formatDate(c.data_vencimento)} — {formatCurrency(c.valor_parcela)}
                                {c.fornecedor ? ` | ${c.fornecedor}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {raizSelecionada && (
                          <p className="text-xs text-muted-foreground mt-0.5 ml-1">
                            → Raiz: {raizSelecionada.fornecedor} — Parcela {raizSelecionada.numero_parcela}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter className="pt-3 border-t">
          <div className="flex items-center gap-2 mr-auto text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4" />
            {pendentes.length} parcela(s) sem vínculo forte
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Fechar</Button>
          {pendentes.length > 0 && (
            <Button onClick={handleMigrar} disabled={saving || pendentes.every(p => !atribuicoes[p.id])}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Migrar {pendentes.filter(p => atribuicoes[p.id]).length} parcela(s)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MigrarCadeiaParcelasDialog;
