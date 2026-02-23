import { supabase } from '@/integrations/supabase/client';
import { calcularSimilaridadeAvancada } from '@/utils/string-similarity';

export interface FiltrosBuscaParcelas {
  nomeBusca?: string;
  dataInicio?: string;
  dataFim?: string;
  valorMin?: number;
  valorMax?: number;
  status?: string;
}

export interface ParcelaResultado {
  id: string;
  numero_parcela: number;
  valor_parcela: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: string;
  descricao_conta: string;
  cliente_nome?: string;
  fornecedor?: string;
  conta_receber_id?: string;
  conta_pagar_id?: string;
  origem?: string;
  total_parcelas?: number;
  similaridade?: number;
}

export interface DetalhesContaCompleta {
  id: string;
  descricao: string;
  valor_total: number;
  data_emissao: string;
  cliente_nome?: string;
  fornecedor?: string;
  parcelas: {
    id: string;
    numero_parcela: number;
    valor_parcela: number;
    data_vencimento: string;
    status: string;
    valor_pago: number;
  }[];
}

export async function buscarParcelasPorFiltros(
  filtros: FiltrosBuscaParcelas,
  tipo: 'CR' | 'CP',
  isAdmin: boolean,
  ownerId: string,
  valorTransacao?: number
): Promise<ParcelaResultado[]> {
  const tabelaParcelas = isAdmin 
    ? (tipo === 'CR' ? 'admin_parcelas_receber' : 'admin_parcelas_pagar')
    : (tipo === 'CR' ? 'parcelas_contas_receber' : 'parcelas_contas_pagar');
  
  const tabelaContasSinteticas = isAdmin 
    ? (tipo === 'CR' ? 'admin_contas_receber' : 'admin_contas_pagar')
    : (tipo === 'CR' ? 'contas_receber' : 'contas_pagar');
  
  const ownerKey = isAdmin ? 'admin_id' : 'empresa_id';

  let query = supabase
    .from(tabelaParcelas)
    .select('*')
    .eq(ownerKey, ownerId);

  // Removido: .is('mapeado_extrato_id', null)
  // Motivo: Permitir seleção de parcelas já mapeadas para reconciliação

  if (filtros.status) {
    query = query.eq('status', filtros.status);
  } else {
    query = query.in('status', ['aberta', 'parcial', 'paga']);
  }

  if (filtros.dataInicio) {
    query = query.gte('data_vencimento', filtros.dataInicio);
  }

  if (filtros.dataFim) {
    query = query.lte('data_vencimento', filtros.dataFim);
  }

  if (filtros.valorMin) {
    query = query.gte('valor_parcela', filtros.valorMin);
  }

  if (filtros.valorMax) {
    query = query.lte('valor_parcela', filtros.valorMax);
  }

  const { data: parcelas, error } = await query.limit(100);

  if (error || !parcelas) {
    console.error('Erro ao buscar parcelas:', error);
    return [];
  }

  const contaIds = [...new Set(parcelas.map(p => tipo === 'CR' ? p.conta_receber_id : p.conta_pagar_id))];
  
  let contaDescMap: Record<string, { descricao: string; cliente_id: string | null; fornecedor: string | null }> = {};
  let clienteMap: Record<string, string> = {};
  let clienteNomeCompleto: Record<string, { nome: string; razao_social: string | null }> = {};

  if (tipo === 'CR') {
    const { data: contasSinteticas } = await supabase
      .from(tabelaContasSinteticas)
      .select('id, descricao, cliente_id')
      .in('id', contaIds);

    contaDescMap = (contasSinteticas || []).reduce((acc, c) => {
      acc[c.id] = { descricao: c.descricao, cliente_id: c.cliente_id, fornecedor: null };
      return acc;
    }, {} as Record<string, { descricao: string; cliente_id: string | null; fornecedor: string | null }>);

    const clienteIds = (contasSinteticas || [])
      .map(c => c.cliente_id)
      .filter(Boolean) as string[];
    
    const tabelaClientes = isAdmin ? 'tbl_clientes' : 'clientes';
    
    if (clienteIds.length > 0) {
      const { data: clientes } = await supabase
        .from(tabelaClientes)
        .select('id, nome, razao_social')
        .in('id', clienteIds);

      clienteMap = (clientes || []).reduce((acc, c) => {
        acc[c.id] = c.razao_social || c.nome;
        return acc;
      }, {} as Record<string, string>);
      
      clienteNomeCompleto = (clientes || []).reduce((acc, c) => {
        acc[c.id] = { nome: c.nome, razao_social: c.razao_social };
        return acc;
      }, {} as Record<string, { nome: string; razao_social: string | null }>);
    }
  } else {
    const { data: contasSinteticas } = await supabase
      .from(tabelaContasSinteticas)
      .select('id, descricao, fornecedor')
      .in('id', contaIds);

    contaDescMap = (contasSinteticas || []).reduce((acc, c: any) => {
      acc[c.id] = { 
        descricao: c.descricao || '', 
        cliente_id: null, 
        fornecedor: c.fornecedor 
      };
      return acc;
    }, {} as Record<string, { descricao: string; cliente_id: string | null; fornecedor: string | null }>);
  }

  let resultados = parcelas.map(p => {
    const contaId = tipo === 'CR' ? p.conta_receber_id : p.conta_pagar_id;
    const contaInfo = contaId ? contaDescMap[contaId] : null;
    const clienteNome = contaInfo?.cliente_id ? clienteMap[contaInfo.cliente_id] : null;
    const nomeParceiro = tipo === 'CR' ? clienteNome : contaInfo?.fornecedor;

    let similaridade = 0;
    if (filtros.nomeBusca && tipo === 'CR' && contaInfo?.cliente_id) {
      const infoCliente = clienteNomeCompleto[contaInfo.cliente_id];
      if (infoCliente) {
        const simNome = calcularSimilaridadeAvancada(filtros.nomeBusca, infoCliente.nome);
        const simRazao = infoCliente.razao_social 
          ? calcularSimilaridadeAvancada(filtros.nomeBusca, infoCliente.razao_social) 
          : 0;
        similaridade = Math.max(simNome, simRazao);
      }
    } else if (filtros.nomeBusca && nomeParceiro) {
      similaridade = calcularSimilaridadeAvancada(filtros.nomeBusca, nomeParceiro);
    }

    return {
      id: p.id,
      numero_parcela: p.numero_parcela,
      valor_parcela: p.valor_parcela,
      data_vencimento: p.data_vencimento,
      data_pagamento: p.data_pagamento,
      status: p.status,
      descricao_conta: contaInfo?.descricao || '',
      cliente_nome: clienteNome || undefined,
      fornecedor: contaInfo?.fornecedor || undefined,
      conta_receber_id: tipo === 'CR' ? p.conta_receber_id : undefined,
      conta_pagar_id: tipo === 'CP' ? p.conta_pagar_id : undefined,
      origem: p.origem,
      total_parcelas: 1,
      similaridade: similaridade > 0 ? similaridade : undefined,
    } as ParcelaResultado;
  });

  if (filtros.nomeBusca) {
    resultados = resultados.filter(r => {
      const nomeParceiro = tipo === 'CR' ? r.cliente_nome : r.fornecedor;
      if (!nomeParceiro) return false;
      return (r.similaridade || 0) >= 30;
    });
  }

  resultados.sort((a, b) => {
    if (valorTransacao) {
      const diffA = Math.abs(a.valor_parcela - valorTransacao);
      const diffB = Math.abs(b.valor_parcela - valorTransacao);
      if (diffA !== diffB) return diffA - diffB;
    }
    
    if (a.similaridade && b.similaridade) {
      return b.similaridade - a.similaridade;
    }
    
    return new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime();
  });

  return resultados;
}

