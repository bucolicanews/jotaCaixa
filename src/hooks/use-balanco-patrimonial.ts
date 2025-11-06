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
}

interface BalancoData {
  contas: ContaBalanco[];
  totalAtivo: number;
  totalPassivo: number;
  totalPatrimonioLiquido: number;
  resultadoLiquido: number; // Adicionando resultado líquido para facilitar
  carregando: boolean;
  refetch: () => void;
}

const getTipoPrincipal = (conta: string): ContaBalanco['tipo_principal'] => {
  if (conta.startsWith('1')) return 'Ativo';
  if (conta.startsWith('2')) return 'Passivo';
  if (conta.startsWith('3')) return 'Patrimonio Liquido';
  if (conta.startsWith('4') || conta.startsWith('5')) return 'Resultado';
  return 'Outros';
};

/**
 * Consolida os saldos das contas analíticas para as contas sintéticas.
 * @param contas A lista de contas com saldos iniciais calculados.
 * @returns A lista de contas com saldos consolidados.
 */
const consolidateBalances = (contas: ContaBalanco[]): ContaBalanco[] => {
    // 1. Cria um mapa de saldos por ID
    const saldoMap: Record<string, number> = contas.reduce((acc, c) => {
        acc[c.id] = c.saldo_final;
        return acc;
    }, {} as Record<string, number>);

    // 2. Ordena as contas pelo código (do mais específico para o mais geral)
    const sortedContas = [...contas].sort((a, b) => b.Conta.localeCompare(a.Conta));

    // 3. Consolida de baixo para cima
    for (const conta of sortedContas) {
        if (conta.Analitica === 'Sim') continue; // Ignora analíticas, elas já têm o saldo base

        // Encontra o código pai (removendo o último segmento)
        const parts = conta.Conta.split('.');
        parts.pop();
        const parentCode = parts.join('.');

        // Percorre todas as contas para encontrar as filhas diretas
        for (const child of contas) {
            if (child.Conta.startsWith(conta.Conta) && child.Conta !== conta.Conta) {
                // Se a conta filha ainda não foi consolidada, usa o saldo dela
                const saldoFilho = saldoMap[child.id];
                
                // Adiciona o saldo do filho ao saldo do pai (se o filho for analítico ou já tiver sido consolidado)
                if (child.Analitica === 'Sim' || child.Conta.startsWith(parentCode)) {
                    saldoMap[conta.id] = (saldoMap[conta.id] || 0) + saldoFilho;
                }
            }
        }
    }
    
    // 4. Atualiza a lista de contas com os saldos consolidados
    return contas.map(c => ({
        ...c,
        saldo_final: saldoMap[c.id] !== undefined ? saldoMap[c.id] : c.saldo_final,
    }));
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
      
      // 4. Calcular o saldo de cada conta contábil (apenas analíticas e sintéticas que podem ter saldo inicial)
      const movimentosMap = lancamentosData.reduce((acc, l) => {
        if (l.conta_contabil_id) {
          const valor = l.tipo === 'Entrada' ? l.valor : -l.valor;
          acc[l.conta_contabil_id] = (acc[l.conta_contabil_id] || 0) + valor;
        }
        return acc;
      }, {} as Record<string, number>);
      
      // 5. Calcular o saldo base (apenas analíticas e sintéticas que podem ter saldo inicial)
      let contasCalculadas: ContaBalanco[] = planoContas.map(pc => {
        const saldoInicial = saldoInicialMap[pc.id] || 0;
        const movimentos = movimentosMap[pc.id] || 0;
        
        let saldo_final = 0;
        
        // Se for conta de saldo (Ativo/Passivo), o saldo é Inicial + Movimentos
        if (pc.is_conta_saldo) {
            saldo_final = saldoInicial + movimentos;
        } 
        // Se for conta de Resultado (Receita/Despesa), o saldo é apenas Movimentos
        else if (pc.is_conta_resultado) {
            saldo_final = movimentos;
        }
        // Se for Patrimônio Líquido (PL), o saldo é Inicial + Movimentos
        else if (getTipoPrincipal(pc.Conta) === 'Patrimonio Liquido') {
            saldo_final = saldoInicial + movimentos;
        }
        // Se for sintética pura, o saldo base é 0 (será consolidado depois)
        else {
            saldo_final = 0;
        }
        
        return {
          ...pc,
          saldo_final,
          tipo_principal: getTipoPrincipal(pc.Conta),
        };
      });
      
      // 6. Consolidar saldos das contas analíticas para as sintéticas
      contasCalculadas = consolidateBalances(contasCalculadas);
      
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
  
  // 7. Calcular totais
  const totalAtivo = contasBalanco
    .filter(c => c.tipo_principal === 'Ativo' && c.Analitica === 'Não' && c.Conta.split('.').length === 1) // Soma apenas o nível 1 do Ativo
    .reduce((sum, c) => sum + c.saldo_final, 0);
    
  const totalPassivo = contasBalanco
    .filter(c => c.tipo_principal === 'Passivo' && c.Analitica === 'Não' && c.Conta.split('.').length === 1) // Soma apenas o nível 1 do Passivo
    .reduce((sum, c) => sum + c.saldo_final, 0);
    
  const totalPatrimonioLiquido = contasBalanco
    .filter(c => c.tipo_principal === 'Patrimonio Liquido' && c.Analitica === 'Não' && c.Conta.split('.').length === 1) // Soma apenas o nível 1 do PL
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