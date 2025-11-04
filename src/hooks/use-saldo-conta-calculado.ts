import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { SaldoContaDetalhada } from '@/types/saldo-conta';
import { useSessao } from './use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

interface SaldoCalculado extends SaldoContaDetalhada {
  saldo_atual: number;
}

interface SaldoContaCalculadoHook {
  contas: SaldoCalculado[];
  totalSaldo: number;
  carregando: boolean;
  refetch: () => void;
}

const useSaldoContaCalculado = (filtroTipoSaldo: 'todos' | 'Credito' | 'Debito', filtroContaContabilId: string, filtroNomeDebounced: string): SaldoContaCalculadoHook => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [contas, setContas] = useState<SaldoCalculado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const getEmpresaId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
    return null;
  };
  
  const empresaId = getEmpresaId();

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const buscarContas = useCallback(async () => {
    if (!empresaId || carregandoSessao) {
      setCarregando(false);
      return;
    }
    
    setCarregando(true);
    
    try {
      // 1. Buscar todas as contas de saldo
      let query = supabase
        .from('saldo_contas')
        .select(`
          *,
          plano_contas ( Conta, Descricao )
        `)
        .eq('empresa_id', empresaId);
        
      // Aplicar Filtros (os mesmos de Bancos.tsx)
      if (filtroTipoSaldo !== 'todos') {
          query = query.eq('tipo_saldo', filtroTipoSaldo);
      }
      if (filtroContaContabilId !== 'todos') {
          query = query.eq('conta_contabil_id', filtroContaContabilId);
      }
      if (filtroNomeDebounced) {
          query = query.ilike('nome', `%${filtroNomeDebounced}%`);
      }

      const { data: contasData, error: contasError } = await query.order('nome', { ascending: true });

      if (contasError) throw contasError;
      
      let fetchedContas = contasData as SaldoContaDetalhada[];
      
      // 2. Buscar todos os lançamentos para as contas encontradas
      const contaIds = fetchedContas.map(c => c.id);
      
      if (contaIds.length === 0) {
          setContas([]);
          setCarregando(false);
          return;
      }

      const { data: lancamentosData, error: lancamentosError } = await supabase
        .from('lancamentos')
        .select('valor, tipo, conta_bancaria_id')
        .in('conta_bancaria_id', contaIds);

      if (lancamentosError) throw lancamentosError;

      // 3. Calcular o saldo para cada conta
      const lancamentosPorConta = lancamentosData.reduce((acc, l) => {
        acc[l.conta_bancaria_id] = acc[l.conta_bancaria_id] || { entradas: 0, saidas: 0 };
        if (l.tipo === 'Entrada') {
          acc[l.conta_bancaria_id].entradas += l.valor;
        } else if (l.tipo === 'Saida') {
          acc[l.conta_bancaria_id].saidas += l.valor;
        }
        return acc;
      }, {} as Record<string, { entradas: number, saidas: number }>);

      const contasCalculadas: SaldoCalculado[] = fetchedContas.map(conta => {
        const { entradas = 0, saidas = 0 } = lancamentosPorConta[conta.id] || {};
        
        // Saldo Atual = Saldo Inicial + Entradas - Saídas
        const saldo_atual = conta.saldo_inicial + entradas - saidas;
        
        return {
          ...conta,
          saldo_atual,
        };
      });
      
      // 4. Aplicar filtro de nome no frontend (se a busca por ILIKE não for suficiente)
      let filteredContas = contasCalculadas;
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
  }, [empresaId, carregandoSessao, refreshKey, filtroTipoSaldo, filtroContaContabilId, filtroNomeDebounced]);

  useEffect(() => {
    buscarContas();
  }, [buscarContas]);

  const totalSaldo = contas.reduce((sum, conta) => sum + conta.saldo_atual, 0);

  return { contas, totalSaldo, carregando, refetch };
};

export default useSaldoContaCalculado;