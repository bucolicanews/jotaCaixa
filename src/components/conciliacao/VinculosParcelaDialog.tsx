import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Link2, AlertCircle, CheckCircle2, FileText, Building2, Receipt, Landmark, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { v4 as uuidv4 } from 'uuid';

interface VinculosParcelaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcelaId: string;
  tipo: 'CR' | 'CP';
  onLancamentoCriado?: () => void;
}

interface VinculoData {
  contrato: {
    id: string;
    status: string;
    valor_total: number;
    data_inicio: string;
    numero_parcelas: number;
  } | null;
  conta: {
    id: string;
    descricao: string;
    status: string;
    valor_total: number;
    cliente_fornecedor: string;
  } | null;
  parcela: {
    id: string;
    numero_parcela: number;
    valor_parcela: number;
    valor_pago: number;
    data_vencimento: string;
    data_pagamento: string | null;
    status: string;
  } | null;
  lancamentos: Array<{
    id: string;
    data_movimentacao: string;
    descricao: string;
    valor: number;
    tipo: string;
    origem: string;
    conciliado: boolean;
  }>;
  extrato: {
    id: string;
    data: string;
    descricao: string;
    valor: number;
    tipo: string;
    conciliado: boolean;
    saldo_contas?: { nome: string };
  } | null;
}

