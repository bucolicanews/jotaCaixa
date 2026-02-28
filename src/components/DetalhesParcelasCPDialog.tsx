import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { AdminContaPagar, AdminParcelaPagar, ExtendedParcelaPagar } from '@/types/contas-pagar';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { getBadgeVariant } from '@/utils/badge-variants';
import { Badge } from './ui/badge';
import { DollarSign, Undo2, Loader2, Trash2, Edit, Unlink, BookOpen, Receipt } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import RegistrarPagamentoCPDialog from '@/components/contas-pagar/RegistrarPagamentoCPDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Progress } from './ui/progress';
import { desvincularMapeamento } from '@/hooks/conciliacao/useMapeamentoParcelas';
import LancamentoContabilDialog from '@/components/contabilidade/LancamentoContabilDialog';
import DetalhesPagementoParcelaDialog from '@/components/contas-pagar/DetalhesPagementoParcelaDialog';
import { useOwner } from '@/hooks/use-owner';

interface DetalhesParcelasCPDialogProps {
  conta: AdminContaPagar;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataChange: () => void;
}

interface LancamentoResumo { tipo: string; conta_codigo: string; conta_descricao: string; origem: string | null; }

const DetalhesParcelasCPDialog: React.FC<DetalhesParcelasCPDialogProps> = ({ conta, open, onOpenChange, onDataChange }) => {
  const { usuario, role, perfil } = useSessao();
  const { ownerId } = useOwner();
  const [parcelas, setParcelas] = useState<ExtendedParcelaPagar[]>([]);
  const [loading, setLoading] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [pagamentoDialog, setPagamentoDialog] = useState<{ open: boolean, parcela: (AdminParcelaPagar & { fornecedor: string }) | null }>({ open: false, parcela: null });
  const [parcelasComLancamento, setParcelasComLancamento] = useState<Set<string>>(new Set());
  const [lancamentoDialog, setLancamentoDialog] = useState<{ open: boolean; parcela: ExtendedParcelaPagar | null }>({ open: false, parcela: null });
  const [lancamentosPorParcela, setLancamentosPorParcela] = useState<Record<string, LancamentoResumo[]>>({});
  const [detalhesParcelaDialog, setDetalhesParcelaDialog] = useState<{ open: boolean; parcela: ExtendedParcelaPagar | null; cadeia: ExtendedParcelaPagar[] }>({ open: false, parcela: null, cadeia: [] });
  const [confirmEstornoDialog, setConfirmEstornoDialog] = useState<{
    open: boolean;
    parcelaId: string | null;
    extratoId: string | null;
    extratoDescricao: string;
    extratoValor: number;
    extratoData: string;
    extratoContaNome: string;
  }>({ open: false, parcelaId: null, extratoId: null, extratoDescricao: '', extratoValor: 0, extratoData: '', extratoContaNome: '' });

  // Detectar Admin direto OU funcionário do admin
  const isDirectAdmin = role === 'Admin';
  const adminIdFromProfile = (perfil as any)?.admin_id ?? null;
  const isAdminUsuario = role === 'Usuario' && !!adminIdFromProfile;
  const isAdminOrEmployee = isDirectAdmin || isAdminUsuario;
  
  const tabelaContasPagar = isAdminOrEmployee ? 'admin_contas_pagar' : 'contas_pagar';
  const tabelaParcelas = isAdminOrEmployee ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar';
  const tabelaPagamentos = isAdminOrEmployee ? 'admin_pagamentos' : 'pagamentos';
  const joinTable = isAdminOrEmployee ? 'admin_contas_pagar' : 'contas_pagar';

  const fetchParcelas = useCallback(async () => {
    if (!usuario?.id) return;
    setLoading(true);
    
    const campoDescricao = 'descricao';
    
    const { data, error } = await supabase
        .from(tabelaParcelas)
        .select(`
            *,
            ${joinTable} ( fornecedor, ${campoDescricao}, origem )
        `)
        .eq('conta_pagar_id', conta.id)
        .order('numero_parcela', { ascending: true });
        
    if (error) {
        showError('Erro ao carregar parcelas: ' + error.message);
        setParcelas([]);
    } else {
        const mappedData = (data || []).map((p: any) => ({
            ...p,
            admin_contas_pagar: {
                ...p[joinTable],
                descricao: p[joinTable]?.descricao,
            },
        }));
        setParcelas(mappedData as ExtendedParcelaPagar[]);
    }
    setLoading(false);
  }, [conta.id, usuario?.id, tabelaParcelas, joinTable]);
  
  useEffect(() => {
    if (open) {
        fetchParcelas();
    }
  }, [open, fetchParcelas]);

  useEffect(() => {
    if (!open || parcelas.length === 0 || !usuario?.id || !ownerId) return;
    const carregarLancamentos = async () => {
      const ids = parcelas.map(p => p.id);

      const { data: porDocumento } = await supabase
        .from('lancamentos')
        .select('documento, tipo, conta_contabil_id, origem')
        .eq('proprietario_id', ownerId)
        .in('documento', ids)
        .not('origem', 'ilike', '%estornada%');

      const idsComLancamento = new Set((porDocumento || []).map(l => l.documento).filter(Boolean));
      const idsNaoEncontrados = ids.filter(id => !idsComLancamento.has(id));
      let porOrigem: any[] = [];
      if (idsNaoEncontrados.length > 0) {
        const orFiltros = idsNaoEncontrados.map(id => `origem.ilike.%${id}%`).join(',');
        const { data: fallback } = await supabase
          .from('lancamentos')
          .select('documento, tipo, conta_contabil_id, origem')
          .eq('proprietario_id', ownerId)
          .or(orFiltros)
          .not('origem', 'ilike', '%estornada%');
        porOrigem = fallback || [];
      }

      const lancamentosData = [...(porDocumento || []), ...porOrigem];

      const contaIds = [...new Set(lancamentosData.map((l: any) => l.conta_contabil_id).filter(Boolean))];
      let contasMap: Record<string, { Conta: string; Descricao: string }> = {};
      if (contaIds.length > 0) {
        const { data: contasData } = await supabase
          .from('plano_contas')
          .select('id, "Conta", "Descricao"')
          .in('id', contaIds);
        (contasData || []).forEach((c: any) => { contasMap[c.id] = c; });
      }

      const agrupado: Record<string, LancamentoResumo[]> = {};
      for (const l of lancamentosData as any[]) {
        const parcelaId = l.documento || ids.find(id => l.origem?.includes(id));
        if (!parcelaId) continue;
        if (!agrupado[parcelaId]) agrupado[parcelaId] = [];
        agrupado[parcelaId].push({
          tipo: l.tipo,
          conta_codigo: contasMap[l.conta_contabil_id]?.Conta || '',
          conta_descricao: contasMap[l.conta_contabil_id]?.Descricao || '',
          origem: l.origem,
        });
      }

      // Fallback: parcelas pagas sem lançamento — busca em admin_pagamentos
      const idsSemLancamento = ids.filter(id => !agrupado[id] && parcelas.find(p => p.id === id && (p.status === 'paga' || p.status === 'parcial')));
      if (idsSemLancamento.length > 0) {
        const { data: pagamentos } = await supabase
          .from(tabelaPagamentos)
          .select('parcela_id, conta_id, saldo_contas(nome)')
          .in('parcela_id', idsSemLancamento);

        if (pagamentos) {
          const contaPatrimonialId = (conta as any)?.id_conta_patrimonial;
          let contaPatrimonialNome = '';
          let contaPatrimonialCodigo = '';
          if (contaPatrimonialId) {
            const { data: pcData } = await supabase
              .from('plano_contas')
              .select('id, "Conta", "Descricao"')
              .eq('id', contaPatrimonialId)
              .single();
            if (pcData) {
              contaPatrimonialCodigo = (pcData as any).Conta || '';
              contaPatrimonialNome = (pcData as any).Descricao || '';
            }
          }

          for (const r of pagamentos as any[]) {
            const pid = r.parcela_id;
            if (!pid) continue;
            if (!agrupado[pid]) agrupado[pid] = [];
            // D: Fornecedor/Passivo (Entrada)
            if (contaPatrimonialId) {
              agrupado[pid].push({
                tipo: 'Entrada',
                conta_codigo: contaPatrimonialCodigo,
                conta_descricao: contaPatrimonialNome,
                origem: 'pagamento_pagamentos',
              });
            }
            // C: Banco/Caixa (Saída)
            agrupado[pid].push({
              tipo: 'Saida',
              conta_codigo: '',
              conta_descricao: r.saldo_contas?.nome || '',
              origem: 'pagamento_pagamentos',
            });
          }
        }
      }

      setParcelasComLancamento(new Set(
        lancamentosData.filter(l => ['lancamento_manual_cp', 'lancamento_manual_cr'].includes(l.origem || '')).map(l => l.documento).filter(Boolean) as string[]
      ));
      setLancamentosPorParcela(agrupado);
    };
    carregarLancamentos();
  }, [parcelas, open, usuario?.id, ownerId, isAdminOrEmployee, conta, tabelaPagamentos]);
  
  const handleOpenPagamento = (parcela: ExtendedParcelaPagar) => {
    const mappedParcela = {
        ...parcela,
        fornecedor: parcela.admin_contas_pagar?.fornecedor || conta.fornecedor,
    };
    setPagamentoDialog({ open: true, parcela: mappedParcela });
  };
  
  const handlePagamentoComplete = () => {
    setPagamentoDialog({ open: false, parcela: null });
    fetchParcelas();
    onDataChange(); // Notifica a página pai para recarregar o sintético
  };
  
  const handleDeleteParcela = async (parcelaId: string) => {
      setIsDeleting(true);
      try {
          // 1. Verificar se há pagamentos associados
          const { count: countPag, error: countError } = await supabase
              .from(tabelaPagamentos)
              .select('id', { count: 'exact', head: true })
              .eq('parcela_id', parcelaId);
              
          if (countError) throw countError;
          
          if (countPag && countPag > 0) {
              showError('Não é possível excluir. Existem pagamentos registrados para esta parcela.');
              return;
          }
          
          // 2. Verificar se há lançamentos contábeis vinculados
          if (ownerId) {
              const { count: countLanc, error: countLancError } = await supabase
                  .from('lancamentos')
                  .select('id', { count: 'exact', head: true })
                  .eq('proprietario_id', ownerId)
                  .eq('documento', parcelaId)
                  .not('origem', 'ilike', '%estornada%');
              if (countLancError) throw countLancError;
              if (countLanc && countLanc > 0) {
                  showError('Não é possível excluir. Existem lançamentos contábeis vinculados a esta parcela. Estorne o pagamento antes de excluir.');
                  return;
              }
          }
          
          // 3. Deletar a parcela
          const { error } = await supabase
              .from(tabelaParcelas)
              .delete()
              .eq('id', parcelaId);
              
          if (error) throw error;
          
          showSuccess('Parcela excluída com sucesso.');
          fetchParcelas();
          onDataChange();
      } catch (error: any) {
          showError('Falha ao excluir parcela: ' + error.message);
      } finally {
          setIsDeleting(false);
      }
  };
  
  const handleUndoPayment = async (parcelaId: string) => {
    if (!ownerId) return;
    setIsUndoing(true);
    try {
      const { data: extratoVinculado } = await supabase
        .from('extratos')
        .select('id, descricao, valor, data, id_saldo_contas, saldo_contas(nome)')
        .eq('id_parcela_pg', parcelaId)
        .eq('conciliado', false)
        .limit(1)
        .maybeSingle();
      if (extratoVinculado) {
        setIsUndoing(false);
        setConfirmEstornoDialog({
          open: true,
          parcelaId,
          extratoId: extratoVinculado.id,
          extratoDescricao: extratoVinculado.descricao || '',
          extratoValor: extratoVinculado.valor,
          extratoData: extratoVinculado.data,
          extratoContaNome: (extratoVinculado as any).saldo_contas?.nome || '',
        });
        return;
      }
    } catch (e) { /* sem extrato, segue normal */ }
    await executarUndoPayment(parcelaId, null);
  };

  const executarUndoPayment = async (parcelaId: string, extratoId: string | null) => {
    if (!ownerId) return;
    setIsUndoing(true);
    
    try {
        // 1. Buscar a parcela para obter o valor pago e observação (para desconto)
        const { data: parcelaData, error: parcelaError } = await supabase
            .from(tabelaParcelas)
            .select('conta_pagar_id, valor_parcela, valor_pago, observacao')
            .eq('id', parcelaId)
            .single();
            
        if (parcelaError || !parcelaData) throw new Error('Parcela não encontrada.');
        
        const contaPagarId = parcelaData.conta_pagar_id;
        const valorPagoOriginal = parcelaData.valor_pago || 0;
        const isDiscountApplied = parcelaData.observacao?.includes('desconto');
        
        // 2. Buscar todos os pagamentos registrados (para deletar depois)
        const { data: pagamentos, error: fetchPayError } = await supabase
            .from(tabelaPagamentos)
            .select('id, conta_id, valor_pago, historico_id')
            .eq('parcela_id', parcelaId);
            
        if (fetchPayError) throw fetchPayError;
        
        if (!pagamentos || pagamentos.length === 0) {
            showError('Nenhum pagamento encontrado para estornar.');
            setIsUndoing(false);
            return;
        }
        
        const dataEstornoISO = new Date().toISOString();
        const lancamentosEstornoPayload: any[] = [];
        
        // 3. Buscar Lançamentos Originais (Pagamento e Desconto)
        const origemPagamento = `pagamento_cp:${parcelaId}`;
        const origemDesconto = `desconto_cp:${parcelaId}`;
        
        // Primeiro tenta por documento (lançamentos novos), depois fallback por origem com sufixo
        let { data: originalLaunches, error: fetchLaunchError } = await supabase
            .from('lancamentos')
            .select('id, conta_resultado_id, conta_contabil_id, conta_bancaria_id, valor, tipo, descricao, historico_id, origem')
            .eq('proprietario_id', ownerId)
            .eq('documento', parcelaId)
            .not('origem', 'like', '%_estornada');

        if (fetchLaunchError) throw fetchLaunchError;

        if (!originalLaunches || originalLaunches.length === 0) {
            const { data: fallbackLaunches, error: fallbackError } = await supabase
                .from('lancamentos')
                .select('id, conta_resultado_id, conta_contabil_id, conta_bancaria_id, valor, tipo, descricao, historico_id, origem')
                .eq('proprietario_id', ownerId)
                .or(`origem.eq.${origemPagamento},origem.eq.${origemDesconto}`)
                .not('origem', 'like', '%_estornada');
            if (fallbackError) throw fallbackError;
            originalLaunches = fallbackLaunches;
        }
        
        const originalLaunchIds = (originalLaunches || []).map(l => l.id);
        
        // 4. Gerar Lançamentos de Estorno (Reversão)
        
        // 4.1. Estorno do Pagamento (D: Ativo / C: Passivo)
        for (const orig of originalLaunches.filter(l => l.origem?.startsWith('pagamento_cp') && !l.origem?.includes('_estornada'))) {
            const inverseId = crypto.randomUUID();
            const tipoInvertido = orig.tipo === 'Entrada' ? 'Saida' : 'Entrada'; // Inverte o tipo
            
            // Lançamento de Estorno (Reverte o movimento de Caixa/Banco e Passivo)
            const lancInvert = {
                id: inverseId,
                proprietario_id: ownerId,
                data_movimentacao: dataEstornoISO,
                descricao: `ESTORNO: ${orig.descricao}`,
                valor: orig.valor,
                tipo: tipoInvertido,
                conta_bancaria_id: orig.conta_bancaria_id,
                conta_contabil_id: orig.conta_contabil_id,
                origem: 'estorno_pagamento_manual',
                historico_id: orig.historico_id,
                conta_resultado_id: orig.conta_resultado_id, // Mantém a referência cruzada original
            };
            lancamentosEstornoPayload.push(lancInvert);
        }
        
        // 4.2. Estorno do Desconto Obtido (D: Despesa Estorno / C: Fornecedor) - REGRA DO PROMPT
        if (isDiscountApplied) {
            const descontoLaunch = originalLaunches.find(l => l.origem?.startsWith('desconto_cp') && !l.origem?.includes('_estornada'));
            
            if (descontoLaunch) {
                const valorDesconto = descontoLaunch.valor;
                
                // Buscar contas configuradas
                const { data: configData } = await supabase
                    .from('configuracao_contas_pagar')
                    .select('tipo_registro, conta_contabil_id')
                    .eq('proprietario_id', ownerId)
                    .in('tipo_registro', ['estorno_desconto_obtido', 'a_pagar']);
                    
                const contaEstornoDescontoId = configData?.find(c => c.tipo_registro === 'estorno_desconto_obtido')?.conta_contabil_id;
                const contaFornecedorId = configData?.find(c => c.tipo_registro === 'a_pagar')?.conta_contabil_id;
                
                if (!contaEstornoDescontoId || !contaFornecedorId) {
                    throw new Error('Contas contábeis de estorno de desconto não configuradas.');
                }
                
                // Lançamento 1: D: Estorno Desconto Obtido (Despesa)
                const idEstornoDespesa = crypto.randomUUID();
                const idEstornoPassivo = crypto.randomUUID();
                
                // D: Estorno Desconto Obtido (Despesa) - ENTRADA
                lancamentosEstornoPayload.push({
                    id: idEstornoDespesa,
                    proprietario_id: ownerId,
                    data_movimentacao: dataEstornoISO,
                    descricao: `ESTORNO DESCONTO OBTIDO: ${conta.descricao} (CP ID: ${contaPagarId.substring(0, 8)})`,
                    valor: valorDesconto,
                    tipo: 'Entrada' as const, // Débito na Despesa (Credora)
                    conta_bancaria_id: null,
                    conta_contabil_id: contaEstornoDescontoId, // Conta de Estorno Desconto Obtido (Despesa)
                    origem: 'estorno_pagamento_manual',
                    historico_id: descontoLaunch.historico_id,
                    conta_resultado_id: idEstornoPassivo, // Referência cruzada
                });
                
                // Lançamento 2: C: Fornecedores (Passivo) - CRÉDITO (Saída)
                lancamentosEstornoPayload.push({
                    id: idEstornoPassivo,
                    proprietario_id: ownerId,
                    data_movimentacao: dataEstornoISO,
                    descricao: `REVERSÃO PASSIVO DESCONTO: ${conta.descricao} (CP ID: ${contaPagarId.substring(0, 8)})`,
                    valor: valorDesconto,
                    tipo: 'Saida' as const, // Crédito no Passivo (Credora)
                    conta_bancaria_id: null,
                    conta_contabil_id: contaFornecedorId, // Conta Patrimonial (Passivo)
                    origem: 'estorno_pagamento_manual',
                    historico_id: descontoLaunch.historico_id,
                    conta_resultado_id: idEstornoDespesa, // Referência cruzada
                });
            }
        }

        // 5. Inserir todos os lançamentos de estorno
        const { error: insErr } = await supabase.from('lancamentos').insert(lancamentosEstornoPayload);
        if (insErr) throw insErr;

        // 6. Marcar os lançamentos originais como estornados
        const { error: markError } = await supabase
            .from('lancamentos')
            .update({ origem: 'pagamento_manual_estornada' })
            .in('id', originalLaunchIds);
        if (markError) throw markError;
        
        // 7. Deletar Registros de Pagamento (Histórico)
        const pagamentoIds = pagamentos.map(r => r.id);
        const { error: deletePagamentosError } = await supabase
            .from(tabelaPagamentos)
            .delete()
            .in('id', pagamentoIds);
            
        if (deletePagamentosError) throw deletePagamentosError;
        
        // 8. Resetar a Parcela
        const { error: resetError } = await supabase
            .from(tabelaParcelas)
            .update({
                status: 'aberta',
                valor_pago: 0,
                data_pagamento: null,
                observacao: 'Estorno de pagamento realizado.',
            })
            .eq('id', parcelaId);
            
        if (resetError) throw resetError;
        
        // 9. Resetar o status da conta sintética para 'pendente'
        const { error: updateContaError } = await supabase
            .from(tabelaContasPagar)
            .update({ status: 'pendente' })
            .eq('id', contaPagarId);
            
        if (updateContaError) console.error('Erro ao atualizar conta sintética para pendente:', updateContaError);
        
        // Deletar extrato vinculado se informado
        if (extratoId) {
          await supabase.from('extratos').delete().eq('id', extratoId);
        }

        showSuccess('Pagamento estornado com sucesso! Saldos reajustados.');
        handlePagamentoComplete();
        
    } catch (error: any) {
        console.error('Erro ao estornar pagamento:', error);
        showError('Falha ao estornar pagamento: ' + error.message);
    } finally {
        setIsUndoing(false);
    }
  };

  const handleDesvincularMapeamento = async (parcela: ExtendedParcelaPagar) => {
    if (!parcela.mapeado_extrato_id) return;
    setIsUnlinking(true);
    
    try {
      const result = await desvincularMapeamento(
        parcela.mapeado_extrato_id,
        parcela.id,
        'CP',
        isAdminOrEmployee
      );
      
      if (!result.success) {
        showError('Erro ao desvincular: ' + result.error);
        return;
      }
      
      showSuccess('Mapeamento desvinculado! A parcela voltou para pendente.');
      fetchParcelas();
      onDataChange();
    } catch (error: any) {
      showError('Erro ao desvincular mapeamento: ' + error.message);
    } finally {
      setIsUnlinking(false);
    }
  };

  const totalValor = useMemo(() => parcelas.filter(p => p.numero_parcela < 99).reduce((sum, p) => sum + p.valor_parcela, 0), [parcelas]);
  const totalPago = useMemo(() => parcelas.reduce((sum, p) => sum + (p.valor_pago || 0), 0), [parcelas]);
  const progressoPercentual = totalValor > 0 ? Math.round((totalPago / totalValor) * 100) : 0;

  // Agrupar parcelas em cadeias.
  // Parcelas com numero_parcela >= 99 são reprogramações — não têm linha própria na tabela.
  // Critério forte: observacao contém "parcela_raiz_id:UUID" → vínculo direto.
  // Fallback: parcelas normais (< 99) com observacao contendo 'reprogramado'/'parcelado' são raízes;
  //   as reprogramadas (>= 99) são associadas à raiz mais recente por data_vencimento.
  const gruposParcelas = useMemo(() => {
    const normais = parcelas.filter(p => p.numero_parcela < 99);
    const reprogramadas = parcelas.filter(p => p.numero_parcela >= 99);

    const eRaizDeCadeia = (p: ExtendedParcelaPagar) =>
      p.status === 'paga' &&
      (p.observacao?.toLowerCase().includes('reprogramado') ||
       p.observacao?.toLowerCase().includes('parcelado'));

    const raizes = normais.filter(eRaizDeCadeia).sort(
      (a, b) => new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime()
    );

    const reprogramadasOrdenadas = [...reprogramadas].sort(
      (a, b) => new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime()
    );

    const cadeiaMap = new Map<string, ExtendedParcelaPagar[]>();
    for (const r of normais) {
      cadeiaMap.set(r.id, [r]);
    }

    for (const rep of reprogramadasOrdenadas) {
      // Critério forte: observacao contém "parcela_raiz_id:UUID"
      const matchRaizId = rep.observacao?.match(/parcela_raiz_id:([a-f0-9-]{36})/i);
      if (matchRaizId) {
        const raizId = matchRaizId[1];
        if (cadeiaMap.has(raizId)) {
          cadeiaMap.get(raizId)!.push(rep);
          continue;
        }
      }

      // Fallback: heurística por data_vencimento
      const raizAlvo = raizes
        .filter(r => new Date(r.data_vencimento) <= new Date(rep.data_vencimento))
        .pop();

      if (raizAlvo) {
        cadeiaMap.get(raizAlvo.id)?.push(rep);
      } else {
        const primeiraRaiz = raizes[0];
        if (primeiraRaiz) cadeiaMap.get(primeiraRaiz.id)?.push(rep);
        else cadeiaMap.set(rep.id, [rep]);
      }
    }

    return normais.map(p => {
      const cadeia = cadeiaMap.get(p.id) || [p];
      const ultima = cadeia[cadeia.length - 1];
      const totalPagoCadeia = cadeia.reduce((s, c) => s + (c.valor_pago || 0), 0);
      const valorOriginal = p.valor_parcela;
      const saldoCadeia = ultima.status === 'reprogramada'
        ? ultima.valor_parcela - (ultima.valor_pago || 0)
        : Math.max(0, valorOriginal - totalPagoCadeia);
      const temReprogramacao = cadeia.length > 1;
      return { raiz: p, cadeia, ultima, totalPagoCadeia, valorOriginal, saldoCadeia, temReprogramacao };
    });
  }, [parcelas]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-full sm:max-w-[90vw] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="truncate">Detalhes das Parcelas - {conta.fornecedor}</DialogTitle>
            <DialogDescription>
              {conta.descricao} | Valor Total: {formatCurrency(conta.valor_total)}
            </DialogDescription>
          </DialogHeader>

          <Card className="mb-4">
              <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                          <DollarSign className="w-5 h-5 text-primary" />
                          <span className="font-semibold">Progresso de Pagamento</span>
                      </div>
                      <span className="text-lg font-bold text-primary">{progressoPercentual}%</span>
                  </div>
                  <Progress value={progressoPercentual} className="h-2" />
                  <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                          <p className="text-muted-foreground">Total</p>
                          <p className="font-medium">{formatCurrency(totalValor)}</p>
                      </div>
                      <div>
                          <p className="text-muted-foreground text-green-600">Pago</p>
                          <p className="font-medium text-green-600">{formatCurrency(totalPago)}</p>
                      </div>
                      <div>
                          <p className="text-muted-foreground text-red-600">Restante</p>
                          <p className="font-medium text-red-600">{formatCurrency(totalValor - totalPago)}</p>
                      </div>
                  </div>
              </CardContent>
          </Card>

          <div className="overflow-x-auto">
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>Nº</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead className="text-right">
                              <div className="flex flex-col gap-0.5 items-end text-xs font-normal">
                                  <span className="text-muted-foreground">Valor</span>
                                  <span className="text-green-600">Pago</span>
                                  <span className="text-orange-500">Saldo</span>
                              </div>
                          </TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Data Pagamento</TableHead>
                          <TableHead className="w-[160px]">Conta D</TableHead>
                          <TableHead className="w-[160px]">Conta C</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {loading ? (
                          <TableRow><TableCell colSpan={8} className="text-center">Carregando...</TableCell></TableRow>
                      ) : gruposParcelas.length === 0 ? (
                          <TableRow><TableCell colSpan={8} className="text-center">Nenhuma parcela encontrada.</TableCell></TableRow>
                      ) : (
                          gruposParcelas.map((g) => {
                              const p = g.ultima;
                              const statusVariant = getBadgeVariant(p.status, p.data_vencimento);
                              const isPaga = p.status === 'paga';
                              const isCanceled = p.status === 'cancelada' || p.status === 'bloqueada';
                              const canEditOrDelete = p.status === 'aberta' || p.status === 'parcial' || p.status === 'reprogramada';

                              return (
                                  <TableRow key={p.id}>
                                      <TableCell>
                                          <div className="flex flex-col gap-0.5">
                                              <span>{g.raiz.numero_parcela}</span>
                                              {g.temReprogramacao && (
                                                  <span className="text-xs text-muted-foreground">{g.cadeia.length} etapas</span>
                                              )}
                                          </div>
                                      </TableCell>
                                      <TableCell>
                                          <div className="flex flex-col gap-0.5">
                                              <span>{formatarData(p.data_vencimento)}</span>
                                              {g.temReprogramacao && (
                                                  <span className="text-xs text-muted-foreground">Venc. atual</span>
                                              )}
                                          </div>
                                      </TableCell>
                                      <TableCell className="text-right">
                                          <div className="flex flex-col gap-0.5 items-end text-xs">
                                              <span className="text-muted-foreground">{formatCurrency(g.valorOriginal)}</span>
                                              <span className="text-green-600 font-medium">{formatCurrency(g.totalPagoCadeia)}</span>
                                              <span className={`font-semibold ${g.saldoCadeia > 0.01 ? 'text-orange-500' : 'text-green-600'}`}>
                                                  {formatCurrency(Math.max(0, g.saldoCadeia))}
                                              </span>
                                          </div>
                                      </TableCell>
                                      <TableCell>
                                          <div className="flex flex-col gap-1">
                                              <Badge variant={statusVariant}>
                                                  {p.status}
                                              </Badge>
                                              {g.temReprogramacao && (
                                                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                                                      Reprogramada
                                                  </Badge>
                                              )}
                                              {p.mapeado_extrato_id && (
                                                  <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                                                      Mapeado
                                                  </Badge>
                                              )}
                                          </div>
                                      </TableCell>
                                      <TableCell>{p.data_pagamento ? formatarData(p.data_pagamento) : '-'}</TableCell>
                                      <TableCell className="text-xs align-top">
                                          {(lancamentosPorParcela[p.id] || []).filter(l => l.tipo === 'Entrada').map((l, i) => (
                                              <div key={i} className="whitespace-nowrap text-blue-700">{l.conta_codigo} {l.conta_descricao}</div>
                                          ))}
                                      </TableCell>
                                      <TableCell className="text-xs align-top">
                                          {(lancamentosPorParcela[p.id] || []).filter(l => l.tipo === 'Saida').map((l, i) => (
                                              <div key={i} className="whitespace-nowrap text-orange-700">{l.conta_codigo} {l.conta_descricao}</div>
                                          ))}
                                      </TableCell>
                                      <TableCell className="text-right space-x-1">

                                          {/* Botão de Desvincular Mapeamento */}
                                          {p.mapeado_extrato_id && (
                                              <AlertDialog>
                                                  <AlertDialogTrigger asChild>
                                                      <Button variant="ghost" size="icon" disabled={isUnlinking} title="Desvincular Mapeamento">
                                                          {isUnlinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4 text-orange-500" />}
                                                      </Button>
                                                  </AlertDialogTrigger>
                                                  <AlertDialogContent>
                                                      <AlertDialogHeader>
                                                          <AlertDialogTitle>Desvincular Mapeamento?</AlertDialogTitle>
                                                          <AlertDialogDescription>
                                                              Isso irá remover o vínculo com a transação do extrato, deletar o lançamento de pagamento criado pelo mapeamento, e a parcela voltará para status pendente. A transação do extrato ficará disponível para novo mapeamento.
                                                          </AlertDialogDescription>
                                                      </AlertDialogHeader>
                                                      <AlertDialogFooter>
                                                          <AlertDialogCancel disabled={isUnlinking}>Cancelar</AlertDialogCancel>
                                                          <AlertDialogAction onClick={() => handleDesvincularMapeamento(p)} disabled={isUnlinking}>
                                                              {isUnlinking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Desvincular'}
                                                          </AlertDialogAction>
                                                      </AlertDialogFooter>
                                                  </AlertDialogContent>
                                              </AlertDialog>
                                          )}

                                          {/* Botão de Edição */}
                                          {!isCanceled && (
                                              <Button variant="ghost" size="icon" onClick={() => handleOpenPagamento(p)} title="Editar Pagamento">
                                                  <Edit className="w-4 h-4 text-blue-500" />
                                              </Button>
                                          )}

                                          {/* Botão Ver Detalhes da Parcela */}
                                          <Button variant="ghost" size="icon" onClick={() => setDetalhesParcelaDialog({ open: true, parcela: g.raiz, cadeia: g.cadeia })} title="Ver detalhes de pagamento">
                                              <Receipt className="w-4 h-4 text-purple-500" />
                                          </Button>

                                          {/* Botão de Excluir (Apenas se não estiver paga/cancelada) */}
                                          {canEditOrDelete && (
                                              <AlertDialog>
                                                  <AlertDialogTrigger asChild>
                                                      <Button variant="ghost" size="icon" disabled={isDeleting} title="Excluir Parcela">
                                                          <Trash2 className="w-4 h-4 text-red-500" />
                                                      </Button>
                                                  </AlertDialogTrigger>
                                                  <AlertDialogContent>
                                                      <AlertDialogHeader>
                                                          <AlertDialogTitle>Excluir Parcela?</AlertDialogTitle>
                                                          <AlertDialogDescription>
                                                              Tem certeza que deseja excluir a parcela {p.numero_parcela}? Esta ação é irreversível e só é permitida se não houver pagamentos associados.
                                                          </AlertDialogDescription>
                                                      </AlertDialogHeader>
                                                      <AlertDialogFooter>
                                                          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                                                          <AlertDialogAction onClick={() => handleDeleteParcela(p.id)} disabled={isDeleting}>
                                                              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Excluir'}
                                                          </AlertDialogAction>
                                                      </AlertDialogFooter>
                                                  </AlertDialogContent>
                                              </AlertDialog>
                                          )}

                                          {isPaga && g.saldoCadeia <= 0.01 ? (
                                              p.mapeado_extrato_id ? (
                                                  <Button
                                                      variant="destructive"
                                                      size="icon"
                                                      disabled={true}
                                                      title="Desvincule o mapeamento antes de estornar"
                                                  >
                                                      <Undo2 className="w-4 h-4 opacity-50" />
                                                  </Button>
                                              ) : (
                                                  <Button variant="destructive" size="icon" disabled={isUndoing} onClick={() => handleUndoPayment(p.id)}>
                                                      {isUndoing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                                                  </Button>
                                              )
                                          ) : (
                                              <Button size="sm" onClick={() => handleOpenPagamento(p)} disabled={!canEditOrDelete && !isPaga}>
                                                  <DollarSign className="w-4 h-4" /> Pagar
                                              </Button>
                                          )}
                                          {usuario?.id && (
                                              <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  onClick={() => setLancamentoDialog({ open: true, parcela: p })}
                                                  title={parcelasComLancamento.has(p.id) ? 'Lançamento contábil registrado' : 'Registrar lançamento contábil'}
                                              >
                                                  <BookOpen className={`w-4 h-4 ${parcelasComLancamento.has(p.id) ? 'text-green-600' : 'text-gray-400'}`} />
                                              </Button>
                                          )}
                                      </TableCell>
                                  </TableRow>
                              );
                          })
                      )}
                  </TableBody>
              </Table>
          </div>
          
          {pagamentoDialog.parcela && (
              <RegistrarPagamentoCPDialog
                  open={pagamentoDialog.open}
                  onOpenChange={setPagamentoDialog}
                  parcela={pagamentoDialog.parcela}
                  onSaveComplete={handlePagamentoComplete}
              />
          )}
        </DialogContent>
      </Dialog>

      {lancamentoDialog.open && lancamentoDialog.parcela && ownerId && (
          <LancamentoContabilDialog
              open={lancamentoDialog.open}
              onOpenChange={(open) => setLancamentoDialog({ open, parcela: open ? lancamentoDialog.parcela : null })}
              parcelaId={lancamentoDialog.parcela.id}
              parcelaDescricao={lancamentoDialog.parcela.admin_contas_pagar?.descricao || conta.descricao}
              parcelaValor={lancamentoDialog.parcela.valor_parcela}
              parcelaData={lancamentoDialog.parcela.data_vencimento}
              origemTipo="contas_pagar"
              proprietarioId={ownerId}
              onSaved={() => {
                  if (lancamentoDialog.parcela) {
                      setParcelasComLancamento(prev => new Set([...prev, lancamentoDialog.parcela!.id]));
                  }
                  setLancamentoDialog({ open: false, parcela: null });
              }}
          />
      )}

      {detalhesParcelaDialog.open && detalhesParcelaDialog.parcela && ownerId && (
          <DetalhesPagementoParcelaDialog
              open={detalhesParcelaDialog.open}
              onOpenChange={(open) => setDetalhesParcelaDialog({ open, parcela: open ? detalhesParcelaDialog.parcela : null, cadeia: open ? detalhesParcelaDialog.cadeia : [] })}
              parcela={detalhesParcelaDialog.parcela}
              cadeia={detalhesParcelaDialog.cadeia}
              proprietarioId={ownerId}
              onDataChange={() => {
                  fetchParcelas();
                  onDataChange();
              }}
          />
      )}

      <AlertDialog open={confirmEstornoDialog.open} onOpenChange={(open) => setConfirmEstornoDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Estorno</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Foi encontrado um lançamento no extrato bancário vinculado a este pagamento. Deseja removê-lo também?</p>
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Conta:</span><span className="font-medium">{confirmEstornoDialog.extratoContaNome}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Data:</span><span className="font-medium">{confirmEstornoDialog.extratoData}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Descrição:</span><span className="font-medium">{confirmEstornoDialog.extratoDescricao}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Valor:</span><span className="font-medium text-red-600">{formatCurrency(Math.abs(confirmEstornoDialog.extratoValor))}</span></div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmEstornoDialog(prev => ({ ...prev, open: false }))}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={async () => {
                setConfirmEstornoDialog(prev => ({ ...prev, open: false }));
                await executarUndoPayment(confirmEstornoDialog.parcelaId!, confirmEstornoDialog.extratoId);
              }}
            >
              Estornar e Remover Extrato
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default DetalhesParcelasCPDialog;