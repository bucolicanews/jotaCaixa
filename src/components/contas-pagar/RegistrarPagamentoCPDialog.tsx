import React, { useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { AdminParcelaPagar } from '@/types/contas-pagar';
import useSaldoContaCalculado, { SaldoCalculado } from '@/hooks/use-saldo-conta-calculado';
import { Separator } from '../ui/separator';
import { Historico } from '@/types/historico';
import { Checkbox } from '../ui/checkbox';
import { PlanoContas } from '@/types/plano-contas';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import FormExtratoManualCP from './FormExtratoManualCP';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';

interface ParcelaParaPagamento extends AdminParcelaPagar {
  fornecedor: string;
}

const formSchema = z.object({
  data_pagamento: z.date({ required_error: 'A data é obrigatória.' }),
  forma_pagamento: z.string().min(1, 'A forma de pagamento é obrigatória.'),
  pagamentos: z.array(z.object({
    conta_id: z.string().uuid('Selecione uma conta de origem.'),
    valor_pago: z.coerce.number().positive('O valor deve ser maior que zero.'),
  })).min(1, 'Adicione pelo menos uma forma de pagamento.'),

  acao_saldo_restante: z.enum(['desconto', 'reprogramar', 'parcelar']).optional(),
  nova_data_vencimento: z.date().optional(),
  numero_novas_parcelas: z.coerce.number().int().min(2).optional(),
  intervalo_dias_novas_parcelas: z.coerce.number().int().min(1).optional(),

  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  salvar_como_padrao: z.boolean().optional(),

  conta_patrimonial_id: z.string().uuid('Selecione a conta patrimonial.').nullable(),
}).superRefine((data, ctx) => {
  const saldoDevedor = (ctx.parent as any)?.saldoDevedor || 0;
  const totalPago = data.pagamentos.reduce((sum, p) => sum + (Number(p.valor_pago) || 0), 0);
  const restante = saldoDevedor - totalPago;

  if (restante > 0.01) {
    if (!data.acao_saldo_restante) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Selecione uma ação para o saldo restante.',
        path: ['acao_saldo_restante'],
      });
    } else if (data.acao_saldo_restante === 'reprogramar' && !data.nova_data_vencimento) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A nova data de vencimento é obrigatória.',
        path: ['nova_data_vencimento'],
      });
    } else if (data.acao_saldo_restante === 'parcelar') {
      if (!data.numero_novas_parcelas || data.numero_novas_parcelas < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'O número de parcelas deve ser no mínimo 2.',
          path: ['numero_novas_parcelas'],
        });
      }
      if (!data.nova_data_vencimento) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A data do primeiro vencimento é obrigatória.',
          path: ['nova_data_vencimento'],
        });
      }
      if (!data.intervalo_dias_novas_parcelas || data.intervalo_dias_novas_parcelas < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'O intervalo de dias é obrigatório.',
          path: ['intervalo_dias_novas_parcelas'],
        });
      }
    }
  }
});

type FormValues = z.infer<typeof formSchema>;

interface RegistrarPagamentoCPDialogProps {
  parcela: ParcelaParaPagamento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveComplete: () => void;
}