export function VinculosParcelaDialog({
  open,
  onOpenChange,
  parcelaId,
  tipo,
  onLancamentoCriado,
}: VinculosParcelaDialogProps) {
  const { ownerId } = useSessao();
  const [loading, setLoading] = useState(true);
  const [criandoLancamento, setCriandoLancamento] = useState(false);
  const [dados, setDados] = useState<VinculoData>({
    contrato: null,
    conta: null,
    parcela: null,
    lancamentos: [],
    extrato: null,
  });

  useEffect(() => {
    if (!open || !parcelaId || !ownerId) return;
    setLoading(true);
    carregarVinculos();
  }, [open, parcelaId, ownerId]);

  const carregarVinculos = async () => {
    try {
      if (tipo === 'CR') {
        const { data: parcela } = await supabase
          .from('admin_parcelas_receber')
          .select('id, numero_parcela, valor_parcela, valor_pago, data_vencimento, data_pagamento, status, mapeado_extrato_id, conta_receber_id')
          .eq('id', parcelaId)
          .single();

        if (parcela) {
          let conta: any = null;
          let contrato: any = null;

          const contaReceberId: string | null = (parcela as any).conta_receber_id || null;

          if (contaReceberId) {
            const { data: contaData } = await supabase
              .from('admin_contas_receber')
              .select('id, descricao, status, valor_total, contrato_gerado_id, tbl_clientes!cliente_id(nome, razao_social)')
              .eq('id', contaReceberId)
              .single();
            conta = contaData;

            if (conta?.contrato_gerado_id) {
              const { data: contratoData } = await supabase
                .from('contratos_gerados')
                .select('id, status, valor_total, data_inicio, numero_parcelas')
                .eq('id', conta.contrato_gerado_id)
                .single();
              contrato = contratoData;
            }
          }

          const cliente = conta?.tbl_clientes;

          const novoDados: VinculoData = {
            contrato: contrato
              ? {
                  id: contrato.id,
                  status: contrato.status,
                  valor_total: contrato.valor_total,
                  data_inicio: contrato.data_inicio,
                  numero_parcelas: contrato.numero_parcelas,
                }
              : null,
            conta: conta
              ? {
                  id: conta.id,
                  descricao: conta.descricao,
                  status: conta.status,
                  valor_total: conta.valor_total,
                  cliente_fornecedor: cliente?.razao_social || cliente?.nome || '',
                }
              : null,
            parcela: {
              id: parcela.id,
              numero_parcela: parcela.numero_parcela,
              valor_parcela: parcela.valor_parcela,
              valor_pago: parcela.valor_pago || 0,
              data_vencimento: parcela.data_vencimento,
              data_pagamento: parcela.data_pagamento,
              status: parcela.status,
            },
            lancamentos: [],
            extrato: null,
          };

          await Promise.all([
            buscarLancamentos(parcelaId, novoDados),
            buscarExtrato(parcelaId, (parcela as any).mapeado_extrato_id, novoDados),
          ]);
        }
      } else {
        const { data: parcela } = await supabase
          .from('admin_parcelas_pagar')
          .select(`
            id, numero_parcela, valor_parcela, valor_pago,
            data_vencimento, data_pagamento, status,
            mapeado_extrato_id,
            admin_contas_pagar!conta_pagar_id(
              id, descricao, status, valor_total, fornecedor
            )
          `)
          .eq('id', parcelaId)
          .single();

        if (parcela) {
          const conta = (parcela as any).admin_contas_pagar;

          const novoDados: VinculoData = {
            contrato: null,
            conta: conta
              ? {
                  id: conta.id,
                  descricao: conta.descricao,
                  status: conta.status,
                  valor_total: conta.valor_total,
                  cliente_fornecedor: conta.fornecedor || '',
                }
              : null,
            parcela: {
              id: parcela.id,
              numero_parcela: parcela.numero_parcela,
              valor_parcela: parcela.valor_parcela,
              valor_pago: parcela.valor_pago || 0,
              data_vencimento: parcela.data_vencimento,
              data_pagamento: parcela.data_pagamento,
              status: parcela.status,
            },
            lancamentos: [],
            extrato: null,
          };

          await Promise.all([
            buscarLancamentos(parcelaId, novoDados),
            buscarExtrato(parcelaId, (parcela as any).mapeado_extrato_id, novoDados),
          ]);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar vínculos:', err);
    } finally {
      setLoading(false);
    }
  };

  const buscarLancamentos = async (docId: string, alvo: VinculoData) => {
    const { data } = await supabase
      .from('lancamentos')
      .select('id, data_movimentacao, descricao, valor, tipo, origem, conciliado')
      .eq('documento', docId)
      .not('origem', 'ilike', '%estornada%')
      .order('data_movimentacao', { ascending: false });

    alvo.lancamentos = data || [];
    setDados({ ...alvo });
  };

  const buscarExtrato = async (parcelaId: string, mapeadoExtratoId: string | null, alvo: VinculoData) => {
    const campoVinculo = tipo === 'CR' ? 'id_parcela_rb' : 'id_parcela_pg';

    let extrato = null;

    if (mapeadoExtratoId) {
      const { data } = await supabase
        .from('extratos')
        .select('id, data, descricao, valor, tipo, conciliado, saldo_contas!id_saldo_contas(nome)')
        .eq('id', mapeadoExtratoId)
        .single();
      extrato = data;
    }

    if (!extrato) {
      const { data } = await supabase
        .from('extratos')
        .select('id, data, descricao, valor, tipo, conciliado, saldo_contas!id_saldo_contas(nome)')
        .eq(campoVinculo, parcelaId)
        .limit(1)
        .maybeSingle();
      extrato = data;
    }

    alvo.extrato = extrato
      ? {
          id: extrato.id,
          data: extrato.data,
          descricao: extrato.descricao,
          valor: extrato.valor,
          tipo: extrato.tipo,
          conciliado: extrato.conciliado,
          saldo_contas: (extrato as any).saldo_contas,
        }
      : null;

    setDados({ ...alvo });
  };

  const handleCriarLancamento = async () => {
    if (!dados.parcela || !dados.conta || !ownerId) return;
    setCriandoLancamento(true);
    try {
      const origem = tipo === 'CR' ? 'lancamento_cr' : 'lancamento_cp';
      const descricao =
        tipo === 'CR'
          ? `Recebimento ${dados.conta.descricao} — Parcela ${dados.parcela.numero_parcela}`
          : `Pagamento ${dados.conta.descricao} — Parcela ${dados.parcela.numero_parcela}`;

      const { error } = await supabase.from('lancamentos').insert({
        id: uuidv4(),
        proprietario_id: ownerId,
        documento: dados.parcela.id,
        descricao,
        valor: dados.parcela.valor_pago || dados.parcela.valor_parcela,
        tipo: tipo === 'CR' ? 'Entrada' : 'Saida',
        origem,
        data_movimentacao: dados.parcela.data_pagamento || dados.parcela.data_vencimento,
        conciliado: false,
      });

      if (error) throw error;

      showSuccess('Lançamento criado com sucesso.');
      onLancamentoCriado?.();
      await carregarVinculos();
    } catch (err: any) {
      showError('Erro ao criar lançamento: ' + err.message);
    } finally {
      setCriandoLancamento(false);
    }
  };

  const temLancamento = dados.lancamentos.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-600" />
            Vínculos da Parcela
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Carregando vínculos...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Colunas de Vínculos */}
            <div className="grid grid-cols-5 gap-3">
              {/* COLUNA 1: Contrato */}
              <VinculoColuna
                icone={<BookOpen className="h-4 w-4" />}
                titulo="Contrato"
                cor="blue"
                existe={!!dados.contrato}
              >
                {dados.contrato ? (
                  <div className="space-y-1.5 text-xs">
                    <div className="font-mono text-gray-400 truncate" title={dados.contrato.id}>
                      #{dados.contrato.id.substring(0, 8)}
                    </div>
                    <StatusBadge status={dados.contrato.status} />
                    <div>
                      <span className="text-gray-500">Valor:</span>{' '}
                      <span className="font-semibold">{formatCurrency(dados.contrato.valor_total)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Parcelas:</span>{' '}
                      <span className="font-semibold">{dados.contrato.numero_parcelas}x</span>
                    </div>
                    {dados.contrato.data_inicio && (
                      <div>
                        <span className="text-gray-500">Início:</span>{' '}
                        <span>{formatarData(dados.contrato.data_inicio)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <SemVinculo label="Sem contrato vinculado" />
                )}
              </VinculoColuna>

              {/* COLUNA 2: Conta */}
              <VinculoColuna
                icone={<Building2 className="h-4 w-4" />}
                titulo={tipo === 'CR' ? 'Conta a Receber' : 'Conta a Pagar'}
                cor="purple"
                existe={!!dados.conta}
              >
                {dados.conta ? (
                  <div className="space-y-1.5 text-xs">
                    <div className="font-semibold text-gray-800 line-clamp-2" title={dados.conta.descricao}>
                      {dados.conta.descricao}
                    </div>
                    <div className="text-gray-600">{dados.conta.cliente_fornecedor}</div>
                    <StatusBadge status={dados.conta.status} />
                    <div>
                      <span className="text-gray-500">Total:</span>{' '}
                      <span className="font-semibold">{formatCurrency(dados.conta.valor_total)}</span>
                    </div>
                  </div>
                ) : (
                  <SemVinculo label="Sem conta vinculada" />
                )}
              </VinculoColuna>

              {/* COLUNA 3: Parcela */}
              <VinculoColuna
                icone={<Receipt className="h-4 w-4" />}
                titulo="Parcela"
                cor="green"
                existe={!!dados.parcela}
              >
                {dados.parcela ? (
                  <div className="space-y-1.5 text-xs">
                    <div className="font-semibold text-lg text-gray-800">
                      Nº {dados.parcela.numero_parcela}
                    </div>
                    <StatusBadge status={dados.parcela.status} />
                    <div>
                      <span className="text-gray-500">Valor:</span>{' '}
                      <span className="font-semibold">{formatCurrency(dados.parcela.valor_parcela)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Pago:</span>{' '}
                      <span className="font-semibold text-green-700">{formatCurrency(dados.parcela.valor_pago)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Venc.:</span>{' '}
                      <span>{formatarData(dados.parcela.data_vencimento)}</span>
                    </div>
                    {dados.parcela.data_pagamento && (
                      <div>
                        <span className="text-gray-500">Pago em:</span>{' '}
                        <span className="text-green-700">{formatarData(dados.parcela.data_pagamento)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <SemVinculo label="Parcela não encontrada" />
                )}
              </VinculoColuna>

              {/* COLUNA 4: Lançamentos */}
              <VinculoColuna
                icone={<FileText className="h-4 w-4" />}
                titulo="Lançamentos"
                cor={temLancamento ? 'green' : 'red'}
                existe={temLancamento}
              >
                {temLancamento ? (
                  <div className="space-y-2">
                    {dados.lancamentos.map((l) => (
                      <div key={l.id} className="text-xs border rounded p-1.5 bg-white space-y-0.5">
                        <div className="font-semibold truncate" title={l.descricao}>{l.descricao}</div>
                        <div className="flex items-center gap-1">
                          <Badge variant={l.tipo === 'Entrada' ? 'default' : 'destructive'} className="text-[10px] h-4 px-1">
                            {l.tipo}
                          </Badge>
                          <span className="font-mono font-semibold">{formatCurrency(l.valor)}</span>
                        </div>
                        <div className="text-gray-400">{formatarData(l.data_movimentacao)}</div>
                        {l.conciliado && (
                          <Badge className="bg-green-100 text-green-800 text-[10px] h-4 px-1">Conciliado</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <SemVinculo label="Sem lançamentos" />
                    {dados.parcela && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                        onClick={handleCriarLancamento}
                        disabled={criandoLancamento}
                      >
                        {criandoLancamento ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <FileText className="h-3 w-3 mr-1" />
                        )}
                        Criar Lançamento
                      </Button>
                    )}
                  </div>
                )}
              </VinculoColuna>

              {/* COLUNA 5: Extrato */}
              <VinculoColuna
                icone={<Landmark className="h-4 w-4" />}
                titulo="Extrato Bancário"
                cor={dados.extrato ? (dados.extrato.conciliado ? 'green' : 'yellow') : 'gray'}
                existe={!!dados.extrato}
              >
                {dados.extrato ? (
                  <div className="space-y-1.5 text-xs">
                    <div className="font-semibold line-clamp-2" title={dados.extrato.descricao}>
                      {dados.extrato.descricao}
                    </div>
                    {dados.extrato.saldo_contas && (
                      <div className="text-gray-500">{(dados.extrato.saldo_contas as any).nome}</div>
                    )}
                    <div className="flex items-center gap-1">
                      <Badge variant={dados.extrato.tipo === 'Entrada' ? 'default' : 'destructive'} className="text-[10px] h-4 px-1">
                        {dados.extrato.tipo}
                      </Badge>
                      <span className="font-mono font-semibold">{formatCurrency(dados.extrato.valor)}</span>
                    </div>
                    <div>{formatarData(dados.extrato.data)}</div>
                    <div className="flex items-center gap-1">
                      {dados.extrato.conciliado ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          <span className="text-green-700 font-semibold">Conciliado</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-3 w-3 text-yellow-500" />
                          <span className="text-yellow-700">Pendente</span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <SemVinculo label="Sem extrato vinculado" />
                )}
              </VinculoColuna>
            </div>

            {/* Indicador geral de integridade */}
            <IntegridadeBar dados={dados} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VinculoColuna({
  icone,
  titulo,
  cor,
  existe,
  children,
}: {
  icone: React.ReactNode;
  titulo: string;
  cor: 'blue' | 'purple' | 'green' | 'red' | 'yellow' | 'gray';
  existe: boolean;
  children: React.ReactNode;
}) {
  const corMap = {
    blue: 'border-blue-200 bg-blue-50',
    purple: 'border-purple-200 bg-purple-50',
    green: 'border-green-200 bg-green-50',
    red: 'border-red-200 bg-red-50',
    yellow: 'border-yellow-200 bg-yellow-50',
    gray: 'border-gray-200 bg-gray-50',
  };

  const headerMap = {
    blue: 'text-blue-700',
    purple: 'text-purple-700',
    green: 'text-green-700',
    red: 'text-red-700',
    yellow: 'text-yellow-700',
    gray: 'text-gray-500',
  };

  return (
    <div className={`rounded-lg border-2 p-3 flex flex-col gap-2 min-h-[180px] ${corMap[cor]}`}>
      <div className={`flex items-center gap-1.5 font-semibold text-xs ${headerMap[cor]}`}>
        {icone}
        <span>{titulo}</span>
        {existe ? (
          <CheckCircle2 className="h-3 w-3 ml-auto text-green-600" />
        ) : (
          <AlertCircle className="h-3 w-3 ml-auto text-red-400" />
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function SemVinculo({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-4 text-center">
      <AlertCircle className="h-5 w-5 text-gray-300" />
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ativo: 'bg-green-100 text-green-800',
    paga: 'bg-green-100 text-green-800',
    pendente: 'bg-yellow-100 text-yellow-800',
    aberta: 'bg-blue-100 text-blue-800',
    reprogramada: 'bg-orange-100 text-orange-800',
    cancelado: 'bg-red-100 text-red-800',
    cancelada: 'bg-red-100 text-red-800',
    concluido: 'bg-gray-100 text-gray-700',
  };

  return (
    <Badge className={`text-[10px] h-4 px-1.5 ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </Badge>
  );
}

function IntegridadeBar({ dados }: { dados: VinculoData }) {
  const itens = [
    { label: 'Contrato', ok: !!dados.contrato, opcional: true },
    { label: 'Conta', ok: !!dados.conta },
    { label: 'Parcela', ok: !!dados.parcela },
    { label: 'Lançamento', ok: dados.lancamentos.length > 0 },
    { label: 'Extrato', ok: !!dados.extrato },
  ];

  const obrigatorios = itens.filter((i) => !i.opcional);
  const totalOk = obrigatorios.filter((i) => i.ok).length;
  const total = obrigatorios.length;
  const completo = totalOk === total;

  return (
    <div className={`rounded-lg border p-3 ${completo ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold ${completo ? 'text-green-700' : 'text-orange-700'}`}>
          Integridade dos Vínculos
        </span>
        <span className={`text-xs font-mono ${completo ? 'text-green-700' : 'text-orange-700'}`}>
          {totalOk}/{total} obrigatórios
        </span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {itens.map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            {item.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <AlertCircle className={`h-3.5 w-3.5 ${item.opcional ? 'text-gray-300' : 'text-red-500'}`} />
            )}
            <span className={`text-xs ${item.ok ? 'text-green-700' : item.opcional ? 'text-gray-400' : 'text-red-600 font-semibold'}`}>
              {item.label}
              {item.opcional && ' (opcional)'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
