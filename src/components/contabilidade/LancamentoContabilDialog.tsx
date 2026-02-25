import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, BookOpen, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useLancamentosContabeis, LancamentoContabil } from '@/hooks/contabilidade/useLancamentosContabeis';
import { PlanoContas } from '@/types/plano-contas';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';

interface LancamentoContabilDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcelaId: string;
  parcelaDescricao: string;
  parcelaValor: number;
  parcelaData: string;
  origemTipo: 'contas_pagar' | 'contas_receber';
  proprietarioId: string;
  contaPatrimonialId?: string | null;
  contaResultadoId?: string | null;
  onSaved?: () => void;
}

interface LinhaLancamento {
  conta_contabil_id: string;
  tipo: 'Entrada' | 'Saida';
  valor: string;
  descricao: string;
}

const linhaVazia = (valor: string, descricao: string, tipo: 'Entrada' | 'Saida' = 'Entrada'): LinhaLancamento => ({
  conta_contabil_id: '',
  tipo,
  valor,
  descricao,
});

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const LancamentoContabilDialog: React.FC<LancamentoContabilDialogProps> = ({
  open,
  onOpenChange,
  parcelaId,
  parcelaDescricao,
  parcelaValor,
  parcelaData,
  origemTipo,
  proprietarioId,
  contaPatrimonialId,
  contaResultadoId,
  onSaved,
}) => {
  const { lancamentos, lancamentosExistentes, loading, salvar, deletarPorDocumento } = useLancamentosContabeis(open ? parcelaId : null, proprietarioId);
  const [contas, setContas] = useState<PlanoContas[]>([]);
  const [loadingContas, setLoadingContas] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [deletando, setDeletando] = useState(false);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [substituirTodos, setSubstituirTodos] = useState(false);
  const [linhasInicializadas, setLinhasInicializadas] = useState(false);

  const valorFormatado = parcelaValor.toFixed(2).replace('.', ',');

  const [linhas, setLinhas] = useState<LinhaLancamento[]>([
    linhaVazia(valorFormatado, parcelaDescricao, 'Entrada'),
    linhaVazia(valorFormatado, parcelaDescricao, 'Saida'),
  ]);

  useEffect(() => {
    if (!open) {
      setLinhasInicializadas(false);
      setModoEdicao(false);
      setSubstituirTodos(false);
      return;
    }
    const fetchContas = async () => {
      setLoadingContas(true);
      const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica')
        .eq('proprietario_id', proprietarioId)
        .eq('Analitica', 'Sim')
        .order('Conta');
      if (error) {
        showError('Erro ao carregar plano de contas: ' + error.message);
      } else {
        setContas((data || []) as PlanoContas[]);
      }
      setLoadingContas(false);
    };
    fetchContas();
  }, [open, proprietarioId]);

  useEffect(() => {
    if (!open || loading || loadingContas || linhasInicializadas) return;
    setLinhasInicializadas(true);

    if (lancamentos.length >= 2) {
      setLinhas([
        {
          conta_contabil_id: lancamentos[0].conta_contabil_id,
          tipo: lancamentos[0].tipo,
          valor: String(lancamentos[0].valor).replace('.', ','),
          descricao: lancamentos[0].descricao,
        },
        {
          conta_contabil_id: lancamentos[1].conta_contabil_id,
          tipo: lancamentos[1].tipo,
          valor: String(lancamentos[1].valor).replace('.', ','),
          descricao: lancamentos[1].descricao,
        },
      ]);
    } else if (lancamentosExistentes.length >= 2) {
      // Pré-preenche com os lançamentos existentes (mesmo que não sejam manuais)
      setLinhas([
        {
          conta_contabil_id: lancamentosExistentes[0].conta_contabil_id,
          tipo: lancamentosExistentes[0].tipo,
          valor: String(lancamentosExistentes[0].valor).replace('.', ','),
          descricao: lancamentosExistentes[0].descricao,
        },
        {
          conta_contabil_id: lancamentosExistentes[1].conta_contabil_id,
          tipo: lancamentosExistentes[1].tipo,
          valor: String(lancamentosExistentes[1].valor).replace('.', ','),
          descricao: lancamentosExistentes[1].descricao,
        },
      ]);
    } else {
      setLinhas([
        {
          conta_contabil_id: contaPatrimonialId || '',
          tipo: 'Entrada',
          valor: valorFormatado,
          descricao: parcelaDescricao,
        },
        {
          conta_contabil_id: contaResultadoId || '',
          tipo: 'Saida',
          valor: valorFormatado,
          descricao: parcelaDescricao,
        },
      ]);
    }
  }, [lancamentos, lancamentosExistentes, loading, loadingContas, open, linhasInicializadas, contaPatrimonialId, contaResultadoId]);

  const handleLinhaChange = useCallback((index: number, field: keyof LinhaLancamento, value: string) => {
    setLinhas(prev => {
      const copia = [...prev];
      copia[index] = { ...copia[index], [field]: value };
      return copia;
    });
  }, []);

  const handleSalvar = async () => {
    for (let i = 0; i < linhas.length; i++) {
      if (!linhas[i].conta_contabil_id) {
        showError(`Selecione a conta contábil da linha ${i + 1}.`);
        return;
      }
      const valorNum = parseFloat(linhas[i].valor.replace(',', '.'));
      if (isNaN(valorNum) || valorNum <= 0) {
        showError(`Valor inválido na linha ${i + 1}.`);
        return;
      }
    }

    setSalvando(true);
    const origem: LancamentoContabil['origem'] =
      origemTipo === 'contas_pagar' ? 'lancamento_manual_cp' : 'lancamento_manual_cr';

    const novosLancamentos: Omit<LancamentoContabil, 'id'>[] = linhas.map(linha => ({
      proprietario_id: proprietarioId,
      conta_contabil_id: linha.conta_contabil_id,
      data_movimentacao: parcelaData,
      tipo: linha.tipo,
      valor: parseFloat(linha.valor.replace(',', '.')),
      descricao: linha.descricao || parcelaDescricao,
      origem,
      documento: parcelaId,
      conciliado: false,
    }));

    const ok = await salvar(novosLancamentos, substituirTodos);
    setSalvando(false);
    if (ok) {
      onSaved?.();
      onOpenChange(false);
    }
  };

  const handleLimpar = async () => {
    setDeletando(true);
    const ok = await deletarPorDocumento(parcelaId, true);
    setDeletando(false);
    if (ok) {
      onSaved?.();
      onOpenChange(false);
    }
  };

  const temLancamentosExistentes = lancamentosExistentes.length > 0;
  const temLancamentosManuais = lancamentos.length > 0;
  const emVisualizacao = temLancamentosExistentes && !modoEdicao;

  const getNomeConta = (id: string) => {
    const c = contas.find(c => c.id === id);
    return c ? `${c.Conta} — ${c.Descricao}` : id;
  };

  const origemLabel = (origem: string) => {
    const map: Record<string, string> = {
      lancamento_manual_cp: 'Manual CP',
      lancamento_manual_cr: 'Manual CR',
      contrato_assinado: 'Contrato',
      lancamento_cp: 'Lançamento CP',
      lancamento_cr: 'Lançamento CR',
      pagamento_cp: 'Pagamento CP',
      recebimento_manual: 'Recebimento',
    };
    return map[origem] || origem;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Lançamento Contábil
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{parcelaDescricao}</span>
            {' — '}
            <span className="text-green-600 font-semibold">{formatCurrency(parcelaValor)}</span>
          </DialogDescription>
        </DialogHeader>

        {loading || loadingContas ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : emVisualizacao ? (
          // MODO VISUALIZAÇÃO — mostra os lançamentos existentes
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Esta parcela já possui lançamentos contábeis. Revise antes de editar.</span>
            </div>
            <div className="border rounded-lg divide-y">
              {lancamentosExistentes.map((l, i) => (
                <div key={l.id || i} className="p-3 flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Badge variant={l.tipo === 'Entrada' ? 'default' : 'secondary'} className="text-xs w-16 justify-center shrink-0">
                      {l.tipo === 'Entrada' ? 'Débito' : 'Crédito'}
                    </Badge>
                    <span className="text-muted-foreground truncate">{getNomeConta(l.conta_contabil_id)}</span>
                    <Badge variant="outline" className="text-xs shrink-0">{origemLabel(l.origem)}</Badge>
                  </div>
                  <span className="font-semibold shrink-0">{formatCurrency(l.valor)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          // MODO EDIÇÃO
          <div className="space-y-4 py-2">
            {temLancamentosExistentes && (
              <div className="flex items-center gap-3 text-sm bg-blue-50 border border-blue-200 rounded-md p-3">
                <input
                  type="checkbox"
                  id="substituir"
                  checked={substituirTodos}
                  onChange={e => setSubstituirTodos(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="substituir" className="text-blue-700 cursor-pointer">
                  Substituir todos os lançamentos existentes (inclusive automáticos)
                </label>
              </div>
            )}
            {linhas.map((linha, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground">
                  Linha {index + 1} — {index === 0 ? 'Débito' : 'Crédito'}
                </h4>
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Conta Contábil</Label>
                    <Select
                      value={linha.conta_contabil_id}
                      onValueChange={val => handleLinhaChange(index, 'conta_contabil_id', val)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione a conta..." />
                      </SelectTrigger>
                      <SelectContent>
                        {contas.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.Conta} — {c.Descricao}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo</Label>
                      <Select
                        value={linha.tipo}
                        onValueChange={val => handleLinhaChange(index, 'tipo', val as 'Entrada' | 'Saida')}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Entrada">Entrada (Débito)</SelectItem>
                          <SelectItem value="Saida">Saída (Crédito)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Valor (R$)</Label>
                      <Input
                        value={linha.valor}
                        onChange={e => handleLinhaChange(index, 'valor', e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Histórico</Label>
                      <Input
                        value={linha.descricao}
                        onChange={e => handleLinhaChange(index, 'descricao', e.target.value)}
                        placeholder="Descrição do lançamento"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="flex justify-between items-center">
          <div className="flex gap-2">
            {temLancamentosManuais && !modoEdicao && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" disabled={deletando}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Limpar Manuais
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Limpar lançamentos manuais?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Remove apenas os lançamentos manuais vinculados a esta parcela. Os lançamentos automáticos permanecem.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleLimpar} disabled={deletando}>
                      {deletando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirmar'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
              Cancelar
            </Button>
            {emVisualizacao ? (
              <Button onClick={() => setModoEdicao(true)}>
                Editar Lançamentos
              </Button>
            ) : (
              <Button onClick={handleSalvar} disabled={salvando || loading || loadingContas}>
                {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar Lançamento
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LancamentoContabilDialog;
