import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSessao } from '@/hooks/use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { getBadgeVariant } from '@/utils/badge-variants';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { ContaPagar, ContaPagarComProgresso, AdminParcelaPagar, ExtendedParcelaPagar } from '@/types/contas-pagar';
import FormContasPagarDialog from '@/components/formularios/FormContasPagarDialog';
import DetalhesParcelasCPDialog from '@/components/DetalhesParcelasCPDialog';
import RegistrarPagamentoCPDialog from '@/components/contas-pagar/RegistrarPagamentoCPDialog';
import { formatCurrency, formatarData } from '@/utils/formatters';
import ContasFuturasDialog from '@/components/ContasFuturasDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Componentes Modulares
import ContasPagarHeader from '@/components/contas-pagar/ContasPagarHeader';
import SinteticoTab from '@/components/contas-pagar/SinteticoTab';
import ParcelasTab from '@/components/contas-pagar/ParcelasTab';
import PagamentosTab from '@/components/contas-pagar/PagamentosTab';
import LayoutPrincipal from '@/components/LayoutPrincipal'; // Importando LayoutPrincipal
import { useDebounce } from '@/hooks/use-debounce'; // Importando useDebounce

// O tipo ContaStatus foi movido para utils/badge-variants.ts ou é inferido nos componentes filhos.

