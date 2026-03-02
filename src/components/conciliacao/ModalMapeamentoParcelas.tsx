import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Search, AlertTriangle } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';
import { supabase } from '@/integrations/supabase/client';
import type { TransacaoExtratoCompleta, ParcelaMatching } from '@/types/conciliacao';
import { ParcelasTableSelecao } from './ParcelasTableSelecao';
import { LancamentoAvulsoForm } from './LancamentoAvulsoForm';
import { useChavesBancoPuro } from '@/hooks/conciliacao/useChavesBancoPuro';

interface ModalMapeamentoParcelasProps {
  open: boolean;
  transacao: TransacaoExtratoCompleta;
  onClose: () => void;
  onConfirmar: (
    mapeamentos: Array<{
      parcelaId: string;
      tipo: 'CR' | 'CP';
      valorAplicar: number;
    }>,
    valorRestante?: {
      valor: number;
      contaContabilId: string;
      descricao: string;
    },
    modoExcedente?: 'restante' | 'redistribuir',
    opcoes?: { ehBancoPuro: boolean }
  ) => Promise<void>;
}

export function ModalMapeamentoParcelas({
  open,
  transacao,
  onClose,
  onConfirmar,
}: ModalMapeamentoParcelasProps) {
  const { usuario, role, ownerId } = useSessao();
  const { isBancoPuro } = useChavesBancoPuro();

  const [loading, setLoading] = useState(true);
  const [parcelasCR, setParcelasCR] = useState<ParcelaMatching[]>([]);
  const [parcelasCP, setParcelasCP] = useState<ParcelaMatching[]>([]);
  const [parcelasQuitadas, setParcelasQuitadas] = useState<ParcelaMatching[]>([]);
  const [parcelasMapeadas, setParcelasMapeadas] = useState<ParcelaMatching[]>([]);
  const [filtro, setFiltro] = useState('');
  const [filtroMes, setFiltroMes] = useState('todos');
  const [abaAtiva, setAbaAtiva] = useState<string>('');
  const [parcelasSelecionadas, setParcelasSelecionadas] = useState<Map<string, number>>(
    new Map()
  );
  const [contaContabilRestante, setContaContabilRestante] = useState('');
  const [descricaoRestante, setDescricaoRestante] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [modoExcedente, setModoExcedente] = useState<'restante' | 'redistribuir'>('restante');

  // Buscar Parcelas de Contas a Receber
  const buscarParcelasCR = useCallback(async () => {
    if (!ownerId) return [];

    const { data: parcelas, error } = await supabase
      .from('admin_parcelas_receber')
      .select('id, numero_parcela, valor_parcela, valor_pago, data_vencimento, status, admin_contas_receber!conta_receber_id(id, descricao, cliente_id, tbl_clientes!cliente_id(id, nome, razao_social))')
      .eq('admin_id', ownerId)
      .in('status', ['aberta', 'reprogramada'])
      .order('data_vencimento', { ascending: true });

    if (error) {
      console.error('Erro ao buscar parcelas CR:', error);
      return [];
    }

    if (!parcelas || parcelas.length === 0) return [];

    const ids = parcelas.map((p: any) => p.id);
    const { data: comLancamento } = await supabase
      .from('lancamentos')
      .select('documento')
      .eq('proprietario_id', ownerId)
      .in('documento', ids)
      .not('origem', 'ilike', '%estornada%');
    const idsComLancamento = new Set((comLancamento || []).map((l: any) => l.documento).filter(Boolean));

    return parcelas.map((p: any) => {
      const conta = p.admin_contas_receber;
      const cliente = conta?.tbl_clientes;
      return {
        id: p.id,
        numeroParcela: p.numero_parcela,
        valor_parcela: p.valor_parcela,
        valorPago: p.valor_pago || 0,
        valorRestante: p.valor_parcela - (p.valor_pago || 0),
        dataVencimento: p.data_vencimento,
        status: p.status,
        descricao: conta?.descricao || `Parcela ${p.numero_parcela}`,
        clienteNome: cliente?.razao_social || cliente?.nome || '',
        tipo: 'CR' as const,
        matchScore: 0,
        temLancamento: idsComLancamento.has(p.id),
      };
    });
  }, [ownerId]);

  // Buscar Parcelas de Contas a Pagar
  const buscarParcelasCP = useCallback(async () => {
    if (!ownerId) return [];

    const { data: parcelas, error } = await supabase
      .from('admin_parcelas_pagar')
      .select('id, numero_parcela, valor_parcela, valor_pago, data_vencimento, status, admin_contas_pagar!conta_pagar_id(id, descricao, fornecedor)')
      .eq('admin_id', ownerId)
      .in('status', ['aberta', 'reprogramada'])
      .order('data_vencimento', { ascending: true });

    if (error) {
      console.error('Erro ao buscar parcelas CP:', error);
      return [];
    }

    if (!parcelas || parcelas.length === 0) return [];

    const ids = parcelas.map((p: any) => p.id);
    const { data: comLancamento } = await supabase
      .from('lancamentos')
      .select('documento')
      .eq('proprietario_id', ownerId)
      .in('documento', ids)
      .not('origem', 'ilike', '%estornada%');
    const idsComLancamento = new Set((comLancamento || []).map((l: any) => l.documento).filter(Boolean));

    return parcelas.map((p: any) => {
      const conta = p.admin_contas_pagar;
      return {
        id: p.id,
        numeroParcela: p.numero_parcela,
        valor_parcela: p.valor_parcela,
        valorPago: p.valor_pago || 0,
        valorRestante: p.valor_parcela - (p.valor_pago || 0),
        dataVencimento: p.data_vencimento,
        status: p.status,
        descricao: conta?.descricao || `Parcela ${p.numero_parcela}`,
        fornecedorNome: conta?.fornecedor || '',
        tipo: 'CP' as const,
        matchScore: 0,
        temLancamento: idsComLancamento.has(p.id),
      };
    });
  }, [ownerId]);

  const buscarParcelasQuitadas = useCallback(async () => {
    if (!ownerId) return [];

    const [{ data: parcelasCRPagas, error: erroCR }, { data: parcelasCPPagas, error: erroCP }] = await Promise.all([
      supabase
        .from('admin_parcelas_receber')
        .select('id, numero_parcela, valor_parcela, valor_pago, data_vencimento, data_pagamento, status, admin_contas_receber!conta_receber_id(id, descricao, cliente_id, tbl_clientes!cliente_id(id, nome, razao_social))')
        .eq('admin_id', ownerId)
        .in('status', ['paga', 'recebida'])
        .is('mapeado_extrato_id', null)
        .order('data_pagamento', { ascending: false }),
      supabase
        .from('admin_parcelas_pagar')
        .select('id, numero_parcela, valor_parcela, valor_pago, data_vencimento, data_pagamento, status, admin_contas_pagar!conta_pagar_id(id, descricao, fornecedor)')
        .eq('admin_id', ownerId)
        .eq('status', 'paga')
        .is('mapeado_extrato_id', null)
        .order('data_pagamento', { ascending: false }),
    ]);

    if (erroCR) console.error('Erro ao buscar parcelas quitadas CR:', erroCR);
    if (erroCP) console.error('Erro ao buscar parcelas quitadas CP:', erroCP);

    const resultadoCR: ParcelaMatching[] = (parcelasCRPagas || []).map((p: any) => {
      const conta = p.admin_contas_receber;
      const cliente = conta?.tbl_clientes;
      return {
        id: p.id,
        numeroParcela: p.numero_parcela,
        valor_parcela: p.valor_parcela,
        valorPago: p.valor_pago || 0,
        valorRestante: p.valor_parcela - (p.valor_pago || 0),
        dataVencimento: p.data_pagamento || p.data_vencimento,
        status: p.status,
        descricao: conta?.descricao || `Parcela ${p.numero_parcela}`,
        clienteNome: cliente?.razao_social || cliente?.nome || '',
        tipo: 'CR' as const,
        matchScore: 0,
      };
    });

    const resultadoCP: ParcelaMatching[] = (parcelasCPPagas || []).map((p: any) => {
      const conta = p.admin_contas_pagar;
      return {
        id: p.id,
        numeroParcela: p.numero_parcela,
        valor_parcela: p.valor_parcela,
        valorPago: p.valor_pago || 0,
        valorRestante: p.valor_parcela - (p.valor_pago || 0),
        dataVencimento: p.data_pagamento || p.data_vencimento,
        status: p.status,
        descricao: conta?.descricao || `Parcela ${p.numero_parcela}`,
        fornecedorNome: conta?.fornecedor || '',
        tipo: 'CP' as const,
        matchScore: 0,
      };
    });

    const todosResultados = [...resultadoCR, ...resultadoCP];

    if (todosResultados.length > 0) {
      const ids = todosResultados.map(p => p.id);
      const { data: lancamentosVinculados } = await supabase
        .from('lancamentos')
        .select('documento')
        .eq('proprietario_id', ownerId)
        .in('documento', ids)
        .not('origem', 'ilike', '%estornada%');

      const idsComLancamento = new Set((lancamentosVinculados || []).map(l => l.documento).filter(Boolean));
      return todosResultados.map(p => ({ ...p, temLancamento: idsComLancamento.has(p.id) }));
    }

    return todosResultados;
  }, [ownerId]);

  // Buscar parcelas já mapeadas (mapeado_extrato_id preenchido, sem vinculo ao extrato atual)
  const buscarParcelasMapeadas = useCallback(async () => {
    if (!ownerId) return [];

    const [{ data: crData }, { data: cpData }] = await Promise.all([
      supabase
        .from('admin_parcelas_receber')
        .select('id, numero_parcela, valor_parcela, valor_pago, data_vencimento, data_pagamento, status, conta_receber_id, admin_contas_receber!conta_receber_id(id, descricao, contrato_gerado_id, cliente_id, tbl_clientes!cliente_id(id, nome, razao_social))')
        .eq('admin_id', ownerId)
        .in('status', ['paga', 'recebida'])
        .not('mapeado_extrato_id', 'is', null)
        .order('data_pagamento', { ascending: false }),
      supabase
        .from('admin_parcelas_pagar')
        .select('id, numero_parcela, valor_parcela, valor_pago, data_vencimento, data_pagamento, status, admin_contas_pagar!conta_pagar_id(id, descricao, fornecedor)')
        .eq('admin_id', ownerId)
        .eq('status', 'paga')
        .not('mapeado_extrato_id', 'is', null)
        .order('data_pagamento', { ascending: false }),
    ]);

    const resultadoCR: ParcelaMatching[] = (crData || []).map((p: any) => {
      const conta = p.admin_contas_receber;
      const cliente = conta?.tbl_clientes;
      return {
        id: p.id,
        numeroParcela: p.numero_parcela,
        valor_parcela: p.valor_parcela,
        valorPago: p.valor_pago || 0,
        valorRestante: p.valor_parcela - (p.valor_pago || 0),
        dataVencimento: p.data_pagamento || p.data_vencimento,
        status: p.status,
        descricao: conta?.descricao || `Parcela ${p.numero_parcela}`,
        clienteNome: cliente?.razao_social || cliente?.nome || '',
        tipo: 'CR' as const,
        matchScore: 0,
        contratoId: conta?.contrato_gerado_id || null,
        contaReceberId: p.conta_receber_id || null,
      };
    });

    const resultadoCP: ParcelaMatching[] = (cpData || []).map((p: any) => {
      const conta = p.admin_contas_pagar;
      return {
        id: p.id,
        numeroParcela: p.numero_parcela,
        valor_parcela: p.valor_parcela,
        valorPago: p.valor_pago || 0,
        valorRestante: p.valor_parcela - (p.valor_pago || 0),
        dataVencimento: p.data_pagamento || p.data_vencimento,
        status: p.status,
        descricao: conta?.descricao || `Parcela ${p.numero_parcela}`,
        fornecedorNome: conta?.fornecedor || '',
        tipo: 'CP' as const,
        matchScore: 0,
      };
    });

    return [...resultadoCR, ...resultadoCP];
  }, [ownerId]);

  // Carregar parcelas ao abrir o modal
  useEffect(() => {
    if (open && ownerId) {
      setLoading(true);
      setErro(null);
      setParcelasSelecionadas(new Map());
      setContaContabilRestante('');
      setDescricaoRestante('');
      setFiltro('');
      setFiltroMes('todos');
      setModoExcedente('restante');
      setAbaAtiva(transacao.tipo === 'Entrada' ? 'CR' : 'CP');

      Promise.all([buscarParcelasCR(), buscarParcelasCP(), buscarParcelasQuitadas(), buscarParcelasMapeadas()])
        .then(([cr, cp, quitadas, mapeadas]) => {
          setParcelasCR(cr);
          setParcelasCP(cp);
          setParcelasQuitadas(quitadas);
          setParcelasMapeadas(mapeadas);
        })
        .catch((error) => {
          console.error('Erro ao carregar parcelas:', error);
          setErro('Erro ao carregar parcelas. Tente novamente.');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open, ownerId, buscarParcelasCR, buscarParcelasCP, buscarParcelasQuitadas]);

  const tipoTransacao = transacao.tipo === 'Entrada' ? 'CR' : 'CP';

  // Filtrar parcelas
  const parcelasCRFiltradas = useMemo(() => {
    let lista = parcelasCR;
    if (filtroMes !== 'todos') {
      lista = lista.filter(p => {
        if (!p.dataVencimento) return false;
        const d = new Date(p.dataVencimento);
        return String(d.getMonth() + 1).padStart(2, '0') === filtroMes;
      });
    }
    if (!filtro) return lista;
    const filtroLower = filtro.toLowerCase();
    return lista.filter(p =>
      p.clienteNome?.toLowerCase().includes(filtroLower) ||
      p.descricao?.toLowerCase().includes(filtroLower) ||
      p.numeroParcela?.toString().includes(filtroLower) ||
      p.valor_parcela?.toString().includes(filtroLower) ||
      p.dataVencimento?.includes(filtro) ||
      p.id?.toLowerCase().includes(filtroLower)
    );
  }, [parcelasCR, filtro, filtroMes]);

  const parcelasCPFiltradas = useMemo(() => {
    let lista = parcelasCP;
    if (filtroMes !== 'todos') {
      lista = lista.filter(p => {
        if (!p.dataVencimento) return false;
        const d = new Date(p.dataVencimento);
        return String(d.getMonth() + 1).padStart(2, '0') === filtroMes;
      });
    }
    if (!filtro) return lista;
    const filtroLower = filtro.toLowerCase();
    return lista.filter(p =>
      p.fornecedorNome?.toLowerCase().includes(filtroLower) ||
      p.descricao?.toLowerCase().includes(filtroLower) ||
      p.numeroParcela?.toString().includes(filtroLower) ||
      p.valor_parcela?.toString().includes(filtroLower) ||
      p.dataVencimento?.includes(filtro) ||
      p.id?.toLowerCase().includes(filtroLower)
    );
  }, [parcelasCP, filtro, filtroMes]);

  const parcelasQuitadasFiltradas = useMemo(() => {
    let lista = parcelasQuitadas.filter(p => p.tipo === tipoTransacao);

    if (filtroMes !== 'todos') {
      lista = lista.filter(p => {
        if (!p.dataVencimento) return false;
        const d = new Date(p.dataVencimento);
        return String(d.getMonth() + 1).padStart(2, '0') === filtroMes;
      });
    }

    if (!filtro) return lista;
    const filtroLower = filtro.toLowerCase();
    return lista.filter(p =>
      p.clienteNome?.toLowerCase().includes(filtroLower) ||
      p.fornecedorNome?.toLowerCase().includes(filtroLower) ||
      p.descricao?.toLowerCase().includes(filtroLower) ||
      p.numeroParcela?.toString().includes(filtroLower) ||
      p.valor_parcela?.toString().includes(filtroLower) ||
      p.dataVencimento?.includes(filtro) ||
      p.id?.toLowerCase().includes(filtroLower)
    );
  }, [parcelasQuitadas, filtro, filtroMes, tipoTransacao]);

  const parcelasMapeadasFiltradas = useMemo(() => {
    let lista = parcelasMapeadas.filter(p => p.tipo === tipoTransacao);
    if (filtroMes !== 'todos') {
      lista = lista.filter(p => {
        if (!p.dataVencimento) return false;
        const d = new Date(p.dataVencimento);
        return String(d.getMonth() + 1).padStart(2, '0') === filtroMes;
      });
    }
    if (!filtro) return lista;
    const filtroLower = filtro.toLowerCase();
    return lista.filter(p =>
      p.clienteNome?.toLowerCase().includes(filtroLower) ||
      p.fornecedorNome?.toLowerCase().includes(filtroLower) ||
      p.descricao?.toLowerCase().includes(filtroLower) ||
      p.numeroParcela?.toString().includes(filtroLower) ||
      p.valor_parcela?.toString().includes(filtroLower) ||
      p.dataVencimento?.includes(filtro) ||
      p.id?.toLowerCase().includes(filtroLower) ||
      (p as any).contratoId?.toLowerCase().includes(filtroLower) ||
      (p as any).contaReceberId?.toLowerCase().includes(filtroLower)
    );
  }, [parcelasMapeadas, filtro, filtroMes, tipoTransacao]);

  // Cálculo de valores
  const valorSelecionado = useMemo(() => {
    return Array.from(parcelasSelecionadas.values()).reduce((acc, val) => acc + val, 0);
  }, [parcelasSelecionadas]);

  const valorRestante = useMemo(() => {
    return Math.abs(transacao.valor) - valorSelecionado;
  }, [transacao.valor, valorSelecionado]);

  // Validações
  const parcelasSemLancamento = useMemo(() => {
    return [...parcelasSelecionadas.keys()].filter(id => {
      const p = [...parcelasCR, ...parcelasCP, ...parcelasQuitadas].find(x => x.id === id);
      return p && p.temLancamento === false;
    }).map(id => {
      const p = [...parcelasCR, ...parcelasCP, ...parcelasQuitadas].find(x => x.id === id);
      return p ? { id, label: `${p.clienteNome || (p as any).fornecedorNome || ''} — Parcela ${p.numeroParcela}` } : { id, label: id };
    });
  }, [parcelasSelecionadas, parcelasCR, parcelasCP, parcelasQuitadas]);

  const podeConfirmar = useMemo(() => {
    if (parcelasSelecionadas.size === 0) return false;
    if (parcelasSemLancamento.length > 0) return false;
    if (valorRestante > 0 && !contaContabilRestante) return false;
    if (valorSelecionado > Math.abs(transacao.valor)) return false;
    return true;
  }, [
    parcelasSelecionadas,
    parcelasSemLancamento,
    valorRestante,
    contaContabilRestante,
    valorSelecionado,
    transacao.valor,
  ]);

  // Handlers
  const handleToggleSelecao = useCallback(
    (parcelaId: string, checked: boolean) => {
      setParcelasSelecionadas((prev) => {
        const novo = new Map(prev);
        if (!checked) {
          novo.delete(parcelaId);
        } else {
          // Buscar parcela para pegar valor
          const parcela = [...parcelasCR, ...parcelasCP, ...parcelasQuitadas].find(p => p.id === parcelaId);
          if (parcela) {
            novo.set(parcelaId, parcela.valor_parcela);
          }
        }
        return novo;
      });
    },
    [parcelasCR, parcelasCP]
  );

  const handleValorChange = useCallback((parcelaId: string, novoValor: number) => {
    setParcelasSelecionadas((prev) => {
      const novo = new Map(prev);
      if (novoValor <= 0) {
        novo.delete(parcelaId);
      } else {
        novo.set(parcelaId, novoValor);
      }
      return novo;
    });
  }, []);

  const handleConfirmar = async () => {
    setSalvando(true);
    setErro(null);

    const mapeamentos = Array.from(parcelasSelecionadas.entries()).map(
      ([parcelaId, valorAplicar]) => {
        const tipo = transacao.tipo === 'Entrada' ? ('CR' as const) : ('CP' as const);
        return { parcelaId, tipo, valorAplicar };
      }
    );

    const valorRestanteObj =
      valorRestante > 0
        ? {
            valor: valorRestante,
            contaContabilId: contaContabilRestante,
            descricao: descricaoRestante || 'Diferença de conciliação',
          }
        : undefined;

    const ehBancoPuro = isBancoPuro(transacao.descricao || '');

    try {
      await onConfirmar(mapeamentos, valorRestanteObj, modoExcedente, { ehBancoPuro });
      onClose();
    } catch (error) {
      console.error('Erro ao confirmar mapeamento:', error);
      setErro('Erro ao salvar mapeamento. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Mapear Transação do Extrato</DialogTitle>
          <div className="flex items-center gap-4 mt-2 text-sm">
            <div>
              <span className="font-semibold">Data:</span>{' '}
              {transacao.data && typeof transacao.data === 'string' 
                ? (transacao.data.includes('/') 
                    ? transacao.data 
                    : new Date(transacao.data).toLocaleDateString('pt-BR'))
                : 'Data inválida'}
            </div>
            <div>
              <span className="font-semibold">Valor:</span> R${' '}
              {Math.abs(transacao.valor).toFixed(2)}
            </div>
            <div>
              <span className="font-semibold">Tipo:</span>{' '}
              <Badge variant={transacao.tipo === 'Entrada' ? 'default' : 'destructive'}>
                {transacao.tipo}
              </Badge>
            </div>
          </div>
          {transacao.descricao && (
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold">Descrição:</span> {transacao.descricao}
            </div>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Carregando parcelas...</span>
          </div>
        ) : (
          <>
            {erro && (
              <Alert variant="destructive">
                <AlertDescription>{erro}</AlertDescription>
              </Alert>
            )}

            {/* Layout de 2 Colunas */}
            <div className="grid grid-cols-3 gap-4 flex-1 overflow-hidden">
              {/* COLUNA ESQUERDA: Lista de Parcelas (2/3 da largura) */}
              <div className="col-span-2 flex flex-col overflow-hidden">
                {/* Campo de Busca + Filtro de Mês */}
                <div className="flex gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Buscar por cliente, fornecedor, descrição, valor..."
                      value={filtro}
                      onChange={(e) => setFiltro(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  {abaAtiva !== '' && (
                    <Select value={filtroMes} onValueChange={setFiltroMes}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Mês" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os meses</SelectItem>
                        <SelectItem value="01">Janeiro</SelectItem>
                        <SelectItem value="02">Fevereiro</SelectItem>
                        <SelectItem value="03">Março</SelectItem>
                        <SelectItem value="04">Abril</SelectItem>
                        <SelectItem value="05">Maio</SelectItem>
                        <SelectItem value="06">Junho</SelectItem>
                        <SelectItem value="07">Julho</SelectItem>
                        <SelectItem value="08">Agosto</SelectItem>
                        <SelectItem value="09">Setembro</SelectItem>
                        <SelectItem value="10">Outubro</SelectItem>
                        <SelectItem value="11">Novembro</SelectItem>
                        <SelectItem value="12">Dezembro</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Tabela com Scroll */}
                <div className="flex-1 overflow-y-auto border rounded-lg">
                  <Tabs defaultValue={tipoTransacao} className="h-full" onValueChange={setAbaAtiva}>
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="CR" disabled={transacao.tipo !== 'Entrada'}>
                        Contas a Receber ({parcelasCRFiltradas.length}/{parcelasCR.length})
                      </TabsTrigger>
                      <TabsTrigger value="CP" disabled={transacao.tipo !== 'Saida'}>
                        Contas a Pagar ({parcelasCPFiltradas.length}/{parcelasCP.length})
                      </TabsTrigger>
                      <TabsTrigger value="QUITADAS">
                        Já Quitadas ({parcelasQuitadasFiltradas.length})
                      </TabsTrigger>
                      <TabsTrigger value="MAPEADAS">
                        Já Mapeadas ({parcelasMapeadasFiltradas.length})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="CR" className="mt-0 h-full overflow-y-auto">
                      {parcelasCRFiltradas.length === 0 ? (
                        <Alert className="m-4">
                          <AlertDescription>
                            {filtro 
                              ? 'Nenhuma parcela encontrada com o filtro aplicado.'
                              : 'Nenhuma parcela a receber aberta encontrada.'}
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <ParcelasTableSelecao
                          parcelas={parcelasCRFiltradas}
                          tipo="CR"
                          parcelasSelecionadas={parcelasSelecionadas}
                          onToggleSelecao={handleToggleSelecao}
                          onValorChange={handleValorChange}
                          valorTransacao={Math.abs(transacao.valor)}
                        />
                      )}
                    </TabsContent>

                    <TabsContent value="CP" className="mt-0 h-full overflow-y-auto">
                      {parcelasCPFiltradas.length === 0 ? (
                        <Alert className="m-4">
                          <AlertDescription>
                            {filtro 
                              ? 'Nenhuma parcela encontrada com o filtro aplicado.'
                              : 'Nenhuma parcela a pagar aberta encontrada.'}
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <ParcelasTableSelecao
                          parcelas={parcelasCPFiltradas}
                          tipo="CP"
                          parcelasSelecionadas={parcelasSelecionadas}
                          onToggleSelecao={handleToggleSelecao}
                          onValorChange={handleValorChange}
                          valorTransacao={Math.abs(transacao.valor)}
                        />
                      )}
                    </TabsContent>

                    <TabsContent value="QUITADAS" className="mt-0 h-full overflow-y-auto">
                      {parcelasQuitadasFiltradas.length === 0 ? (
                        <Alert className="m-4">
                          <AlertDescription>
                            {filtro
                              ? 'Nenhuma parcela encontrada com o filtro aplicado.'
                              : 'Nenhuma parcela quitada sem conciliação encontrada.'}
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <ParcelasTableSelecao
                          parcelas={parcelasQuitadasFiltradas}
                          tipo={tipoTransacao}
                          parcelasSelecionadas={parcelasSelecionadas}
                          onToggleSelecao={handleToggleSelecao}
                          onValorChange={handleValorChange}
                          valorTransacao={Math.abs(transacao.valor)}
                          labelData="Dt. Pagamento"
                        />
                      )}
                    </TabsContent>

                    <TabsContent value="MAPEADAS" className="mt-0 h-full overflow-y-auto">
                      {parcelasMapeadasFiltradas.length === 0 ? (
                        <Alert className="m-4">
                          <AlertDescription>
                            {filtro
                              ? 'Nenhuma parcela encontrada com o filtro aplicado.'
                              : 'Nenhuma parcela já mapeada encontrada.'}
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <ParcelasTableSelecao
                          parcelas={parcelasMapeadasFiltradas}
                          tipo={tipoTransacao}
                          parcelasSelecionadas={parcelasSelecionadas}
                          onToggleSelecao={handleToggleSelecao}
                          onValorChange={handleValorChange}
                          valorTransacao={Math.abs(transacao.valor)}
                          labelData="Dt. Pagamento"
                        />
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </div>

              {/* COLUNA DIREITA: Resumo e Lançamento Avulso (1/3 da largura) */}
              <div className="col-span-1 flex flex-col gap-4 overflow-y-auto">
                {/* Resumo de Valores - SEMPRE VISÍVEL */}
                <div className="p-4 bg-muted rounded-lg space-y-3 sticky top-0">
                  <h3 className="text-sm font-bold text-gray-700 mb-2">Resumo da Conciliação</h3>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold">Total Selecionado:</span>
                      <span className="font-mono font-bold text-blue-600">
                        R$ {valorSelecionado.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold">Valor da Transação:</span>
                      <span className="font-mono">R$ {Math.abs(transacao.valor).toFixed(2)}</span>
                    </div>
                    <div className="border-t pt-2">
                      <div
                        className={`flex justify-between text-sm font-semibold ${
                          valorRestante > 0 ? 'text-orange-600' : 'text-green-600'
                        }`}
                      >
                        <span>Restante:</span>
                        <span className="font-mono text-lg">R$ {valorRestante.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {parcelasSelecionadas.size === 0 && (
                    <Alert>
                      <AlertDescription className="text-xs">
                        Selecione parcelas na lista ao lado para iniciar a conciliação.
                      </AlertDescription>
                    </Alert>
                  )}

                  {parcelasSemLancamento.length > 0 && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        <p className="font-semibold mb-1">Parcelas sem lançamento contábil:</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {parcelasSemLancamento.map(p => (
                            <li key={p.id}>{p.label}</li>
                          ))}
                        </ul>
                        <p className="mt-1">Clique em <strong>Vínculos</strong> na linha para criar o lançamento antes de confirmar.</p>
                      </AlertDescription>
                    </Alert>
                  )}

                  {valorSelecionado > Math.abs(transacao.valor) && (
                    <Alert variant="destructive">
                      <AlertDescription className="text-xs">
                        O valor selecionado excede o valor da transação!
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {/* Seletor Modo Excedente */}
                {parcelasSelecionadas.size > 0 && valorSelecionado > Math.abs(transacao.valor) && (
                  <div className="border rounded-lg p-4 bg-blue-50">
                    <h3 className="text-sm font-bold text-blue-800 mb-2">Tratamento do Excedente</h3>
                    <p className="text-xs text-blue-600 mb-3">
                      Se o valor aplicado exceder o saldo de uma parcela, o que fazer?
                    </p>
                    <RadioGroup
                      value={modoExcedente}
                      onValueChange={(v) => setModoExcedente(v as 'restante' | 'redistribuir')}
                      className="space-y-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="restante" id="modo-restante" />
                        <Label htmlFor="modo-restante" className="text-xs cursor-pointer">
                          <span className="font-semibold">Valor Restante</span> — registrar como lançamento avulso
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="redistribuir" id="modo-redistribuir" />
                        <Label htmlFor="modo-redistribuir" className="text-xs cursor-pointer">
                          <span className="font-semibold">Redistribuir</span> — aplicar nas demais parcelas selecionadas
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}

                {/* Formulário de Lançamento Avulso */}
                {valorRestante > 0 && parcelasSelecionadas.size > 0 && (
                  <div className="border rounded-lg p-4 bg-yellow-50">
                    <h3 className="text-sm font-bold text-yellow-800 mb-3">
                      ⚠️ Valor Restante Detectado
                    </h3>
                    <p className="text-xs text-yellow-700 mb-4">
                      Sobrou R$ {valorRestante.toFixed(2)}. Crie um lançamento avulso para conciliar o valor restante.
                    </p>
                    <LancamentoAvulsoForm
                      valorRestante={valorRestante}
                      contaContabilId={contaContabilRestante}
                      descricao={descricaoRestante}
                      onContaContabilChange={setContaContabilRestante}
                      onDescricaoChange={setDescricaoRestante}
                    />
                  </div>
                )}

                {/* Botões de Ação - SEMPRE VISÍVEIS */}
                <div className="flex flex-col gap-2 mt-auto sticky bottom-0 bg-white pt-4 border-t">
                  <Button onClick={handleConfirmar} disabled={!podeConfirmar || salvando} className="w-full">
                    {salvando ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      'Confirmar Mapeamento'
                    )}
                  </Button>
                  <Button variant="outline" onClick={onClose} disabled={salvando} className="w-full">
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