const RegistrarPagamentoCPDialog: React.FC<RegistrarPagamentoCPDialogProps> = ({ parcela, open, onOpenChange, onSaveComplete }) => {
  const { role, usuario, perfil } = useSessao();
  const { configMap } = useContabilConfig();
  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';

  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [loadingHistoricos, setLoadingHistoricos] = useState(true);

  const [contasPatrimoniais, setContasPatrimoniais] = useState<PlanoContas[]>([]);
  const [loadingContasPatrimoniais, setLoadingContasPatrimoniais] = useState(true);

  const [mapeamentoContabil, setMapeamentoContabil] = useState<Record<string, string | null>>({});
  const [isInitialized, setIsInitialized] = useState(false);

  const [loading, setLoading] = useState(false);
  const [extratoManualDialog, setExtratoManualDialog] = useState(false);
  const [pendingPaymentData, setPendingPaymentData] = useState<FormValues | null>(null);

  const tabelaPagamentos = isAdmin ? 'admin_pagamentos' : 'pagamentos';
  const tabelaParcelas = isAdmin ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar';
  const tabelaContasPagar = isAdmin ? 'admin_contas_pagar' : 'contas_pagar';
  const ownerKey = isAdmin ? 'admin_id' : 'empresa_id';

  const empresaId = (parcela as any)?.empresa_id;
  const proprietarioId = isAdmin ? usuario?.id : empresaId;

  const { contas: contasOrigem, carregando: loadingContas, refetch: refetchSaldos } = useSaldoContaCalculado('todos', 'todos', '', 'bancos', false);

  const saldoDevedor = parcela ? parcela.valor_parcela - (parcela.valor_pago || 0) : 0;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    context: { saldoDevedor },
    defaultValues: {
      data_pagamento: new Date(),
      forma_pagamento: 'Pix',
      pagamentos: [],
      historico_id: null,
      salvar_como_padrao: false,
      conta_patrimonial_id: null,
      acao_saldo_restante: 'desconto',
      nova_data_vencimento: addDays(new Date(), 30),
      numero_novas_parcelas: 2,
      intervalo_dias_novas_parcelas: 30,
    },
  });

  const { control, watch, reset } = form;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "pagamentos",
  });

  const pagamentosArray = watch('pagamentos');
  const totalPago = pagamentosArray.reduce((sum, p) => sum + (Number(p.valor_pago) || 0), 0);
  const restante = saldoDevedor - totalPago;
  const acaoSaldoRestante = watch('acao_saldo_restante');
  const isPagamentoParcial = restante > 0.01;

  const fetchMapeamentoContabil = useCallback(async () => {
    if (!proprietarioId) return;

    const { data, error } = await supabase
      .from('configuracao_contas_pagar')
      .select('tipo_registro, conta_contabil_id')
      .eq('proprietario_id', proprietarioId);

    if (error) {
      console.error('Erro ao buscar mapeamento contábil CP:', error);
      setMapeamentoContabil({});
    } else {
      const map = (data as { tipo_registro: string, conta_contabil_id: string | null }[]).reduce((acc, item) => {
        acc[item.tipo_registro] = item.conta_contabil_id;
        return acc;
      }, {} as Record<string, string | null>);
      setMapeamentoContabil(map);
    }
  }, [proprietarioId]);

  const fetchHistoricos = useCallback(async () => {
    if (!proprietarioId) return;
    setLoadingHistoricos(true);
    const { data, error } = await supabase
      .from('historicos')
      .select('id, descricao, codigo')
      .eq('proprietario_id', proprietarioId)
      .order('descricao');

    if (error) {
      console.error('Erro ao carregar históricos:', error);
      setHistoricos([]);
    } else {
      setHistoricos(data as Historico[]);
    }
    setLoadingHistoricos(false);
  }, [proprietarioId]);

  const fetchContasPatrimoniais = useCallback(async () => {
    if (!proprietarioId) return;
    setLoadingContasPatrimoniais(true);

    const { data, error } = await supabase
      .from('plano_contas')
      .select('id, Conta, Descricao')
      .eq('proprietario_id', proprietarioId)
      .eq('Analitica', 'Sim')
      .eq('is_conta_patrimonial', true)
      .eq('is_a_pagar', true)
      .order('Conta');

    if (error) {
      showError('Erro ao carregar contas patrimoniais: ' + error.message);
      setContasPatrimoniais([]);
    } else {
      setContasPatrimoniais(data as PlanoContas[]);
    }
    setLoadingContasPatrimoniais(false);
  }, [proprietarioId]);

  const fetchHistoricoPadrao = useCallback(async () => {
    if (!proprietarioId) return null;

    const { data, error } = await supabase
      .from('configuracao_contas_pagar')
      .select('conta_contabil_id')
      .eq('proprietario_id', proprietarioId)
      .eq('tipo_registro', 'pagamento_historico_padrao')
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Erro ao buscar histórico padrão CP:', error);
    }

    return data?.conta_contabil_id || null;
  }, [proprietarioId]);

  useEffect(() => {
    if (!open || !parcela || !proprietarioId) {
      setIsInitialized(false);
      return;
    }
    if (isInitialized) return;

    const initializeData = async () => {
      refetchSaldos();
      fetchHistoricos();
      fetchContasPatrimoniais();

      let contaPatrimonialId: string | null = null;
      let defaultHistoricoId: string | null = null;

      await fetchMapeamentoContabil();
      defaultHistoricoId = await fetchHistoricoPadrao();

      const { data: contaSintetica } = await supabase
        .from(tabelaContasPagar)
        .select('id_conta_patrimonial')
        .eq('id', parcela.conta_pagar_id)
        .single();

      contaPatrimonialId = contaSintetica?.id_conta_patrimonial || null;

      const initialPagamentos = contasOrigem.length > 0
        ? [{ conta_id: contasOrigem[0].id, valor_pago: saldoDevedor }]
        : [];

      reset({
        data_pagamento: new Date(),
        forma_pagamento: 'Pix',
        pagamentos: initialPagamentos,
        historico_id: defaultHistoricoId,
        salvar_como_padrao: false,
        conta_patrimonial_id: contaPatrimonialId,
        acao_saldo_restante: 'desconto',
        nova_data_vencimento: addDays(new Date(), 30),
        numero_novas_parcelas: 2,
        intervalo_dias_novas_parcelas: 30,
      });

      setIsInitialized(true);
    };

    initializeData();
  }, [open, parcela, proprietarioId, refetchSaldos, fetchHistoricos, fetchContasPatrimoniais, fetchMapeamentoContabil, fetchHistoricoPadrao, reset, contasOrigem, saldoDevedor, isInitialized, tabelaContasPagar]);

  useEffect(() => {
    if (open && !loadingContas && isInitialized && fields.length === 0 && contasOrigem.length > 0) {
      append({ conta_id: contasOrigem[0].id, valor_pago: saldoDevedor });
    }
  }, [open, loadingContas, contasOrigem, saldoDevedor, isInitialized, append, fields.length]);

  // --- FUNÇÃO DE SALVAMENTO DIRETO (SEM ESTORNOS AUTOMÁTICOS) ---
  const saveDirectPayment = async (values: FormValues, comprovanteUrl: string | null = null, extratoManualValues?: any) => {
    if (!parcela || !proprietarioId || !values.conta_patrimonial_id) {
      showError('Dados da parcela, proprietário ou conta patrimonial estão incompletos.');
      return;
    }

    setLoading(true);

    const contaPagamento = mapeamentoContabil['pagamento'];
    const contaParcelaPagar = mapeamentoContabil['parcela_pagar'];
    const contaDescontoObtido = mapeamentoContabil['desconto_obtido'];

    const { data: contaSintetica, error: csError } = await supabase
      .from(tabelaContasPagar)
      .select(`id_conta_patrimonial, descricao, id_conta_resultado`)
      .eq('id', parcela.conta_pagar_id)
      .single();

    console.log('🔍 Debug - Busca conta sintética:', {
      tabela: tabelaContasPagar,
      contaPagarId: parcela.conta_pagar_id,
      contaSintetica,
      csError,
      role,
    });

    if (csError) {
      showError('Erro ao buscar conta sintética: ' + csError.message);
      setLoading(false);
      return;
    }

    const contaPatrimonial = contaSintetica?.id_conta_patrimonial || values.conta_patrimonial_id;
    const descricaoContaSintetica = contaSintetica?.descricao || 'Pagamento';
    const contaDespesaCriacao = contaSintetica?.id_conta_resultado;

    if (!contaPatrimonial) {
      console.error('Conta patrimonial não encontrada:', {
        contaSinteticaId: parcela.conta_pagar_id,
        contaSintetica,
        contaPatrimonialFormulario: values.conta_patrimonial_id,
        role,
        proprietarioId,
      });
      showError('Erro: conta patrimonial não configurada. Selecione uma conta patrimonial no formulário.');
      setLoading(false);
      return;
    }

    const dataPagamento = values.data_pagamento;
    const dataNoonUTC = new Date(Date.UTC(dataPagamento.getFullYear(), dataPagamento.getMonth(), dataPagamento.getDate(), 12, 0, 0));
    const dataPagamentoISO = dataNoonUTC.toISOString();

    const lancamentosPayload: any[] = [];
    const origemVincular = `pagamento_cp:${parcela.id}`;

    const valorPagoTotal = totalPago;
    const saldoRestanteCalculado = restante;

    try {
      // 0. Inserir Extratos Manuais (se vierem do modal)
      if (extratoManualValues) {
          const extratosPayload = values.pagamentos
              .map(p => {
                  const contaOrigem = contasOrigem.find(c => c.id === p.conta_id);
                  if (!contaOrigem?.plano_contas?.is_banco) return null; 
                  
                  const valorExtrato = -Math.abs(p.valor_pago); 
                  const contaContabilPagamento = mapeamentoContabil['pagamento'];
                  
                  return {
                      empresa_id: proprietarioId,
                      id_saldo_contas: p.conta_id,
                      data: format(dataPagamento, 'yyyy-MM-dd'),
                      descricao: extratoManualValues.descricao_extrato,
                      valor: valorExtrato,
                      tipo: 'Saida' as const,
                      identificacao: extratoManualValues.identificacao || null,
                      conciliado: false,
                      conta_contabil_id: contaContabilPagamento,
                  };
              })
              .filter(e => e !== null);
              
          if (extratosPayload.length > 0) {
              const { error: extratoError } = await supabase.from('extratos').insert(extratosPayload);
              if (extratoError) throw extratoError;
          }
      }

      // 1) Para cada fonte de pagamento: criar 2 lançamentos (Ativo - Saida / Passivo - Entrada)
      for (const pagamento of values.pagamentos) {
        
        // 1.1. Registrar Pagamento (Histórico) - mesma estrutura para Admin e Cliente
        const pagamentoPayload = { 
            parcela_id: parcela.id, 
            [ownerKey]: proprietarioId, 
            valor_pago: pagamento.valor_pago, 
            conta_id: pagamento.conta_id,
            id_conta_contabil: contaPagamento,
            data_pagamento: dataPagamentoISO,
            forma_pagamento: values.forma_pagamento,
            tipo_pagamento: isPagamentoParcial ? 'parcial' : 'total',
            historico_id: values.historico_id,
            id_conta_resultado: contaDespesaCriacao,
            anexo_url: comprovanteUrl,
            observacao: extratoManualValues?.observacao || null,
        };

        const { error: pagamentoError } = await supabase.from(tabelaPagamentos).insert(pagamentoPayload);
        if (pagamentoError) throw pagamentoError;

        const contaDestinoDetalhe = contasOrigem.find(c => c.id === pagamento.conta_id);
        const contaContabilCaixaBanco = contaDestinoDetalhe?.plano_contas?.id;

        if (!contaContabilCaixaBanco) throw new Error('Conta de origem não possui vínculo contábil.');

        const idAtivo = crypto.randomUUID();
        const idPatrimonial = crypto.randomUUID();

        // Lançamento 1: C: Ativo (Caixa/Banco) - CRÉDITO (Saida)
        lancamentosPayload.push({
          id: idAtivo,
          proprietario_id: proprietarioId,
          data_movimentacao: dataPagamentoISO,
          descricao: `Pagamento Parcela ${parcela.id.substring(0, 8)} - ${parcela.fornecedor}`,
          valor: pagamento.valor_pago,
          tipo: 'Saida' as const, // Crédito é 'Saida' no Ativo (Diminui Ativo)
          conta_bancaria_id: pagamento.conta_id,
          conta_contabil_id: contaContabilCaixaBanco,
          origem: origemVincular,
          historico_id: values.historico_id,
          conta_resultado_id: idPatrimonial, // Ativo aponta para Passivo
        });

        // Lançamento 2: D: Passivo (Obrigação a Pagar) - DÉBITO (Entrada)
        lancamentosPayload.push({
          id: idPatrimonial,
          proprietario_id: proprietarioId,
          data_movimentacao: dataPagamentoISO,
          descricao: `Baixa Passivo CP: ${descricaoContaSintetica} (CP ID: ${parcela.conta_pagar_id.substring(0, 8)})`,
          valor: pagamento.valor_pago,
          tipo: 'Entrada' as const,
          conta_bancaria_id: null,
          conta_contabil_id: contaPatrimonial,
          origem: origemVincular,
          historico_id: values.historico_id,
          conta_resultado_id: idAtivo,
        });
      }

      // 2) Tratar desconto (se houver) — mantém lógica contábil correta
      if (isPagamentoParcial && values.acao_saldo_restante === 'desconto' && contaDescontoObtido && contaPatrimonial) {
        // ids para cross-ref
        const idDescontoResultado = crypto.randomUUID();
        const idDescontoPatrimonial = crypto.randomUUID();

        // Lançamento 3: C: Receita (Descontos Obtidos) — CRÉDITO (Saida)
        lancamentosPayload.push({
          id: idDescontoResultado,
          proprietario_id: proprietarioId,
          data_movimentacao: dataPagamentoISO,
          descricao: `Desconto Obtido: ${descricaoContaSintetica} (CP ID: ${parcela.conta_pagar_id.substring(0, 8)})`,
          valor: saldoRestanteCalculado,
          tipo: 'Saida' as const, // Crédito é 'Saida' na Receita (Aumenta Receita Credora)
          conta_bancaria_id: null,
          conta_contabil_id: contaDescontoObtido,
          origem: `desconto_cp:${parcela.id}`,
          historico_id: values.historico_id,
          conta_resultado_id: idDescontoPatrimonial,
        });

        // Lançamento 4: D: Passivo (reduz obrigação do fornecedor) — DÉBITO (Entrada)
        lancamentosPayload.push({
          id: idDescontoPatrimonial,
          proprietario_id: proprietarioId,
          data_movimentacao: dataPagamentoISO,
          descricao: `Baixa Passivo Desconto CP: ${descricaoContaSintetica} (CP ID: ${parcela.conta_pagar_id.substring(0, 8)})`,
          valor: saldoRestanteCalculado,
          tipo: 'Entrada' as const, // DÉBITO é 'Entrada' no Passivo (Diminui Passivo Credora)
          conta_bancaria_id: null,
          conta_contabil_id: contaPatrimonial,
          origem: `desconto_cp:${parcela.id}`,
          historico_id: values.historico_id,
          conta_resultado_id: idDescontoResultado,
        });
      }

      console.log('🔍 Debug - Criação de lançamentos CP:', {
        role,
        usuarioId: usuario?.id,
        empresaId,
        proprietarioId,
        parcelaId: parcela.id,
        contaPatrimonial,
        quantidadeLancamentos: lancamentosPayload.length,
        lancamentos: lancamentosPayload.map(l => ({
          tipo: l.tipo,
          valor: l.valor,
          conta_contabil_id: l.conta_contabil_id,
          proprietario_id: l.proprietario_id,
        })),
      });

      // 3) Inserir todos os lançamentos de uma vez
      const { error: lancamentoError } = await supabase.from('lancamentos').insert(lancamentosPayload);
      
      if (lancamentoError) {
        console.error('❌ Erro ao inserir lançamentos:', {
          error: lancamentoError,
          payload: lancamentosPayload,
        });
        throw lancamentoError;
      } else {
        console.log('✅ Lançamentos criados com sucesso:', {
          quantidade: lancamentosPayload.length,
          proprietarioId,
        });
      }

      // 4) Atualizar parcela / conta sintética
      const finalStatus: AdminParcelaPagar['status'] = isPagamentoParcial ? (values.acao_saldo_restante ? 'paga' : 'parcial') : 'paga';
      const observacaoFinal = isPagamentoParcial
        ? (values.acao_saldo_restante === 'desconto'
          ? `Pago R$ ${valorPagoTotal.toFixed(2)} com R$ ${saldoRestanteCalculado.toFixed(2)} de desconto. ${extratoManualValues?.observacao || ''}`
          : `Pago R$ ${valorPagoTotal.toFixed(2)}. Saldo de R$ ${saldoRestanteCalculado.toFixed(2)} ${values.acao_saldo_restante === 'reprogramar' ? 'reprogramado' : 'parcelado'}. ${extratoManualValues?.observacao || ''}`)
        : extratoManualValues?.observacao || null;

      await supabase.from(tabelaParcelas).update({
        status: finalStatus,
        valor_pago: (parcela.valor_pago || 0) + valorPagoTotal,
        data_pagamento: format(dataPagamento, 'yyyy-MM-dd'),
        id_conta_contabil: contaParcelaPagar,
        observacao: observacaoFinal,
      }).eq('id', parcela.id);

      // 5) Criar novas parcelas se reprogramar/parcelar
      if (isPagamentoParcial && values.acao_saldo_restante === 'reprogramar') {
        await supabase.from(tabelaParcelas).insert({
          conta_pagar_id: parcela.conta_pagar_id,
          [ownerKey]: proprietarioId,
          id_conta_contabil: contaParcelaPagar,
          numero_parcela: 99,
          valor_parcela: saldoRestanteCalculado,
          data_vencimento: format(values.nova_data_vencimento!, 'yyyy-MM-dd'),
          status: 'reprogramada'
        });
      } else if (isPagamentoParcial && values.acao_saldo_restante === 'parcelar') {
        const valorNovaParcela = saldoRestanteCalculado / values.numero_novas_parcelas!;
        const novasParcelas = Array.from({ length: values.numero_novas_parcelas! }).map((_, i) => ({
          conta_pagar_id: parcela.conta_pagar_id,
          [ownerKey]: proprietarioId,
          id_conta_contabil: contaParcelaPagar,
          numero_parcela: 100 + i,
          valor_parcela: valorNovaParcela,
          data_vencimento: format(addDays(values.nova_data_vencimento!, i * values.intervalo_dias_novas_parcelas!), 'yyyy-MM-dd'),
          status: 'reprogramada',
        }));
        await supabase.from(tabelaParcelas).insert(novasParcelas);
      }

      // 6) Atualiza status da conta a pagar se não houver parcelas pendentes
      const { count: parcelasPendentesCount } = await supabase
        .from(tabelaParcelas)
        .select('id', { count: 'exact', head: true })
        .eq('conta_pagar_id', parcela.conta_pagar_id)
        .in('status', ['aberta', 'parcial', 'reprogramada']);

      if (parcelasPendentesCount === 0) {
        await supabase.from(tabelaContasPagar).update({ status: 'pago' }).eq('id', parcela.conta_pagar_id);
      }

      // 7) Salvar histórico padrão se solicitado - Delete + Insert para evitar conflito
      if (values.salvar_como_padrao && values.historico_id) {
        await supabase
          .from('configuracao_historico_padrao')
          .delete()
          .eq('proprietario_id', proprietarioId)
          .eq('tipo_registro', 'pagamento_padrao');
          
        await supabase.from('configuracao_historico_padrao').insert({
          proprietario_id: proprietarioId,
          tipo_registro: 'pagamento_padrao',
          historico_id: values.historico_id,
        });
      }

      showSuccess('Pagamento registrado com sucesso!');
      onSaveComplete();
      onOpenChange(false);
    } catch (error: any) {
      showError(`Falha ao registrar pagamento: ${error?.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  // submit do form
  const onSubmit = async (values: FormValues) => {
    if (!parcela || !proprietarioId) {
      showError('Dados da parcela ou proprietário estão incompletos.');
      return;
    }

    if (isCliente && !empresaId) {
      showError('Erro: parcela sem empresa_id associado. Contate o suporte.');
      return;
    }

    if (Math.abs(restante) > 0.01 && !isPagamentoParcial) {
      showError('O valor total pago deve ser igual ao saldo devedor da parcela.');
      return;
    }

    // valida saldo das contas origem
    for (const pagamento of values.pagamentos) {
      const contaSelecionada = contasOrigem.find(c => c.id === pagamento.conta_id);
      if (!contaSelecionada) {
        showError(`Conta de origem com ID ${pagamento.conta_id} não encontrada.`);
        return;
      }
      if (contaSelecionada.saldo_atual < pagamento.valor_pago) {
        showError(`Saldo insuficiente na conta "${contaSelecionada.nome}". Saldo: ${formatCurrency(contaSelecionada.saldo_atual)}, Tentativa de Pagar: ${formatCurrency(pagamento.valor_pago)}`);
        return;
      }
    }

    // se houver conta do tipo banco, abrir modal de extrato manual
    const hasBankPayment = values.pagamentos.some(p => {
      const conta = contasOrigem.find(c => c.id === p.conta_id);
      return conta?.plano_contas?.is_banco === true;
    });

    if (hasBankPayment) {
      setPendingPaymentData(values);
      setExtratoManualDialog(true);
      return;
    }

    // salvar diretamente
    await saveDirectPayment(values);
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const isSubmitDisabled = loading || form.formState.isSubmitting || (Math.abs(restante) > 0.01 && !isPagamentoParcial) || (isPagamentoParcial && !acaoSaldoRestante);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
            <DialogDescription>Saldo devedor da parcela: {formatCurrency(saldoDevedor)}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="data_pagamento" render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data do Pagamento</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "dd/MM/yy", { locale: ptBR }) : <span>Data</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="forma_pagamento" render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Forma de Pagamento</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <Separator />

              <div className="space-y-4">
                <FormLabel>Fontes de Pagamento (Ativo)</FormLabel>
                {fields.map((item, index) => {
                  const conta = contasOrigem.find(c => c.id === item.conta_id);
                  const isBank = conta?.plano_contas?.is_banco;

                  return (
                    <div key={item.id} className="flex items-end space-x-2 p-2 border rounded-md">
                      <FormField control={control} name={`pagamentos.${index}.conta_id`} render={({ field }) => (
                        <FormItem className="flex-1">
                          <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingContas}>
                            <FormControl><SelectTrigger className={cn(isBank && 'border-blue-500')}><SelectValue placeholder="Selecione a conta" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {contasOrigem.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.nome} ({formatCurrency(c.saldo_atual)})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={control} name={`pagamentos.${index}.valor_pago`} render={({ field }) => (
                        <FormItem className="w-1/3">
                          <FormControl><Input type="number" step="0.01" placeholder="Valor" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
                <Button type="button" variant="outline" size="sm" onClick={() => append({ conta_id: '', valor_pago: 0 })}>
                  <PlusCircle className="w-4 h-4 mr-2" /> Adicionar Fonte de Pagamento
                </Button>
              </div>

              <Separator />

              <FormField control={form.control} name="conta_patrimonial_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Conta Patrimonial (Obrigação a Pagar)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingContasPatrimoniais}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={loadingContasPatrimoniais ? "Carregando Contas..." : `Selecione a conta de Passivo (${configMap.Passivo}.x.x)`} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={null as any}>Nenhum (Não Mapear)</SelectItem>
                      {contasPatrimoniais.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.Conta} - {c.Descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                  {contasPatrimoniais.length === 0 && !loadingContasPatrimoniais && (
                    <p className="text-sm text-red-500">
                      Nenhuma conta Patrimonial marcada como Contas a Pagar no Plano de Contas.
                    </p>
                  )}
                </FormItem>
              )} />

              {(isAdmin || isCliente) && (
                <div className="space-y-2 pt-2 border-t">
                  <FormField control={form.control} name="historico_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Histórico do Pagamento (Opcional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingHistoricos}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={loadingHistoricos ? "Carregando Históricos..." : "Selecione o histórico"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={null as any}>Nenhum</SelectItem>
                          {historicos.map(h => (
                            <SelectItem key={h.id} value={h.id}>
                              {h.codigo && `[${h.codigo}] `}{h.descricao}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="salvar_como_padrao" render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={!form.watch('historico_id')}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Definir este Histórico como Padrão para Pagamentos</FormLabel>
                      </div>
                    </FormItem>
                  )} />
                </div>
              )}

              {isPagamentoParcial && (
                <div className="space-y-4 pt-4 border-t">
                  <h3 className="font-semibold text-destructive">Saldo restante: {formatCurrency(restante)}</h3>
                  <FormField control={form.control} name="acao_saldo_restante" render={({ field }) => (
                    <FormItem>
                      <FormLabel>O que fazer com o saldo restante?</FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="space-y-2">
                          <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="desconto" /></FormControl><FormLabel className="font-normal">Conceder Desconto Obtido (Receita)</FormLabel></FormItem>
                          <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="reprogramar" /></FormControl><FormLabel className="font-normal">Reprogramar Saldo</FormLabel></FormItem>
                          <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="parcelar" /></FormControl><FormLabel className="font-normal">Parcelar Saldo</FormLabel></FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {acaoSaldoRestante === 'reprogramar' && <FormField control={form.control} name="nova_data_vencimento" render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Nova Data de Vencimento</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                              {field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Escolha a data</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )} />}

                  {acaoSaldoRestante === 'parcelar' && (
                    <div className="grid grid-cols-3 gap-4 items-end">
                      <FormField control={control} name="numero_novas_parcelas" render={({ field }) => (<FormItem><FormLabel>Nº Parcelas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={control} name="intervalo_dias_novas_parcelas" render={({ field }) => (<FormItem><FormLabel>Intervalo</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={control} name="nova_data_vencimento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>1º Venc.</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy", { locale: ptBR }) : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                    </div>
                  )}
                </div>
              )}

              <div className="p-4 bg-secondary rounded-md space-y-2 text-sm">
                <div className="flex justify-between font-medium"><p>Total Informado:</p><p>{formatCurrency(totalPago)}</p></div>
                <Separator />
                <div className={cn("flex justify-between font-bold text-lg", Math.abs(restante) > 0.01 ? 'text-red-600' : 'text-green-600')}>
                  <p>Restante a Pagar:</p>
                  <p>{formatCurrency(restante)}</p>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitDisabled}>
                <Loader2 className={cn("mr-2 h-4 w-4 animate-spin", (loading || form.formState.isSubmitting) && "hidden")} />
                Confirmar Pagamento
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Modal Extrato Manual */}
      {extratoManualDialog && pendingPaymentData && parcela && (
        <Dialog open={extratoManualDialog} onOpenChange={setExtratoManualDialog}>
          <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Registro de Extrato Manual</DialogTitle>
              <DialogDescription>Confirme os detalhes do extrato para evitar duplicidade na conciliação.</DialogDescription>
            </DialogHeader>
            <FormExtratoManualCP
              parcela={parcela}
              pagamentoDetalhes={pendingPaymentData.pagamentos.map(p => ({ conta_id: p.conta_id, valor_pago: p.valor_pago }))}
              formaPagamento={pendingPaymentData.forma_pagamento}
              dataPagamento={pendingPaymentData.data_pagamento}
              historicoId={pendingPaymentData.historico_id}
              contaPatrimonialId={pendingPaymentData.conta_patrimonial_id}
              contasOrigem={contasOrigem}
              mapeamentoContabil={mapeamentoContabil}
              onSaveComplete={onSaveComplete}
              onClose={() => setExtratoManualDialog(false)}
              // Passa os valores do formulário principal para o modal de extrato
              parentValues={pendingPaymentData} 
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default RegistrarPagamentoCPDialog;