const ContasPagar: React.FC = () => {
  const { usuario, role, perfil } = useSessao();
  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  const proprietarioId = usuario?.id;

  const [contasRaw, setContasRaw] = useState<(ContaPagar | ContaPagarComProgresso)[]>([]); // Armazena dados brutos
  const [parcelas, setParcelas] = useState<ExtendedParcelaPagar[]>([]);
  const [pagamentos, setPagamentos] = useState<any[]>([]); // TODO: Criar tipo AdminPagamento
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sintetico');
  
  // Filtros
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>(undefined); // ALTERADO: Removido o período inicial
  const [filtroOrigem, setFiltroOrigem] = useState('todos'); // ALTERADO: Padrão 'todos'
  const [filtroStatus, setFiltroStatus] = useState('todos'); // ALTERADO: Padrão 'todos'
  const [filtroTexto, setFiltroTexto] = useState(''); // NOVO ESTADO
  const filtroTextoDebounced = useDebounce(filtroTexto, 500); // NOVO DEBOUNCE

  // Diálogos
  const [formDialog, setFormDialog] = useState<{ open: boolean, conta: ContaPagarComProgresso | null }>({ open: false, conta: null });
  const [detalhesDialog, setDetalhesDialog] = useState<{ open: boolean, conta: ContaPagarComProgresso | null }>({ open: false, conta: null });
  const [pagamentoDialog, setPagamentoDialog] = useState<{ open: boolean, parcela: (AdminParcelaPagar & { fornecedor: string }) | null }>({ open: false, parcela: null });
  const [contasFuturasOpen, setContasFuturasOpen] = useState(false);
  const [temContasFuturas, setTemContasFuturas] = useState(false);

  const fetchContas = useCallback(async () => {
    if (!proprietarioId) return;
    setLoading(true);
    
    const tabela = isAdmin ? 'admin_contas_pagar' : 'contas_pagar';
    let query = supabase.from(tabela).select('*');
    
    if (!isAdmin) {
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
    if (isAdmin && filtroOrigem !== 'todos') {
        query = query.eq('origem', filtroOrigem);
    }
    
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
      const tabelaParcelasCP = isAdmin ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar';
      
      const contasComProgresso = await Promise.all((data as ContaPagarComProgresso[]).map(async (conta) => {
          const { count, error: countError } = await supabase
              .from(tabelaParcelasCP)
              .select('*', { count: 'exact', head: true })
              .eq('conta_pagar_id', conta.id);
          
          const { count: pagasCount, error: pagasError } = await supabase
              .from(tabelaParcelasCP)
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
    }
    setLoading(false);
  }, [proprietarioId, isAdmin, filtroPeriodo, filtroOrigem]);
  
  const fetchParcelas = useCallback(async () => {
    if (!proprietarioId) return;
    setLoading(true);
    
    const tabelaParcelasCP = isAdmin ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar';
    const tabelaContasCP = isAdmin ? 'admin_contas_pagar' : 'contas_pagar';
    const ownerKey = isAdmin ? 'admin_id' : 'empresa_id';
    
    let query = supabase.from(tabelaParcelasCP).select(`
        *,
        ${tabelaContasCP} ( id, fornecedor, origem, ${isAdmin ? 'descricao' : 'Descricao'} )
    `).eq(ownerKey, proprietarioId);
    
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
      let fetchedParcelas = (data || []).map((p: any) => ({
          ...p,
          admin_contas_pagar: p[tabelaContasCP] || p.admin_contas_pagar,
      })) as ExtendedParcelaPagar[];
      
      // Filtragem de origem e texto no frontend
      fetchedParcelas = fetchedParcelas.filter(p => {
          const contaCP = p.admin_contas_pagar || (p as any).contas_pagar;
          const origemMatch = filtroOrigem === 'todos' || contaCP?.origem === filtroOrigem;
          
          const termo = filtroTextoDebounced.toLowerCase();
          const contaPagarId = contaCP?.id || '';
          const descricao = contaCP?.descricao || contaCP?.Descricao || '';
          const textMatch = !termo || 
                            p.id.toLowerCase().includes(termo) ||
                            contaPagarId.toLowerCase().includes(termo) ||
                            descricao.toLowerCase().includes(termo) ||
                            contaCP?.fornecedor?.toLowerCase().includes(termo);
                            
          return origemMatch && textMatch;
      });
      
      setParcelas(fetchedParcelas);
    }
    setLoading(false);
  }, [proprietarioId, isAdmin, filtroPeriodo, filtroStatus, filtroOrigem, filtroTextoDebounced]);
  
  const fetchPagamentos = useCallback(async () => {
    if (!proprietarioId) return;
    setLoading(true);
    
    const tabelaPagamentosCP = isAdmin ? 'admin_pagamentos' : 'pagamentos';
    const tabelaParcelasCP = isAdmin ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar';
    const tabelaContasCP = isAdmin ? 'admin_contas_pagar' : 'contas_pagar';
    const ownerKey = isAdmin ? 'admin_id' : 'empresa_id';
    const fkParcela = isAdmin ? 'parcela_pagar_id' : 'parcela_id';
    const fkSaldoConta = isAdmin ? 'saldo_conta_id' : 'conta_id';
    
    let query = supabase.from(tabelaPagamentosCP).select(`
        *,
        saldo_contas!${fkSaldoConta} ( nome ),
        ${tabelaParcelasCP}!${fkParcela} (
            numero_parcela,
            ${tabelaContasCP} ( id, ${isAdmin ? 'descricao' : 'Descricao'}, origem, fornecedor )
        )
    `).eq(ownerKey, proprietarioId);
    
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
      let fetchedPagamentos = (data || []).map((p: any) => ({
          ...p,
          admin_parcelas_pagar: p[tabelaParcelasCP] || p.admin_parcelas_pagar,
      })) as any[];
      
      // Filtragem de origem e texto no frontend
      fetchedPagamentos = fetchedPagamentos.filter(p => {
          const parcelaCP = p.admin_parcelas_pagar || p.parcelas_contas_pagar;
          const contaCP = parcelaCP?.[tabelaContasCP] || parcelaCP?.admin_contas_pagar || parcelaCP?.contas_pagar;
          const origemMatch = filtroOrigem === 'todos' || contaCP?.origem === filtroOrigem;
          
          const termo = filtroTextoDebounced.toLowerCase();
          const contaPagarId = contaCP?.id || '';
          const descricao = contaCP?.descricao || contaCP?.Descricao || '';
          const textMatch = !termo || 
                            p.id.toLowerCase().includes(termo) ||
                            contaPagarId.toLowerCase().includes(termo) ||
                            descricao.toLowerCase().includes(termo) ||
                            contaCP?.fornecedor?.toLowerCase().includes(termo);
                            
          return origemMatch && textMatch;
      });
      
      setPagamentos(fetchedPagamentos);
    }
    setLoading(false);
  }, [proprietarioId, isAdmin, filtroPeriodo, filtroOrigem, filtroTextoDebounced]);

  useEffect(() => {
    if (activeTab === 'sintetico') {
      fetchContas();
    } else if (activeTab === 'parcelas') {
      fetchParcelas();
    } else if (activeTab === 'pagamentos') {
      fetchPagamentos();
    }
  }, [activeTab, fetchContas, fetchParcelas, fetchPagamentos]);

  // Verificar contas futuras ao carregar (apenas para Cliente)
  const verificarContasFuturas = useCallback(async (abrirModalSeHouver: boolean = true) => {
    if (!proprietarioId || isAdmin) {
      setTemContasFuturas(false);
      return;
    }

    try {
      const { data: contas, error: contasError } = await supabase
        .from('admin_contas_receber')
        .select('id')
        .eq('cliente_id', proprietarioId);

      if (contasError || !contas || contas.length === 0) {
        setTemContasFuturas(false);
        return;
      }

      for (const conta of contas) {
        const { count, error: parcelasError } = await supabase
          .from('admin_parcelas_receber')
          .select('id', { count: 'exact', head: true })
          .eq('conta_receber_id', conta.id)
          .in('status', ['aberta', 'parcial', 'reprogramada'])
          .or('ciente_cliente.is.null,ciente_cliente.eq.false');

        if (!parcelasError && count && count > 0) {
          setTemContasFuturas(true);
          if (abrirModalSeHouver) {
            setContasFuturasOpen(true);
          }
          return;
        }
      }
      setTemContasFuturas(false);
    } catch (error) {
      console.error('Erro ao verificar contas futuras:', error);
      setTemContasFuturas(false);
    }
  }, [proprietarioId, isAdmin]);

  useEffect(() => {
    if (proprietarioId && !isAdmin) {
      verificarContasFuturas();
    }
  }, [proprietarioId, isAdmin, verificarContasFuturas]);

  // --- Filtro de Frontend para a aba Sintético ---
  const contas = useMemo(() => {
      let filtered = contasRaw;
      const termo = filtroTextoDebounced.toLowerCase();
      
      // 1. Filtro de Status
      filtered = filtered.filter(conta => {
          const total = ((conta as ContaPagarComProgresso).parcelas_total ?? 0);
          const pagas = ((conta as ContaPagarComProgresso).parcelas_pagas ?? 0);

          const isPago = isAdmin 
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
  }, [contasRaw, filtroStatus, filtroTextoDebounced, isAdmin]);
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
    
    const tabela = isAdmin ? 'admin_contas_pagar' : 'contas_pagar';
    const tabelaParcelas = isAdmin ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar';
    const campoDescricao = isAdmin ? 'descricao' : 'Descricao';
    
    try {
      // 1. Verificar se existem parcelas vinculadas
      const { count: parcelasCount, error: countError } = await supabase
          .from(tabelaParcelas)
          .select('*', { count: 'exact', head: true })
          .eq('conta_pagar_id', id);
          
      if (countError) throw countError;
      
      if (parcelasCount && parcelasCount > 0) {
        showError(`Não é possível excluir. Existem ${parcelasCount} parcela(s) vinculada(s) a esta conta. Exclua as parcelas individualmente primeiro.`);
        return;
      }
      
      // 2. Buscar a descrição da conta sintética antes de deletar
      const { data: contaToDelete, error: fetchError } = await supabase
          .from(tabela)
          .select(campoDescricao)
          .eq('id', id)
          .single();
          
      if (fetchError) throw fetchError;
      const descricaoBusca = (contaToDelete as any)?.[campoDescricao] || '';
      
      // 3. Deletar todos os Lançamentos (Entrada/Saída) relacionados a esta conta sintética
      if (descricaoBusca) {
          const { error: deleteLancamentosError } = await supabase
              .from('lancamentos')
              .delete()
              .ilike('descricao', `%${descricaoBusca}%`)
              .eq('proprietario_id', proprietarioId);
              
          if (deleteLancamentosError) console.warn('Aviso: Falha ao deletar lançamentos associados:', deleteLancamentosError);
      }
      
      // 4. Deletar a conta sintética
      const { error } = await supabase.from(tabela).delete().eq('id', id);
      
      if (error) throw error;
      
      showSuccess('Conta a pagar excluída com sucesso.');
      fetchContas();
    } catch (error: any) {
      showError('Falha ao excluir conta: ' + error.message);
    }
  };
  
  const totalSintetico = useMemo(() => {
    return contas.reduce((sum, conta) => sum + ((conta as any).valor_total || (conta as any).valor || 0), 0);
  }, [contas]);
  
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
        <h1 className="text-3xl font-bold">Contas a Pagar {isAdmin && '(Admin)'}</h1>

        {temContasFuturas && !contasFuturasOpen && (
          <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-900/20">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">Contas Futuras Pendentes</AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300 flex items-center justify-between">
              <span>Existem lançamentos do Admin aguardando para serem adicionados às suas contas a pagar.</span>
              <Button 
                variant="outline" 
                size="sm" 
                className="ml-4 border-amber-500 text-amber-700 hover:bg-amber-100"
                onClick={() => setContasFuturasOpen(true)}
              >
                Ver Contas Futuras
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="sintetico">Sintético</TabsTrigger>
            <TabsTrigger value="parcelas">Parcelas</TabsTrigger>
            <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
          </TabsList>

          <ContasPagarHeader
              isSupervisao={isAdmin}
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
                  isSupervisao={isAdmin}
                  handleOpenDetalhes={handleOpenDetalhes}
                  handleOpenForm={handleOpenForm}
                  handleDelete={handleDelete}
                  formatarData={formatarData}
                  formatCurrency={formatCurrency}
                  getBadgeVariant={getBadgeVariant as any}
              />
          </TabsContent>

          <TabsContent value="parcelas" className="space-y-4">
              <ParcelasTab
                  loading={loading}
                  parcelas={parcelas}
                  totalParcelas={totalParcelas}
                  handleOpenPagamento={handleOpenPagamento}
                  formatarData={formatarData}
                  formatCurrency={formatCurrency}
                  formatarOrigem={formatarOrigem}
                  getBadgeVariant={getBadgeVariant as any}
              />
          </TabsContent>
          
          <TabsContent value="pagamentos" className="space-y-4">
              <PagamentosTab
                  loading={loading}
                  pagamentos={pagamentos}
                  totalPagamentos={totalPagamentos}
                  formatarData={formatarData}
                  formatCurrency={formatCurrency}
              />
          </TabsContent>
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
        
        {proprietarioId && !isAdmin && (
          <ContasFuturasDialog
            clienteId={proprietarioId}
            open={contasFuturasOpen}
            onOpenChange={setContasFuturasOpen}
            onLancamentoComplete={() => {
              verificarContasFuturas(false);
              fetchContas();
            }}
          />
        )}
      </div>
    </LayoutPrincipal>
  );
};

export default ContasPagar;