export async function buscarDetalhesConta(
  contaId: string,
  tipo: 'CR' | 'CP',
  isAdmin: boolean
): Promise<DetalhesContaCompleta | null> {
  const tabelaContasSinteticas = isAdmin 
    ? (tipo === 'CR' ? 'admin_contas_receber' : 'admin_contas_pagar')
    : (tipo === 'CR' ? 'contas_receber' : 'contas_pagar');
  
  const tabelaParcelas = isAdmin 
    ? (tipo === 'CR' ? 'admin_parcelas_receber' : 'admin_parcelas_pagar')
    : (tipo === 'CR' ? 'parcelas_contas_receber' : 'parcelas_contas_pagar');

  const campoContaId = tipo === 'CR' ? 'conta_receber_id' : 'conta_pagar_id';

  const { data: conta, error: contaError } = await supabase
    .from(tabelaContasSinteticas)
    .select('*')
    .eq('id', contaId)
    .single();

  if (contaError || !conta) {
    console.error('Erro ao buscar conta:', contaError);
    return null;
  }

  const { data: parcelas } = await supabase
    .from(tabelaParcelas)
    .select('id, numero_parcela, valor_parcela, data_vencimento, status, valor_pago')
    .eq(campoContaId, contaId)
    .order('numero_parcela', { ascending: true });

  let clienteNome: string | undefined;
  if (tipo === 'CR' && conta.cliente_id) {
    const tabelaClientes = isAdmin ? 'tbl_clientes' : 'clientes';
    const { data: cliente } = await supabase
      .from(tabelaClientes)
      .select('nome')
      .eq('id', conta.cliente_id)
      .single();
    
    if (cliente) clienteNome = cliente.nome;
  }

  return {
    id: conta.id,
    descricao: conta.descricao,
    valor_total: conta.valor_total,
    data_emissao: conta.data_emissao,
    cliente_nome: clienteNome,
    fornecedor: conta.fornecedor,
    parcelas: parcelas || [],
  };
}
