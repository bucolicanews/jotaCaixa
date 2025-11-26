import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { SaldoContaDetalhada } from '@/types/saldo-conta';
import { useSessao } from './use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

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

const useSaldoContaCalculado = (filtroTipoSaldo: 'todos' | 'Credito' | 'Debito' | 'Receita' | 'Despesa', filtroContaContabilId: string, filtroNomeDebounced: string, scope: Scope = 'bancos'): SaldoContaCalculadoHook => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [contas, setContas] = useState<SaldoCalculado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const getEmpresaId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null; // FIX: proprietario_id -> cliente_id
    return null;
  };
  
  const empresaId = getEmpresaId();

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);
  
  // Função auxiliar para buscar contas e lançamentos (sem data de corte)
  const fetchContasAndLancamentos = useCallback(async (targetEmpresaId: string) => {
      // 1. Buscar contas de saldo (filtradas ou todas)
      let contasQuery = supabase
        .from('saldo_contas')
        .select(`*, plano_contas ( id, Conta, Descricao, is_conta_caixa_banco, is_conta_patrimonial, is_caixa, is_banco )`) // ADICIONADO is_caixa e is_banco
        .eq('proprietario_id', targetEmpresaId);
        
      // Aplica Filtros de UI
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
          return { fetchedContas: [], lancamentosData: [] };
      }

      // 2. Buscar todos os lançamentos
      
      // Cláusula OR para buscar lançamentos:
      // A) Movimentações de Caixa/Banco (conta_bancaria_id IN contaIds)
      // B) Movimentações Patrimoniais (conta_contabil_id IN contaContabilIds)
      const orClauses = [
          `conta_bancaria_id.in.(${contaIds.join(',')})`,
          `conta_contabil_id.in.(${contaContabilIds.join(',')})`,
      ];
      
      let lancamentosQuery = supabase
        .from('lancamentos')
        .select('valor, tipo, conta_contabil_id, conta_bancaria_id, origem') // ADD origem
        .eq('proprietario_id', targetEmpresaId)
        .or(orClauses.join(','));

      const { data: lancamentosData, error: lancamentosError } = await lancamentosQuery;
      if (lancamentosError) throw lancamentosError;
      
      return { fetchedContas, lancamentosData };
  }, [filtroTipoSaldo, filtroContaContabilId, filtroNomeDebounced]);


  const buscarContas = useCallback(async () => {
    if (!empresaId || carregandoSessao) {
      setCarregando(false);
      return;
    }
    
    setCarregando(true);
    
    try {
      const { fetchedContas, lancamentosData } = await fetchContasAndLancamentos(empresaId);

      // 3. Inicializar o mapa de movimentos por SaldoConta ID
      const lancamentosPorConta = fetchedContas.reduce((acc, conta) => {
        acc[conta.id] = { entradas: 0, saidas: 0 };
        return acc;
      }, {} as Record<string, { entradas: number, saidas: number }>);
      
      // Mapeamento de Conta Contábil ID para Saldo Conta ID
      const contaContabilToSaldoIdMap = fetchedContas.reduce((acc, c) => {
          if (c.conta_contabil_id) acc[c.conta_contabil_id] = c.id;
          return acc;
      }, {} as Record<string, string>);

      lancamentosData.forEach(l => {
        // IGNORA LANÇAMENTOS ORIGINAIS ESTORNADOS
        if (l.origem === 'movimentacao_direta_estornada') return; 
        
        let targetSaldoId: string | null = null;
        
        // Prioridade 1: Movimentação de Caixa/Banco (usa conta_bancaria_id)
        if (l.conta_bancaria_id && lancamentosPorConta[l.conta_bancaria_id]) {
            targetSaldoId = l.conta_bancaria_id;
        } 
        // Prioridade 2: Movimentação Patrimonial (usa conta_contabil_id)
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

      const contasCalculadas: SaldoCalculado[] = fetchedContas.map(conta => {
        const { entradas = 0, saidas = 0 } = lancamentosPorConta[conta.id] || {};
        
        // Saldo Atual = Saldo Inicial + Entradas - Saídas
        const saldo_atual = conta.saldo_inicial + entradas - saidas;
        
        return {
          ...conta,
          saldo_atual,
        };
      });
      
      // 4. Aplicar filtro de ESCOPO no frontend
      let filteredContas = contasCalculadas;
      
      if (scope === 'bancos') {
          // Filtra apenas contas marcadas como Caixa/Banco
          filteredContas = filteredContas.filter(c => c.plano_contas?.is_conta_caixa_banco);
      } else if (scope === 'patrimonial') {
          // Filtra apenas contas marcadas como Patrimonial
          filteredContas = filteredContas.filter(c => c.plano_contas?.is_conta_patrimonial);
      }
      
      // 5. Aplicar filtro de nome no frontend (se a busca por ILIKE não for suficiente)
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
  }, [empresaId, carregandoSessao, filtroNomeDebounced, fetchContasAndLancamentos, scope]);

  useEffect(() => {
    buscarContas();
  }, [buscarContas, refreshKey]);

  const totalSaldo = contas.reduce((sum, conta) => sum + conta.saldo_atual, 0);

  return { contas, totalSaldo, carregando, refetch };
};export default useSaldoContaCalculado;