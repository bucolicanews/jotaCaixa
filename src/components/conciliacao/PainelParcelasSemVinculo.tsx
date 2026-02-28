import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Link2, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { VinculosParcelaDialog } from './VinculosParcelaDialog';

interface ParcelaSemVinculo {
  id: string;
  numero_parcela: number;
  valor_parcela: number;
  valor_pago: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: string;
  tipo: 'CR' | 'CP';
  descricao: string;
  clienteFornecedor: string;
  temLancamento: boolean;
  temExtrato: boolean;
}

interface PainelParcelasSemVinculoProps {
  ownerId?: string;
}

export function PainelParcelasSemVinculo({ ownerId: ownerIdProp }: PainelParcelasSemVinculoProps) {
  const { ownerId: ownerIdSessao } = useSessao();
  const ownerId = ownerIdProp || ownerIdSessao;

  const [parcelas, setParcelas] = useState<ParcelaSemVinculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'CR' | 'CP'>('todos');
  const [filtroVinculo, setFiltroVinculo] = useState<'todos' | 'sem_lancamento' | 'sem_extrato' | 'sem_ambos'>('todos');
  const [vinculosDialog, setVinculosDialog] = useState<{ open: boolean; parcelaId: string | null; tipo: 'CR' | 'CP' }>({
    open: false,
    parcelaId: null,
    tipo: 'CR',
  });

  const carregarParcelas = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      const [{ data: parcelasCR }, { data: parcelasCP }] = await Promise.all([
        supabase
          .from('admin_parcelas_receber')
          .select(`
            id, numero_parcela, valor_parcela, valor_pago,
            data_vencimento, data_pagamento, status,
            mapeado_extrato_id,
            admin_contas_receber!conta_receber_id(
              descricao,
              tbl_clientes!cliente_id(nome, razao_social)
            )
          `)
          .eq('admin_id', ownerId)
          .in('status', ['paga', 'parcial']),
        supabase
          .from('admin_parcelas_pagar')
          .select(`
            id, numero_parcela, valor_parcela, valor_pago,
            data_vencimento, data_pagamento, status,
            mapeado_extrato_id,
            admin_contas_pagar!conta_pagar_id(descricao, fornecedor)
          `)
          .eq('admin_id', ownerId)
          .in('status', ['paga', 'parcial']),
      ]);

      const todasCR: ParcelaSemVinculo[] = (parcelasCR || []).map((p: any) => {
        const conta = p.admin_contas_receber;
        const cliente = conta?.tbl_clientes;
        return {
          id: p.id,
          numero_parcela: p.numero_parcela,
          valor_parcela: p.valor_parcela,
          valor_pago: p.valor_pago || 0,
          data_vencimento: p.data_vencimento,
          data_pagamento: p.data_pagamento,
          status: p.status,
          tipo: 'CR' as const,
          descricao: conta?.descricao || `Parcela ${p.numero_parcela}`,
          clienteFornecedor: cliente?.razao_social || cliente?.nome || '',
          temLancamento: false,
          temExtrato: !!p.mapeado_extrato_id,
        };
      });

      const todasCP: ParcelaSemVinculo[] = (parcelasCP || []).map((p: any) => {
        const conta = p.admin_contas_pagar;
        return {
          id: p.id,
          numero_parcela: p.numero_parcela,
          valor_parcela: p.valor_parcela,
          valor_pago: p.valor_pago || 0,
          data_vencimento: p.data_vencimento,
          data_pagamento: p.data_pagamento,
          status: p.status,
          tipo: 'CP' as const,
          descricao: conta?.descricao || `Parcela ${p.numero_parcela}`,
          clienteFornecedor: conta?.fornecedor || '',
          temLancamento: false,
          temExtrato: !!p.mapeado_extrato_id,
        };
      });

      const todas = [...todasCR, ...todasCP];
      if (todas.length > 0) {
        const ids = todas.map(p => p.id);
        const { data: lancamentos } = await supabase
          .from('lancamentos')
          .select('documento')
          .eq('proprietario_id', ownerId)
          .in('documento', ids)
          .not('origem', 'ilike', '%estornada%');

        const idsComLancamento = new Set((lancamentos || []).map((l: any) => l.documento).filter(Boolean));
        const comFlags = todas.map(p => ({ ...p, temLancamento: idsComLancamento.has(p.id) }));

        const somentePendencias = comFlags.filter(p => !p.temLancamento || !p.temExtrato);
        setParcelas(somentePendencias);
      } else {
        setParcelas([]);
      }
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    carregarParcelas();
  }, [carregarParcelas]);

  const parcelasFiltradas = parcelas.filter(p => {
    if (filtroTipo !== 'todos' && p.tipo !== filtroTipo) return false;
    if (filtroVinculo === 'sem_lancamento' && p.temLancamento) return false;
    if (filtroVinculo === 'sem_extrato' && p.temExtrato) return false;
    if (filtroVinculo === 'sem_ambos' && (p.temLancamento || p.temExtrato)) return false;
    if (filtroTexto) {
      const lower = filtroTexto.toLowerCase();
      return (
        p.clienteFornecedor.toLowerCase().includes(lower) ||
        p.descricao.toLowerCase().includes(lower) ||
        p.numero_parcela.toString().includes(lower)
      );
    }
    return true;
  });

  const semLancamento = parcelas.filter(p => !p.temLancamento).length;
  const semExtrato = parcelas.filter(p => !p.temExtrato).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-semibold text-gray-700">Pendências de Vínculo</span>
        </div>
        <Badge className="bg-red-100 text-red-800 text-xs">
          {semLancamento} sem lançamento
        </Badge>
        <Badge className="bg-yellow-100 text-yellow-800 text-xs">
          {semExtrato} sem extrato
        </Badge>
        <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={carregarParcelas}>
          Atualizar
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, descrição..."
            value={filtroTexto}
            onChange={e => setFiltroTexto(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as any)}>
          <SelectTrigger className="w-[120px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">CR + CP</SelectItem>
            <SelectItem value="CR">Contas a Receber</SelectItem>
            <SelectItem value="CP">Contas a Pagar</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroVinculo} onValueChange={(v) => setFiltroVinculo(v as any)}>
          <SelectTrigger className="w-[160px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os problemas</SelectItem>
            <SelectItem value="sem_lancamento">Sem lançamento</SelectItem>
            <SelectItem value="sem_extrato">Sem extrato</SelectItem>
            <SelectItem value="sem_ambos">Sem ambos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando pendências...</span>
        </div>
      ) : parcelasFiltradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
          <span className="text-sm font-semibold text-green-700">Nenhuma pendência encontrada!</span>
          <span className="text-xs text-muted-foreground">Todas as parcelas pagas/parciais têm vínculos completos.</span>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs">Tipo</TableHead>
                <TableHead className="text-xs">Cliente/Fornecedor</TableHead>
                <TableHead className="text-xs">Descrição</TableHead>
                <TableHead className="text-xs">Nº</TableHead>
                <TableHead className="text-xs">Vencimento</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Valor</TableHead>
                <TableHead className="text-xs">Lançamento</TableHead>
                <TableHead className="text-xs">Extrato</TableHead>
                <TableHead className="w-[80px] text-xs">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parcelasFiltradas.map(p => (
                <TableRow key={p.id} className={!p.temLancamento && !p.temExtrato ? 'bg-red-50' : 'bg-yellow-50'}>
                  <TableCell>
                    <Badge className={p.tipo === 'CR' ? 'bg-blue-100 text-blue-800 text-[10px]' : 'bg-orange-100 text-orange-800 text-[10px]'}>
                      {p.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{p.clienteFornecedor}</TableCell>
                  <TableCell className="text-xs max-w-[180px] truncate" title={p.descricao}>{p.descricao}</TableCell>
                  <TableCell className="text-xs">{p.numero_parcela}</TableCell>
                  <TableCell className="text-xs">{formatarData(p.data_vencimento)}</TableCell>
                  <TableCell>
                    <Badge className="bg-gray-100 text-gray-700 text-[10px]">{p.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{formatCurrency(p.valor_pago || p.valor_parcela)}</TableCell>
                  <TableCell>
                    {p.temLancamento ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                  </TableCell>
                  <TableCell>
                    {p.temExtrato ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-blue-600 hover:bg-blue-50"
                      title="Ver Vínculos"
                      onClick={() => setVinculosDialog({ open: true, parcelaId: p.id, tipo: p.tipo })}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {vinculosDialog.parcelaId && (
        <VinculosParcelaDialog
          open={vinculosDialog.open}
          onOpenChange={(open) => setVinculosDialog(prev => ({ ...prev, open, parcelaId: open ? prev.parcelaId : null }))}
          parcelaId={vinculosDialog.parcelaId}
          tipo={vinculosDialog.tipo}
          onLancamentoCriado={carregarParcelas}
        />
      )}
    </div>
  );
}
