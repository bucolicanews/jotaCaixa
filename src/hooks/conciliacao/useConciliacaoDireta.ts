import { supabase } from '@/integrations/supabase/client';

export interface DadosCategorizacao {
  id_conta_contabil: string;
  id_historico: string;
  observacao?: string;
}

export interface ResultadoConciliacao {
  success: boolean;
  lancamentoId?: string;
  error?: string;
}

export async function conciliarTransacaoDireta(
  transacaoId: string,
  dados: DadosCategorizacao,
  isAdmin: boolean,
  ownerId: string
): Promise<ResultadoConciliacao> {
  try {
    const { data: extrato, error: extratoError } = await supabase
      .from('extratos')
      .select('id, valor, data, descricao, identificacao, tipo, id_saldo_contas')
      .eq('id', transacaoId)
      .single();

    if (extratoError || !extrato) {
      throw extratoError || new Error('Extrato não encontrado');
    }

    const valorAbsoluto = Math.abs(extrato.valor);
    const isEntrada = extrato.tipo === 'Entrada';
    const dataTransacao = extrato.data;
    const contaBancariaId = extrato.id_saldo_contas;

    const tabelaLancamentos = 'lancamentos';
    const ownerKey = 'proprietario_id';

    if (!isEntrada && contaBancariaId) {
      const { data: saldoConta } = await supabase
        .from('saldo_contas')
        .select('saldo_inicial, nome')
        .eq('id', contaBancariaId)
        .single();

      if (saldoConta && saldoConta.saldo_inicial < valorAbsoluto) {
        return {
          success: false,
          error: `Saldo insuficiente na conta "${saldoConta.nome}". Saldo atual: R$ ${saldoConta.saldo_inicial.toFixed(2)}, Valor necessário: R$ ${valorAbsoluto.toFixed(2)}`
        };
      }
    }

    const lancamentoPrincipal: any = {
      proprietario_id: ownerId,
      data_movimentacao: dataTransacao,
      valor: valorAbsoluto,
      tipo: isEntrada ? 'C' : 'D',
      conta_contabil_id: dados.id_conta_contabil,
      historico_id: dados.id_historico,
      descricao: dados.observacao || `Conciliação direta - ${extrato.descricao || extrato.identificacao || 'Sem descrição'}`,
      origem: 'conciliacao_direta',
      conta_bancaria_id: contaBancariaId,
      conciliado: true,
    };

    const { data: lancamentoCriado, error: lancamentoError } = await supabase
      .from(tabelaLancamentos)
      .insert(lancamentoPrincipal)
      .select()
      .single();

    if (lancamentoError) {
      throw lancamentoError;
    }

    if (contaBancariaId) {
      const lancamentoContrapartida: any = {
        proprietario_id: ownerId,
        data_movimentacao: dataTransacao,
        valor: valorAbsoluto,
        tipo: isEntrada ? 'D' : 'C',
        conta_contabil_id: dados.id_conta_contabil,
        historico_id: dados.id_historico,
        descricao: `Contrapartida bancária - ${extrato.descricao || extrato.identificacao || 'Sem descrição'}`,
        origem: 'conciliacao_direta_contrapartida',
        conta_bancaria_id: contaBancariaId,
        conciliado: true,
      };

      const { error: contrapartidaError } = await supabase
        .from(tabelaLancamentos)
        .insert(lancamentoContrapartida);

      if (contrapartidaError) {
        console.warn('Erro ao criar contrapartida:', contrapartidaError);
      }

      const novoSaldo = isEntrada 
        ? supabase.rpc('increment_saldo', { conta_id: contaBancariaId, valor: valorAbsoluto })
        : supabase.rpc('decrement_saldo', { conta_id: contaBancariaId, valor: valorAbsoluto });

      const { error: saldoError } = await novoSaldo;
      
      if (saldoError) {
        // Fallback: buscar saldo atual e atualizar manualmente
        const { data: contaAtual } = await supabase
          .from('saldo_contas')
          .select('saldo_inicial')
          .eq('id', contaBancariaId)
          .single();

        if (contaAtual) {
          const novoSaldoCalculado = isEntrada 
            ? (contaAtual.saldo_inicial || 0) + valorAbsoluto
            : (contaAtual.saldo_inicial || 0) - valorAbsoluto;

          const { error: updateError } = await supabase
            .from('saldo_contas')
            .update({ saldo_inicial: novoSaldoCalculado })
            .eq('id', contaBancariaId);

          if (updateError) {
            console.warn('Erro ao atualizar saldo:', updateError);
          }
        }
      }
    }

    const { error: extratoUpdateError } = await supabase
      .from('extratos')
      .update({ 
        status_mapeamento: 'mapeado_manual',
        conta_contabil_id: dados.id_conta_contabil
      })
      .eq('id', transacaoId);

    if (extratoUpdateError) {
      console.warn('Erro ao atualizar status do extrato:', extratoUpdateError);
    }

    return {
      success: true,
      lancamentoId: lancamentoCriado?.id
    };

  } catch (error: any) {
    console.error('Erro ao conciliar transação direta:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido ao conciliar'
    };
  }
}

export async function buscarHistoricosPadrao(
  isAdmin: boolean,
  ownerId: string
): Promise<{ id: string; descricao: string }[]> {
  console.log('🔍 buscarHistoricosPadrao');
  console.log('  - isAdmin:', isAdmin);
  console.log('  - ownerId:', ownerId);

  const { data, error } = await supabase
    .from('historicos')
    .select('id, descricao')
    .eq('proprietario_id', ownerId)
    .order('descricao', { ascending: true });

  console.log('  - Query executada');
  console.log('  - erro:', error);
  console.log('  - dados retornados:', data?.length || 0);

  if (error) {
    console.error('❌ Erro ao buscar históricos:', error);
    return [];
  }

  console.log('✅ Históricos encontrados:', data?.length || 0);

  return data || [];
}

export async function buscarContasContabeis(
  isAdmin: boolean,
  ownerId: string,
  tipo: 'receita' | 'despesa'
): Promise<{ id: string; codigo: string; nome: string }[]> {
  const tabelaPlanoContas = 'plano_contas';
  const ownerKey = 'proprietario_id';

  let query = supabase
    .from(tabelaPlanoContas)
    .select('id, Conta, Descricao, Analitica')
    .eq(ownerKey, ownerId)
    .eq('Analitica', 'Sim');

  console.log('🔍 buscarContasContabeis');
  console.log('  - isAdmin:', isAdmin);
  console.log('  - ownerId:', ownerId);
  console.log('  - tipo:', tipo);
  console.log('  - tabelaPlanoContas:', tabelaPlanoContas);
  console.log('  - ownerKey:', ownerKey);

  if (tipo === 'receita') {
    query = query.like('Conta', '4.%');
  } else {
    // Para despesa, buscar tanto 5.x.x quanto 6.x.x
    query = query.or('Conta.like.5.%,Conta.like.6.%');
  }

  const { data, error } = await query.order('Conta', { ascending: true });

  console.log('  - Query executada');
  console.log('  - erro:', error);
  console.log('  - dados retornados:', data?.length || 0);
  console.log('📊 Dados brutos da query:', data);
  console.log('🔎 Amostra primeira conta:', data?.[0]);

  if (error) {
    console.error('❌ Erro ao buscar contas contábeis:', error);
    return [];
  }

  const resultado = (data || []).map(c => ({
    id: c.id,
    codigo: c.Conta,
    nome: c.Descricao
  }));
  
  console.log('✅ Contas contábeis mapeadas:', resultado.length);

  return resultado;
}
