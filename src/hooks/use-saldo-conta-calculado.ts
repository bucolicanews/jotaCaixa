import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { SaldoContaDetalhada } from '@/types/saldo-conta';
import { useSessao } from './use-sessao';
import { useOwner } from './use-owner'; // Importando o hook centralizado

interface SaldoCalculado extends SaldoContaDetalhada {
  saldo_atual: number;
}

type Scope = 'bancos' | 'patrimonial';

interface SaldoContaCalculadoHook {
  contas: SaldoCalculado[];
  totalSaldo: number;
  carregando: boolean;
  refetch: () => void;
}

const useSaldoContaCalculado = (
    filtroTipoSaldo: 'todos' | 'Credito' | 'Debito' | 'Receita' | 'Despesa', 
    filtroContaContabilId: string, 
    filtroNomeDebounced: string, 
    scope: Scope = 'bancos',
    isBancoOnly: boolean = false
): SaldoContaCalculadoHook => {
  const { carregando: carregandoSessao } = useSessao();
  const { ownerId } = useOwner(); // Usando o hook centralizado para obter o ID do proprietário
  const [contas, setContas] = useState<SaldoCalculado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);
  
  const fetchContasAndLancamentos = useCallback(async (targetOwnerId: string) => {
      let contasQuery = supabase
        .from('saldo_contas')
        .select(`*, plano_contas ( id, Conta, Descricao, is_conta_caixa_banco, is_conta_patrimonial, is_caixa, is_banco )`)
        .eq('proprietario_id', targetOwnerId);
        
      if (filtroTipoSaldo !== 'todos') {
          contasQuery = contasQuery.eq('tipo_saldo', filtroTipoSaldo);
      }
      if (filtroContaContabilId !== 'todos') {
          contasQuery = contasQuery.eq('conta_contabil_id', filtroContaContabilId);
      }
      if (filtroNomeDebounced) {
          contasQuery = contasQuery.ilike('nome', `%${filtroNomeDebounced}%`);
      }
      
      const { data: contasData, error: contasError } = await contasQuery.order('nome', { ascending: true });
      if (contasError) throw contasError;
      
      let fetchedContas = contasData as SaldoContaDetalhada[];
      const contaIds = fetchedContas.map(c => c.id);
      const contaContabilIds = fetchedContas.map(c => c.plano_contas?.id).filter((id): id is string => !!id);
      
      if (contaIds.length === 0 && contaContabilIds.length === 0) {
          return { fetchedContas: [], lancamentosData: [], extratoData: [] };
      }

      const orClauses = [
          `conta_bancaria_id.in.(${contaIds.join(',')})`,
          `conta_contabil_id.in.(${contaContabilIds.join(',')})`,
      ];
      
      let lancamentosQuery = supabase
        .from('lancamentos')
        .select('valor, tipo, conta_contabil_id, conta_bancaria_id, origem')
        .eq('proprietario_id', targetOwnerId)
        .or(orClauses.join(','));

      const { data: lancamentosData, error: lancamentosError } = await lancamentosQuery;
      if (lancamentosError) throw lancamentosError;
      
        let extratoData: any[] = [];
        if (contaIds.length > 0) {
            const { data, error } = await supabase
                .from('extratos')
                .select('valor, tipo, id_saldo_contas')
                .eq('empresa_id', targetOwnerId)
                .eq('conciliado', false)
                .in('id_saldo_contas', contaIds);

            if (error) throw error;
            if (data) extratoData = data;
        }

      return { fetchedContas, lancamentosData, extratoData };
  }, [filtroTipoSaldo, filtroContaContabilId, filtroNomeDebounced]);


  const buscarContas = useCallback(async () => {
    if (!ownerId || carregandoSessao) {
      setCarregando(false);
      return;
    }
    
    setCarregando(true);
    
    try {
        const { fetchedContas, lancamentosData, extratoData } = await fetchContasAndLancamentos(ownerId);

      const lancamentosPorConta = fetchedContas.reduce((acc, conta) => {
        acc[conta.id] = { entradas: 0, saidas: 0 };
        return acc;
      }, {} as Record<string, { entradas: number, saidas: number }>);
      
      const contaContabilToSaldoIdMap = fetchedContas.reduce((acc, c) => {
          if (c.conta_contabil_id) acc[c.conta_contabil_id] = c.id;
          return acc;
      }, {} as Record<string, string>);

      lancamentosData.forEach(l => {
        const origem = l.origem || '';
        
        if (origem.includes('estorno') || origem.includes('estornada')) return; 
        
        let targetSaldoId: string | null = null;
        
        if (l.conta_bancaria_id && lancamentosPorConta[l.conta_bancaria_id]) {
            targetSaldoId = l.conta_bancaria_id;
        } 
        else if (l.conta_contabil_id && contaContabilToSaldoIdMap[l.conta_contabil_id]) {
            targetSaldoId = contaContabilToSaldoIdMap[l.conta_contabil_id];
        }
        
        if (targetSaldoId && lancamentosPorConta[targetSaldoId]) {
            if (l.tipo === 'Entrada') {
                lancamentosPorConta[targetSaldoId].entradas += l.valor;
            } else if (l.tipo === 'Saida') {
                lancamentosPorConta[targetSaldoId].saidas += l.valor;
            }
        }
      });
      
      (extratoData || []).forEach((e: any) => {
        if (e.id_saldo_contas && lancamentosPorConta[e.id_saldo_contas]) {
            const valor = parseFloat(e.valor) || 0;
            if (e.tipo === 'Entrada') {
                lancamentosPorConta[e.id_saldo_contas].entradas += valor;
            } else if (e.tipo === 'Saida') {
                lancamentosPorConta[e.id_saldo_contas].saidas += valor;
            }
        }
    });

      const contasCalculadas: SaldoCalculado[] = fetchedContas.map(conta => {
        const { entradas = 0, saidas = 0 } = lancamentosPorConta[conta.id] || {};
        
        const saldo_atual = conta.saldo_inicial + entradas - saidas;
        
        return {
          ...conta,
          saldo_atual,
        };
      });
      
      let filteredContas = contasCalculadas;
      
      if (scope === 'bancos') {
          filteredContas = filteredContas.filter(c => c.plano_contas?.is_caixa || c.plano_contas?.is_banco);
      } else if (scope === 'patrimonial') {
          filteredContas = filteredContas.filter(c => 
              c.plano_contas?.is_conta_patrimonial && 
              !c.plano_contas?.is_caixa && 
              !c.plano_contas?.is_banco
          );
      }
      
      if (isBancoOnly) {
          filteredContas = filteredContas.filter(c => c.plano_contas?.is_banco === true);
      }
      
      if (filtroNomeDebounced) {
          const termo = filtroNomeDebounced.toLowerCase();
          filteredContas = filteredContas.filter(conta => {
              const nomeMatch = conta.nome.toLowerCase().includes(termo);
              const contaContabilMatch = conta.plano_contas?.Descricao?.toLowerCase().includes(termo);
              return nomeMatch || contaContabilMatch;
          });
      }

      setContas(filteredContas);

    } catch (error: any) {
      console.error('Erro ao buscar e calcular saldos:', error);
      showError('Falha ao carregar saldos: ' + error.message);
      setContas([]);
    } finally {
      setCarregando(false);
    }
  }, [ownerId, carregandoSessao, filtroNomeDebounced, fetchContasAndLancamentos, scope, isBancoOnly, filtroTipoSaldo, filtroContaContabilId]);

  useEffect(() => {
    buscarContas();
  }, [buscarContas, refreshKey]);

  const totalSaldo = contas.reduce((sum, conta) => sum + conta.saldo_atual, 0);

  return { contas, totalSaldo, carregando, refetch };
};

export default useSaldoContaCalculado;