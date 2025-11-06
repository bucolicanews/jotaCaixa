import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSessao } from './use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { PlanoContas } from '@/types/plano-contas';
import { SaldoConta } from '@/types/saldo-conta';
import { format } from 'date-fns';

interface ContaBalanco extends PlanoContas {
  saldo_final: number;
  tipo_principal: 'Ativo' | 'Passivo' | 'Patrimonio Liquido' | 'Resultado' | 'Outros';
  sub_tipo: 'Circulante' | 'Nao Circulante' | 'N/A';
}

interface BalancoData {
  contas: ContaBalanco[];
  totalAtivo: number;
  totalPassivo: number;
  totalPatrimonioLiquido: number;
  resultadoLiquido: number;
  carregando: boolean;
  refetch: () => void;
}

const getTipoPrincipal = (conta: string): ContaBalanco['tipo_principal'] => {
  if (conta.startsWith('1')) return 'Ativo';
  if (conta.startsWith('2.1')) return 'Passivo'; // Passivo (2.1)
  if (conta.startsWith('2.2')) return 'Passivo'; // Passivo (2.2)
  if (conta.startsWith('3')) return 'Patrimonio Liquido';
  if (conta.startsWith('4') || conta.startsWith('5')) return 'Resultado';
  return 'Outros';
};

const getSubTipo = (conta: string): ContaBalanco['sub_tipo'] => {
    if (conta.startsWith('1.1')) return 'Circulante'; // Ativo Circulante
    if (conta.startsWith('1.2')) return 'Nao Circulante'; // Ativo Não Circulante
    if (conta.startsWith('2.1')) return 'Circulante'; // Passivo Circulante
    if (conta.startsWith('2.2')) return 'Nao Circulante'; // Passivo Não Circulante
    return 'N/A';
};

export function useBalancoPatrimonial(endDate: Date | undefined): BalancoData {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [contasBalanco, setContasBalanco] = useState<ContaBalanco[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const getEmpresaId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
    return null;
  };
  
  const empresaId = getEmpresaId();
  const endDateISO = endDate ? format(endDate, 'yyyy-MM-dd') : undefined;

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const fetchBalanco = useCallback(async () => {
    if (!empresaId || !endDateISO) {
      setCarregando(false);
      return;
    }
    
    setCarregando(true);
    
    try {
      // 1. Buscar Plano de Contas
      const { data: planoContasData, error: pcError } = await supabase
        .from('plano_contas')
        .select('*')
        .eq('proprietario_id', empresaId)
        .order('Conta', { ascending: true });
        
      if (pcError) throw pcError;
      const planoContas = planoContasData as PlanoContas[];
      
      // 2. Buscar Contas de Saldo (para saldos iniciais)
      const { data: saldoContasData, error: scError } = await supabase
        .from('saldo_contas')
        .select('id, conta_contabil_id, saldo_inicial')
        .eq('empresa_id', empresaId);
        
      if (scError) throw scError;
      const saldoContas = saldoContasData as SaldoConta[];
      
      const saldoInicialMap = saldoContas.reduce((acc, sc) => {
          if (sc.conta_contabil_id) {
              acc[sc.conta_contabil_id] = (acc[sc.conta_contabil_id] || 0) + sc.saldo_inicial;
          }
          return acc;
      }, {} as Record<string, number>);

      // 3. Buscar Lançamentos até a data final
      const { data: lancamentosData, error: lError } = await supabase
        .from('lancamentos')
        .select('valor, tipo, conta_contabil_id')
        .eq('empresa_id', empresaId)
        .lte('data_movimentacao', endDateISO);
        
      if (lError) throw lError;
      
      // 4. Calcular o saldo de cada conta contábil
      const movimentosMap = lancamentosData.reduce((acc, l) => {
        if (l.conta_contabil_id) {
          const valor = l.tipo === 'Entrada' ? l.valor : -l.valor;
          acc[l.conta_contabil_id] = (acc[l.conta_contabil_id] || 0) + valor;
        }
        return acc;
      }, {} as Record<string, number>);
      
      // 5. Combinar e calcular o saldo final
      const contasCalculadas: ContaBalanco[] = planoContas.map(pc => {
        const saldoInicial = saldoInicialMap[pc.id] || 0;
        const movimentos = movimentosMap[pc.id] || 0;
        
        let saldo_final = saldoInicial + movimentos;
        
        if (pc.is_conta_resultado) {
            saldo_final = movimentos;
        }
        
        return {
          ...pc,
          saldo_final,
          tipo_principal: getTipoPrincipal(pc.Conta),
          sub_tipo: getSubTipo(pc.Conta),
        };
      });
      
      setContasBalanco(contasCalculadas);

    } catch (error: any) {
      console.error('Erro ao calcular balanço:', error);
      showError('Falha ao carregar dados do balanço: ' + error.message);
      setContasBalanco([]);
    } finally {
      setCarregando(false);
    }
  }, [empresaId, endDateISO, refreshKey]);

  useEffect(() => {
    if (!carregandoSessao && empresaId) {
      fetchBalanco();
    }
  }, [carregandoSessao, empresaId, fetchBalanco]);
  
  // 6. Calcular totais
  const totalAtivo = contasBalanco
    .filter(c => c.tipo_principal === 'Ativo')
    .reduce((sum, c) => sum + c.saldo_final, 0);
    
  const totalPassivo = contasBalanco
    .filter(c => c.tipo_principal === 'Passivo')
    .reduce((sum, c) => sum + c.saldo_final, 0);
    
  const totalPatrimonioLiquido = contasBalanco
    .filter(c => c.tipo_principal === 'Patrimonio Liquido')
    .reduce((sum, c) => sum + c.saldo_final, 0);
    
  const resultadoLiquido = contasBalanco
    .filter(c => c.tipo_principal === 'Resultado')
    .reduce((sum, c) => sum + c.saldo_final, 0);

  return {
    contas: contasBalanco,
    totalAtivo,
    totalPassivo,
    totalPatrimonioLiquido,
    resultadoLiquido,
    carregando,
    refetch,
  };
}