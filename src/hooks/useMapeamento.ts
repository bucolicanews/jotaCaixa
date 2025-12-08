import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { ExtratoMapeado, ExtratoNaoMapeado, ParcelaSugestao } from '@/types/extrato';

export interface ParcelaNaoMapeada {
  id: string;
  numero_parcela: number;
  valor_parcela: number;
  data_vencimento: string;
  fornecedor_cliente: string;
  descricao: string;
  tipo: 'CP' | 'CR';
  total_parcelas: number;
}

export function useMapeamento() {
  const { usuario, role, perfil } = useSessao();
  const [extratosMapeados, setExtratosMapeados] = useState<ExtratoMapeado[]>([]);
  const [extratosNaoMapeados, setExtratosNaoMapeados] = useState<ExtratoNaoMapeado[]>([]);
  const [parcelasCPNaoMapeadas, setParcelasCPNaoMapeadas] = useState<ParcelaNaoMapeada[]>([]);
  const [parcelasCRNaoMapeadas, setParcelasCRNaoMapeadas] = useState<ParcelaNaoMapeada[]>([]);
  const [carregando, setCarregando] = useState(false);

  const isAdmin = role === 'Admin';
  const ownerId = usuario?.id;

  const fetchExtratosMapeados = useCallback(async () => {
    if (!ownerId) return;
    setCarregando(true);

    const { data, error } = await supabase
      .from('extratos')
      .select(`
        *,
        saldo_contas:id_saldo_contas ( nome ),
        plano_contas:conta_contabil_id ( Conta, Descricao )
      `)
      .eq('empresa_id', ownerId)
      .not('mapeado_parcela_id', 'is', null)
      .order('data', { ascending: false });

    if (error) {
      showError('Erro ao carregar extratos mapeados: ' + error.message);
      setExtratosMapeados([]);
    } else {
      const mapped = await Promise.all((data || []).map(async (extrato) => {
        let parcelaInfo = null;
        
        if (extrato.mapeado_parcela_id && extrato.mapeado_tipo) {
          if (extrato.mapeado_tipo === 'CP') {
            const tabelaParcela = isAdmin ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar';
            const tabelaCP = isAdmin ? 'admin_contas_pagar' : 'contas_pagar';
            
            const { data: parcelaData } = await supabase
              .from(tabelaParcela)
              .select(`numero_parcela, valor_parcela, ${tabelaCP} ( fornecedor, descricao )`)
              .eq('id', extrato.mapeado_parcela_id)
              .single();
            
            if (parcelaData) {
              const cp = (parcelaData as any)[tabelaCP];
              parcelaInfo = {
                numero_parcela: parcelaData.numero_parcela,
                valor_parcela: parcelaData.valor_parcela,
                fornecedor_cliente: cp?.fornecedor || 'N/A',
                descricao: cp?.descricao || 'N/A',
              };
            }
          } else if (extrato.mapeado_tipo === 'CR') {
            const tabelaParcela = isAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
            const tabelaCR = isAdmin ? 'admin_contas_receber' : 'contas_receber';
            
            const { data: parcelaData } = await supabase
              .from(tabelaParcela)
              .select(`numero_parcela, valor_parcela, ${tabelaCR} ( descricao, clientes ( nome ) )`)
              .eq('id', extrato.mapeado_parcela_id)
              .single();
            
            if (parcelaData) {
              const cr = (parcelaData as any)[tabelaCR];
              parcelaInfo = {
                numero_parcela: parcelaData.numero_parcela,
                valor_parcela: parcelaData.valor_parcela,
                fornecedor_cliente: cr?.clientes?.nome || 'N/A',
                descricao: cr?.descricao || 'N/A',
              };
            }
          }
        }
        
        return { ...extrato, parcela_info: parcelaInfo } as ExtratoMapeado;
      }));
      
      setExtratosMapeados(mapped);
    }
    setCarregando(false);
  }, [ownerId, isAdmin]);

  const fetchExtratosNaoMapeados = useCallback(async () => {
    if (!ownerId) return;
    setCarregando(true);

    const { data, error } = await supabase
      .from('extratos')
      .select(`
        *,
        saldo_contas:id_saldo_contas ( nome )
      `)
      .eq('empresa_id', ownerId)
      .is('mapeado_parcela_id', null)
      .order('data', { ascending: false });

    if (error) {
      showError('Erro ao carregar extratos não mapeados: ' + error.message);
      setExtratosNaoMapeados([]);
    } else {
      setExtratosNaoMapeados(data as ExtratoNaoMapeado[]);
    }
    setCarregando(false);
  }, [ownerId]);

  const buscarParcelasSugestao = useCallback(async (extrato: ExtratoNaoMapeado): Promise<ParcelaSugestao[]> => {
    if (!ownerId) return [];
    
    const valorExtrato = Math.abs(extrato.valor);
    const margemValor = valorExtrato * 0.5;
    const valorMin = valorExtrato - margemValor;
    const valorMax = valorExtrato + margemValor;
    
    const sugestoes: ParcelaSugestao[] = [];
    
    if (extrato.tipo === 'Saida') {
      const tabelaParcela = isAdmin ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar';
      const tabelaCP = isAdmin ? 'admin_contas_pagar' : 'contas_pagar';
      const ownerFieldParcela = isAdmin ? 'admin_id' : 'empresa_id';
      
      const { data: parcelasCP, error } = await supabase
        .from(tabelaParcela)
        .select(`id, numero_parcela, valor_parcela, data_vencimento, ${tabelaCP} ( id, fornecedor, descricao )`)
        .eq(ownerFieldParcela, ownerId)
        .gte('valor_parcela', valorMin)
        .lte('valor_parcela', valorMax)
        .is('data_pagamento', null);
      
      if (error) {
        console.error('Erro ao buscar parcelas CP:', error);
      }
      
      for (const p of (parcelasCP || [])) {
        const cpData = (p as any)[tabelaCP];
        if (!cpData) continue;
        
        const diffValor = Math.abs(p.valor_parcela - valorExtrato) / valorExtrato;
        const score = Math.max(0, 100 - (diffValor * 100));
        
        sugestoes.push({
          id: p.id,
          numero_parcela: p.numero_parcela,
          valor_parcela: p.valor_parcela,
          data_vencimento: p.data_vencimento,
          fornecedor_cliente: cpData.fornecedor || 'N/A',
          descricao: cpData.descricao || 'N/A',
          tipo: 'CP',
          score: Math.round(score),
        });
      }
    }
    
    if (extrato.tipo === 'Entrada') {
      const tabelaParcela = isAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
      const tabelaCR = isAdmin ? 'admin_contas_receber' : 'contas_receber';
      const ownerFieldParcela = isAdmin ? 'admin_id' : 'empresa_id';
      
      const { data: parcelasCR, error } = await supabase
        .from(tabelaParcela)
        .select(`id, numero_parcela, valor_parcela, data_vencimento, ${tabelaCR} ( id, descricao, cliente_id )`)
        .eq(ownerFieldParcela, ownerId)
        .gte('valor_parcela', valorMin)
        .lte('valor_parcela', valorMax)
        .is('data_pagamento', null);
      
      if (error) {
        console.error('Erro ao buscar parcelas CR:', error);
      }
      
      for (const p of (parcelasCR || [])) {
        const crData = (p as any)[tabelaCR];
        if (!crData) continue;
        
        let clienteNome = 'N/A';
        if (crData.cliente_id) {
          const { data: clienteData } = await supabase
            .from('clientes')
            .select('nome')
            .eq('id', crData.cliente_id)
            .single();
          clienteNome = clienteData?.nome || 'N/A';
        }
        
        const diffValor = Math.abs(p.valor_parcela - valorExtrato) / valorExtrato;
        const score = Math.max(0, 100 - (diffValor * 100));
        
        sugestoes.push({
          id: p.id,
          numero_parcela: p.numero_parcela,
          valor_parcela: p.valor_parcela,
          data_vencimento: p.data_vencimento,
          fornecedor_cliente: clienteNome,
          descricao: crData.descricao || 'N/A',
          tipo: 'CR',
          score: Math.round(score),
        });
      }
    }
    
    return sugestoes.sort((a, b) => b.score - a.score);
  }, [ownerId, isAdmin]);

  const mapearExtrato = useCallback(async (
    extratoId: string,
    parcelaId: string | null,
    tipo: 'CP' | 'CR' | null,
    contaContabilId?: string
  ) => {
    const { error } = await supabase
      .from('extratos')
      .update({
        mapeado_parcela_id: parcelaId,
        mapeado_tipo: tipo,
        conta_contabil_id: contaContabilId || null,
        conciliado: true,
      })
      .eq('id', extratoId);

    if (error) {
      showError('Erro ao mapear extrato: ' + error.message);
      return false;
    }
    
    showSuccess(parcelaId ? 'Extrato mapeado com sucesso!' : 'Extrato marcado como conciliado!');
    return true;
  }, []);

  const desmapearExtrato = useCallback(async (extratoId: string) => {
    const { error } = await supabase
      .from('extratos')
      .update({
        mapeado_parcela_id: null,
        mapeado_tipo: null,
        conciliado: false,
      })
      .eq('id', extratoId);

    if (error) {
      showError('Erro ao desmapear extrato: ' + error.message);
      return false;
    }
    
    showSuccess('Extrato desmapeado.');
    return true;
  }, []);

  const editarMapeamento = useCallback(async (extratoId: string, contaContabilId: string) => {
    const { error } = await supabase
      .from('extratos')
      .update({ conta_contabil_id: contaContabilId })
      .eq('id', extratoId);

    if (error) {
      showError('Erro ao editar mapeamento: ' + error.message);
      return false;
    }
    
    showSuccess('Conta contábil atualizada!');
    return true;
  }, []);

  const deletarExtrato = useCallback(async (extratoId: string) => {
    const { error } = await supabase
      .from('extratos')
      .delete()
      .eq('id', extratoId);

    if (error) {
      showError('Erro ao deletar extrato: ' + error.message);
      return false;
    }
    
    showSuccess('Extrato excluído.');
    return true;
  }, []);

  const fetchParcelasCPNaoMapeadas = useCallback(async () => {
    if (!ownerId) return;
    
    const tabelaParcela = isAdmin ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar';
    const tabelaCP = isAdmin ? 'admin_contas_pagar' : 'contas_pagar';
    const ownerFieldParcela = isAdmin ? 'admin_id' : 'empresa_id';
    
    const { data: extratosMapeadosIds } = await supabase
      .from('extratos')
      .select('mapeado_parcela_id')
      .eq('empresa_id', ownerId)
      .not('mapeado_parcela_id', 'is', null)
      .eq('mapeado_tipo', 'CP');
    
    const idsJaMapeados = (extratosMapeadosIds || []).map(e => e.mapeado_parcela_id).filter(Boolean);
    
    const { data: parcelas, error } = await supabase
      .from(tabelaParcela)
      .select(`id, numero_parcela, valor_parcela, data_vencimento, conta_pagar_id, ${tabelaCP} ( id, fornecedor, descricao )`)
      .eq(ownerFieldParcela, ownerId)
      .is('data_pagamento', null);
    
    if (error) {
      console.error('Erro ao buscar parcelas CP:', error);
      setParcelasCPNaoMapeadas([]);
      return;
    }
    
    const resultado: ParcelaNaoMapeada[] = [];
    
    for (const p of (parcelas || [])) {
      if (idsJaMapeados.includes(p.id)) continue;
      
      const cpData = (p as any)[tabelaCP];
      if (!cpData) continue;
      
      const { count } = await supabase
        .from(tabelaParcela)
        .select('id', { count: 'exact', head: true })
        .eq('conta_pagar_id', p.conta_pagar_id);
      
      resultado.push({
        id: p.id,
        numero_parcela: p.numero_parcela,
        valor_parcela: p.valor_parcela,
        data_vencimento: p.data_vencimento,
        fornecedor_cliente: cpData.fornecedor || 'N/A',
        descricao: cpData.descricao || 'N/A',
        tipo: 'CP',
        total_parcelas: count || 1,
      });
    }
    
    setParcelasCPNaoMapeadas(resultado);
  }, [ownerId, isAdmin]);

  const fetchParcelasCRNaoMapeadas = useCallback(async () => {
    if (!ownerId) return;
    
    const tabelaParcela = isAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
    const tabelaCR = isAdmin ? 'admin_contas_receber' : 'contas_receber';
    const ownerFieldParcela = isAdmin ? 'admin_id' : 'empresa_id';
    
    const { data: extratosMapeadosIds } = await supabase
      .from('extratos')
      .select('mapeado_parcela_id')
      .eq('empresa_id', ownerId)
      .not('mapeado_parcela_id', 'is', null)
      .eq('mapeado_tipo', 'CR');
    
    const idsJaMapeados = (extratosMapeadosIds || []).map(e => e.mapeado_parcela_id).filter(Boolean);
    
    const { data: parcelas, error } = await supabase
      .from(tabelaParcela)
      .select(`id, numero_parcela, valor_parcela, data_vencimento, conta_receber_id, ${tabelaCR} ( id, descricao, cliente_id )`)
      .eq(ownerFieldParcela, ownerId)
      .is('data_pagamento', null);
    
    if (error) {
      console.error('Erro ao buscar parcelas CR:', error);
      setParcelasCRNaoMapeadas([]);
      return;
    }
    
    const resultado: ParcelaNaoMapeada[] = [];
    
    for (const p of (parcelas || [])) {
      if (idsJaMapeados.includes(p.id)) continue;
      
      const crData = (p as any)[tabelaCR];
      if (!crData) continue;
      
      let clienteNome = 'N/A';
      if (crData.cliente_id) {
        const { data: clienteData } = await supabase
          .from('clientes')
          .select('nome')
          .eq('id', crData.cliente_id)
          .single();
        clienteNome = clienteData?.nome || 'N/A';
      }
      
      const { count } = await supabase
        .from(tabelaParcela)
        .select('id', { count: 'exact', head: true })
        .eq('conta_receber_id', p.conta_receber_id);
      
      resultado.push({
        id: p.id,
        numero_parcela: p.numero_parcela,
        valor_parcela: p.valor_parcela,
        data_vencimento: p.data_vencimento,
        fornecedor_cliente: clienteNome,
        descricao: crData.descricao || 'N/A',
        tipo: 'CR',
        total_parcelas: count || 1,
      });
    }
    
    setParcelasCRNaoMapeadas(resultado);
  }, [ownerId, isAdmin]);

  return {
    extratosMapeados,
    extratosNaoMapeados,
    parcelasCPNaoMapeadas,
    parcelasCRNaoMapeadas,
    carregando,
    fetchExtratosMapeados,
    fetchExtratosNaoMapeados,
    fetchParcelasCPNaoMapeadas,
    fetchParcelasCRNaoMapeadas,
    buscarParcelasSugestao,
    mapearExtrato,
    desmapearExtrato,
    editarMapeamento,
    deletarExtrato,
  };
}
