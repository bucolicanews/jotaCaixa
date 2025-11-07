import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSessao } from '@/hooks/use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { getBadgeVariant } from '@/utils/badge-variants';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { ContaPagar, ContaPagarComProgresso, AdminParcelaPagar, ExtendedParcelaPagar } from '@/types/contas-pagar';
import FormContasPagarDialog from '@/components/FormContasPagarDialog';
import DetalhesParcelasCPDialog from '@/components/DetalhesParcelasCPDialog';
import RegistrarPagamentoCPDialog from '@/components/RegistrarPagamentoCPDialog';
import { formatCurrency, formatarData } from '@/utils/formatters';

// Componentes Modulares
import ContasPagarHeader from '@/components/contas-pagar/ContasPagarHeader';
import SinteticoTab from '@/components/contas-pagar/SinteticoTab';
import ParcelasTab from '@/components/contas-pagar/ParcelasTab';
import PagamentosTab from '@/components/contas-pagar/PagamentosTab';
import LayoutPrincipal from '@/components/LayoutPrincipal'; // Importando LayoutPrincipal
import { useDebounce } from '@/hooks/use-debounce'; // Importando useDebounce

// O tipo ContaStatus foi movido para utils/badge-variants.ts ou é inferido nos componentes filhos.

const ContasPagar: React.FC = () => {
  const { usuario, role } = useSessao();
  const isSupervisao = role === 'Admin';
  const proprietarioId = isSupervisao ? usuario?.id : (usuario as any)?.empresa_id;

  const [contasRaw, setContasRaw] = useState<(ContaPagar | ContaPagarComProgresso)[]>([]); // Armazena dados brutos
  const [parcelas, setParcelas] = useState<ExtendedParcelaPagar[]>([]);
  const [pagamentos, setPagamentos] = useState<any[]>([]); // TODO: Criar tipo AdminPagamento
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sintetico');
  
  // Filtros
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  });
  const [filtroOrigem, setFiltroOrigem] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('nao_quitado');
  const [filtroTexto, setFiltroTexto] = useState(''); // NOVO ESTADO
  const filtroTextoDebounced = useDebounce(filtroTexto, 500); // NOVO DEBOUNCE

  // Diálogos
  const [formDialog, setFormDialog] = useState<{ open: boolean, conta: ContaPagarComProgresso | null }>({ open: false, conta: null });
  const [detalhesDialog, setDetalhesDialog] = useState<{ open: boolean, conta: ContaPagarComProgresso | null }>({ open: false, conta: null });
  const [pagamentoDialog, setPagamentoDialog] = useState<{ open: boolean, parcela: (AdminParcelaPagar & { fornecedor: string }) | null }>({ open: false, parcela: null });

  const fetchContas = useCallback(async () => {
    if (!proprietarioId) return;
    setLoading(true);
    
    const tabela = isSupervisao ? 'admin_contas_pagar' : 'contas_pagar';
    let query = supabase.from(tabela).select('*');
    
    if (!isSupervisao) {
        query = query.eq('empresa_id', proprietarioId);
    } else {
        query = query.eq('admin_id', proprietarioId);
    }
    
    // Aplica filtros de período
    if (filtroPeriodo?.from) {
        query = query.gte('data_vencimento', format(filtroPeriodo.from, 'yyyy-MM-dd'));
    }
    if (filtroPeriodo?.to) {
        query = query.lte('data_vencimento', format(filtroPeriodo.to, 'yyyy-MM-dd'));
    }
    
    // Aplica filtros de origem (apenas para Admin)
    if (isSupervisao && filtroOrigem !== 'todos') {
        query = query.eq('origem', filtroOrigem);
    }
    
    // Aplica filtros de status (simplificado para o sintético)
    // NOTA: O filtro de status será aplicado no frontend para permitir a busca por texto
    // if (filtroStatus === 'quitado') {
    //     query = query.eq('status', 'pago');
    // } else if (filtroStatus === 'nao_quitado') {
    //     query = query.neq('status', 'pago');
    // }
    
    // REMOVIDO: Filtro de texto no backend para evitar erro de operador em UUID
    // if (filtroTextoDebounced) {
    //     const termo = `%${filtroTextoDebounced}%`;
    //     query = query.or(`descricao.ilike.${termo},fornecedor.ilike.${termo}`);
    // }

    const { data, error } = await query.order('data_vencimento', { ascending: true });

    if (error) {
      showError('Erro ao carregar contas a pagar: ' + error.message);
      setContasRaw([]);
    } else {
      // Se for supervisão, precisamos calcular o progresso de parcelas
      if (isSupervisao) {
        const contasComProgresso = await Promise.all((data as ContaPagarComProgresso[]).map(async (conta) => {
            const { count, error: countError } = await supabase
                .from('admin_parcelas_pagar')
                .select('*', { count: 'exact', head: true })
                .eq('conta_pagar_id', conta.id);
            
            const { count: pagasCount, error: pagasError } = await supabase
                .from('admin_parcelas_pagar')
                .select('*', { count: 'exact', head: true })
                .eq('conta_pagar_id', conta.id)
                .eq('status', 'paga');
                
            if (countError || pagasError) {
                console.error('Erro ao contar parcelas:', countError || pagasError);
                return { ...conta, parcelas_total: 0, parcelas_pagas: 0 };
            }
            
            return { ...conta, parcelas_total: count || 0, parcelas_pagas: pagasCount || 0 };
        }));
        setContasRaw(contasComProgresso);
      } else {
        setContasRaw(data as ContaPagar[]);
      }
    }
    setLoading(false);
  }, [proprietarioId, isSupervisao, filtroPeriodo, filtroOrigem]); // Removido filtroTextoDebounced
  
  const fetchParcelas = useCallback(async () => {
    if (!proprietarioId || !isSupervisao) return;
    setLoading(true);
    
    let query = supabase.from('admin_parcelas_pagar').select(`
        *,
        admin_contas_pagar ( id, fornecedor, origem, descricao )
    `).eq('admin_id', proprietarioId);
    
    // Aplica filtros de período
    if (filtroPeriodo?.from) {
        query = query.gte('data_vencimento', format(filtroPeriodo.from, 'yyyy-MM-dd'));
    }
    if (filtroPeriodo?.to) {
        query = query.lte('data_vencimento', format(filtroPeriodo.to, 'yyyy-MM-dd'));
    }
    
    // Aplica filtros de status
    if (filtroStatus === 'quitado') {
        query = query.eq('status', 'paga');
    } else if (filtroStatus === 'nao_quitado') {
        query = query.neq('status', 'paga');
    }
    
    const { data, error } = await query.order('data_vencimento', { ascending: true });

    if (error) {
      showError('Erro ao carregar parcelas: ' + error.message);
      setParcelas([]);
    } else {
      let fetchedParcelas = data as ExtendedParcelaPagar[];
      
      // Filtragem de origem e texto no frontend
      fetchedParcelas = fetchedParcelas.filter(p => {
          const origemMatch = filtroOrigem === 'todos' || p.admin_contas_pagar?.origem === filtroOrigem;
          
          const termo = filtroTextoDebounced.toLowerCase();
          const contaPagarId = p.admin_contas_pagar?.id || '';
          const textMatch = !termo || 
                            p.id.toLowerCase().includes(termo) ||
                            contaPagarId.toLowerCase().includes(termo) ||
                            p.admin_contas_pagar?.descricao.toLowerCase().includes(termo) ||
                            p.admin_contas_pagar?.fornecedor.toLowerCase().includes(termo);
                            
          return origemMatch && textMatch;
      });
      
      setParcelas(fetchedParcelas);
    }
    setLoading(false);
  }, [proprietarioId, isSupervisao, filtroPeriodo, filtroStatus, filtroOrigem, filtroTextoDebounced]);
  
  const fetchPagamentos = useCallback(async () => {
    if (!proprietarioId || !isSupervisao) return;
    setLoading(true);
    
    let query = supabase.from('admin_pagamentos').select(`
        *,
        saldo_contas ( nome ),
        admin_parcelas_pagar (
            numero_parcela,
            admin_contas_pagar ( id, descricao, origem, fornecedor )
        )
    `).eq('admin_id', proprietarioId);
    
    // Aplica filtros de período
    if (filtroPeriodo?.from) {
        query = query.gte('data_pagamento', format(filtroPeriodo.from, 'yyyy-MM-dd'));
    }
    if (filtroPeriodo?.to) {
        query = query.lte('data_pagamento', format(filtroPeriodo.to, 'yyyy-MM-dd'));
    }

    const { data, error } = await query.order('data_pagamento', { ascending: false });

    if (error) {
      showError('Erro ao carregar pagamentos: ' + error.message);
      setPagamentos([]);
    } else {
      let fetchedPagamentos = data as any[];
      
      // Filtragem de origem e texto no frontend
      fetchedPagamentos = fetchedPagamentos.filter(p => {
          const origemMatch = filtroOrigem === 'todos' || p.admin_parcelas_pagar?.admin_contas_pagar?.origem === filtroOrigem;
          
          const termo = filtroTextoDebounced.toLowerCase();
          const contaPagarId = p.admin_parcelas_pagar?.admin_contas_pagar?.id || '';
          const textMatch = !termo || 
                            p.id.toLowerCase().includes(termo) ||
                            contaPagarId.toLowerCase().includes(termo) ||
                            p.admin_parcelas_pagar?.admin_contas_pagar?.descricao.toLowerCase().includes(termo) ||
                            p.admin_parcelas_pagar?.admin_contas_pagar?.fornecedor.toLowerCase().includes(termo);
                            
          return origemMatch && textMatch;
      });
      
      setPagamentos(fetchedPagamentos);
    }
    setLoading(false);
  }, [proprietarioId, isSupervisao, filtroPeriodo, filtroOrigem, filtroTextoDebounced]);

  useEffect(() => {
    if (activeTab === 'sintetico') {
      fetchContas();
    } else if (activeTab === 'parcelas') {
      fetchParcelas();
    } else if (activeTab === 'pagamentos') {
      fetchPagamentos();
    }
  }, [activeTab, fetchContas, fetchParcelas, fetchPagamentos]);

  // --- Filtro de Frontend para a aba Sintético ---
  const contas = useMemo(() => {
      let filtered = contasRaw;
      const termo = filtroTextoDebounced.toLowerCase();
      
      // 1. Filtro de Status
      filtered = filtered.filter(conta => {
          const total = ((conta as ContaPagarComProgresso).parcelas_total ?? 0);
          const pagas = ((conta as ContaPagarComProgresso).parcelas_pagas ?? 0);

          const isPago = isSupervisao 
              ? pagas === total && total > 0
              : conta.status === 'pago';
              
          if (filtroStatus === 'quitado') return isPago;
          if (filtroStatus === 'nao_quitado') return !isPago;
          return true;
      });
      
      // 2. Filtro de Texto (ID, Fornecedor, Descrição)
      if (termo) {
          filtered = filtered.filter(conta => {
              const idMatch = conta.id.toLowerCase().includes(termo);
              const fornecedorMatch = conta.fornecedor?.toLowerCase().includes(termo);
              const descricaoMatch = (conta as ContaPagarComProgresso).descricao?.toLowerCase().includes(termo);
              
              return idMatch || fornecedorMatch || descricaoMatch;
          });
      }
      
      return filtered;
  }, [contasRaw, filtroStatus, filtroTextoDebounced, isSupervisao]);
  // -----------------------------------------------


  const handleOpenForm = (conta: ContaPagarComProgresso | null = null) => {
    setFormDialog({ open: true, conta });
  };
  
  const handleOpenDetalhes = (conta: ContaPagarComProgresso) => {
    setDetalhesDialog({ open: true, conta });
  };
  
  const handleOpenPagamento = (parcela: AdminParcelaPagar, fornecedor: string) => {
    const mappedParcela = {
        ...parcela,
        fornecedor: fornecedor,
    };
    setPagamentoDialog({ open: true, parcela: mappedParcela });
  };

  const handleDelete = async (id: string) => {
    if (!proprietarioId) return;
    
    const tabela = isSupervisao ? 'admin_contas_pagar' : 'contas_pagar';
    
    try {
      const { error } = await supabase.from(tabela).delete().eq('id', id);
      
      if (error) throw error;
      
      showSuccess('Conta a pagar excluída com sucesso.');
      fetchContas();
    } catch (error: any) {
      showError('Falha ao excluir conta: ' + error.message);
    }
  };
  
  const totalSintetico = useMemo(() => {
    return contas.reduce((sum, conta) => sum + (isSupervisao ? (conta as ContaPagarComProgresso).valor_total : (conta as ContaPagar).valor), 0);
  }, [contas, isSupervisao]);
  
  const totalParcelas = useMemo(() => {
    return parcelas.reduce((sum, parcela) => sum + parcela.valor_parcela, 0);
  }, [parcelas]);
  
  const totalPagamentos = useMemo(() => {
    return pagamentos.reduce((sum, pagamento) => sum + pagamento.valor_pago, 0);
  }, [pagamentos]);

  const formatarOrigem = (origem: string) => {
    switch (origem) {
        case 'contrato': return 'Contrato';
        case 'assinatura_recorrente': return 'Assinatura';
        case 'manual': return 'Manual';
        default: return origem;
    }
  };

  return (
    <LayoutPrincipal>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Contas a Pagar {isSupervisao && '(Admin)'}</h1>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="sintetico">Sintético</TabsTrigger>
            {isSupervisao && <TabsTrigger value="parcelas">Parcelas</TabsTrigger>}
            {isSupervisao && <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>}
          </TabsList>

          <ContasPagarHeader
              isSupervisao={isSupervisao}
              filtroOrigem={filtroOrigem}
              setFiltroOrigem={setFiltroOrigem}
              filtroStatus={filtroStatus}
              setFiltroStatus={setFiltroStatus}
              filtroPeriodo={filtroPeriodo}
              setFiltroPeriodo={setFiltroPeriodo}
              handleOpenForm={handleOpenForm}
              totalSintetico={totalSintetico}
              contas={contas}
              parcelas={parcelas}
              pagamentos={pagamentos}
              activeTab={activeTab}
              filtroTexto={filtroTexto}
              setFiltroTexto={setFiltroTexto}
          />

          <TabsContent value="sintetico" className="space-y-4">
              <SinteticoTab
                  loading={loading}
                  contas={contas}
                  isSupervisao={isSupervisao}
                  handleOpenDetalhes={handleOpenDetalhes}
                  handleOpenForm={handleOpenForm}
                  handleDelete={handleDelete}
                  formatarData={formatarData}
                  formatCurrency={formatCurrency}
                  getBadgeVariant={getBadgeVariant as any} // Cast necessário devido à tipagem expandida localmente
              />
          </TabsContent>

          {isSupervisao && (
              <TabsContent value="parcelas" className="space-y-4">
                  <ParcelasTab
                      loading={loading}
                      parcelas={parcelas}
                      totalParcelas={totalParcelas}
                      handleOpenPagamento={handleOpenPagamento}
                      formatarData={formatarData}
                      formatCurrency={formatCurrency}
                      formatarOrigem={formatarOrigem}
                      getBadgeVariant={getBadgeVariant as any} // Cast necessário
                  />
              </TabsContent>
          )}
          
          {isSupervisao && (
              <TabsContent value="pagamentos" className="space-y-4">
                  <PagamentosTab
                      loading={loading}
                      pagamentos={pagamentos}
                      totalPagamentos={totalPagamentos}
                      formatarData={formatarData}
                      formatCurrency={formatCurrency}
                  />
              </TabsContent>
          )}
        </Tabs>

        <FormContasPagarDialog 
          open={formDialog.open} 
          onOpenChange={(open: boolean) => setFormDialog({ open, conta: null })}
          contaInicial={formDialog.conta}
          onSaveComplete={() => { setFormDialog({ open: false, conta: null }); fetchContas(); }}
        />
        
        {detalhesDialog.conta && (
          <DetalhesParcelasCPDialog
              open={detalhesDialog.open}
              onOpenChange={(open: boolean) => setDetalhesDialog({ open, conta: null })}
              conta={detalhesDialog.conta}
              onDataChange={() => { fetchContas(); fetchParcelas(); }}
          />
        )}
        
        {pagamentoDialog.parcela && (
          <RegistrarPagamentoCPDialog
              open={pagamentoDialog.open}
              onOpenChange={(open: boolean) => setPagamentoDialog({ open, parcela: null })}
              parcela={pagamentoDialog.parcela}
              onSaveComplete={() => { 
                setPagamentoDialog({ open: false, parcela: null });
                fetchParcelas(); 
                fetchPagamentos(); 
              }}
          />
        )}
      </div>
    </LayoutPrincipal>
  );
};

export default ContasPagar;