import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, PlusCircle, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContaReceber, ExtendedParcelaDetalhada, ContaReceberComProgresso, AdminRecebimento } from '@/types/contas-receber';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormContasReceber from '@/components/formularios/FormContasReceber';
import DetalhesParcelasDialog from '@/components/DetalhesParcelasDialog';
import { DateRange } from 'react-day-picker';
import { isToday, isPast, parseISO, format } from 'date-fns';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import RegistrarPagamentoDialog from '@/components/contas-receber/RegistrarPagamentoDialog';
import ContasReceberAcoes from '@/components/contas-receber/ContasReceberAcoes';
import ContasReceberResumo from '@/components/contas-receber/ContasReceberResumo';
import TabelaSintetica from '@/components/contas-receber/TabelaSintetica';
import TabelaParcelas from '@/components/contas-receber/TabelaParcelas';
import TabelaRecebimentos from '@/components/contas-receber/TabelaRecebimentos';
import { useDebounce } from '@/hooks/use-debounce';
import { formatarData } from '@/utils/formatters';
import SetupBlocker from '@/components/SetupBlocker';
import { useSessao } from '@/hooks/use-sessao';
import { useOwner } from '@/hooks/use-owner'; // NOVO IMPORT
import { GerarLinkPagBankDialog } from '@/components/contas-receber/GerarLinkPagBankDialog';
import { VisualizarLinkPagBankDialog } from '@/components/contas-receber/VisualizarLinkPagBankDialog';
import { PagBankPaymentStatus } from '@/components/contas-receber/PagBankPaymentStatus';
import { VisualizarBoletoDialog } from '@/components/contas-receber/VisualizarBoletoDialog';
import ModalSelecionarTransacaoExtrato from '@/components/conciliacao/ModalSelecionarTransacaoExtrato';
import { buscarTransacoesExtratoDisponiveis, vincularParcelaComExtrato, TransacaoExtratoCandidata } from '@/hooks/conciliacao/useMapeamentoInverso';

type ParcelaStatus = 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada' | 'bloqueada';
type BadgeVariant = 'success' | 'warning' | 'secondary' | 'destructive' | 'default' | 'info';

const getBadgeVariant = (status: ParcelaStatus, dataVencimento: string): BadgeVariant => {
  const vencimento = parseISO(dataVencimento + 'T00:00:00');

  if (status === 'paga') return 'success';
  if (status === 'cancelada' || status === 'bloqueada') return 'destructive';
  
  if (isPast(vencimento) && !isToday(vencimento)) return 'destructive';
  if (isToday(vencimento)) return 'warning';

  return 'secondary';
};

type FiltroOrigem = 'todos' | 'contrato' | 'assinatura_recorrente' | 'manual';

interface ParcelaParaPagamento {
  id: string;
  conta_receber_id: string;
  empresa_id: string;
  valor_parcela: number;
  valor_pago: number;
  cliente_id: string | null;
}


const ContasReceber = () => {
  const { usuario, perfil, role, carregando: carregandoSessao, setupStatus } = useSessao();
  const { ownerId, ownerType } = useOwner(); // USANDO useOwner
  
  const [contas, setContas] = useState<ContaReceberComProgresso[]>([]);
  const [parcelas, setParcelas] = useState<ExtendedParcelaDetalhada[]>([]);
  const [recebimentos, setRecebimentos] = useState<AdminRecebimento[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [contaSelecionada, setContaSelecionada] = useState<ContaReceber | null>(null);
  const [parcelasDialogOpen, setParcelasDialogOpen] = useState(false);
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [parcelaParaPagamento, setParcelaParaPagamento] = useState<any>(null);
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>(undefined); // ALTERADO: Removido o período inicial
  const [clienteNomeMap, setClienteNomeMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('parcela_sintetica');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'quitado' | 'nao_quitado'>('todos');
  const [filtroOrigem, setFiltroOrigem] = useState<FiltroOrigem>('todos');
  const [filtroTexto, setFiltroTexto] = useState(''); // NOVO ESTADO
  const filtroTextoDebounced = useDebounce(filtroTexto, 500); // NOVO DEBOUNCE
  const [pagbankDialogOpen, setPagbankDialogOpen] = useState(false);
  const [visualizarPagbankDialogOpen, setVisualizarPagbankDialogOpen] = useState(false);
  const [selectedParcela, setSelectedParcela] = useState<any>(null);
  const [modalMapeamentoExtratoOpen, setModalMapeamentoExtratoOpen] = useState(false);
  const [parcelaParaMapear, setParcelaParaMapear] = useState<ExtendedParcelaDetalhada | null>(null);
  const [transacoesExtratoDisponiveis, setTransacoesExtratoDisponiveis] = useState<TransacaoExtratoCandidata[]>([]);
  const [loadingTransacoesExtrato, setLoadingTransacoesExtrato] = useState(false);
  const [boletoDialogOpen, setBoletoDialogOpen] = useState(false);
  const [boletoData, setBoletoData] = useState<any>(null);
  const [gerandoBoleto, setGerandoBoleto] = useState(false);

  const isAdmin = role === 'Admin';
  
  const proprietarioId = ownerId; // USANDO ownerId
  const isClientUser =
    role === 'Usuario' &&
    perfil &&
    'cliente_id' in perfil &&
    Boolean((perfil as UsuarioProfile)?.cliente_id);
  const shouldBlockSetup =
    (role === 'Cliente' || isClientUser) &&
    setupStatus &&
    !setupStatus.isComplete;

  const buscarDados = useCallback(async () => {
    if (!proprietarioId || shouldBlockSetup) {
      setCarregandoDados(false);
      return;
    }
    
    setCarregandoDados(true);
    
    // Determina a tabela e a chave de filtro
    const tabelaContasReceber = ownerType === 'Admin' || ownerType === 'AdminUsuario' ? 'admin_contas_receber' : 'contas_receber';
    const tabelaParcelasReceber = ownerType === 'Admin' || ownerType === 'AdminUsuario' ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
    const tabelaClientes = ownerType === 'Admin' || ownerType === 'AdminUsuario' ? 'tbl_clientes' : 'clientes';
    const ownerKey = ownerType === 'Admin' || ownerType === 'AdminUsuario' ? 'admin_id' : 'empresa_id';
    
    // --- 1. Buscar Contas Sintéticas ---
    let contasQuery = supabase
        .from(tabelaContasReceber)
        .select(`*`)
        .eq(ownerKey, proprietarioId)
        .order('data_vencimento', { ascending: true });
        
    // Aplica filtros de período
    if (filtroPeriodo?.from) {
        contasQuery = contasQuery.gte('data_vencimento', format(filtroPeriodo.from, 'yyyy-MM-dd'));
    }
    if (filtroPeriodo?.to) {
        contasQuery = contasQuery.lte('data_vencimento', format(filtroPeriodo.to, 'yyyy-MM-dd'));
    }
    
    const [contasRes, parcelasRes, recebimentosRes] = await Promise.all([
      contasQuery,
      
      // --- 2. Buscar Parcelas (Analítico) - Sem JOIN automático de clientes ---
      supabase
        .from(tabelaParcelasReceber)
        .select(`
          *,
          contas_receber: ${tabelaContasReceber} (
            id,
            descricao,
            cliente_id,
            origem
          ),
          pagbank_charge_id,
          pagbank_payment_link,
          pagbank_checkout_id,
          pagbank_checkout_link,
          pagbank_link_expira_em,
          pagbank_status,
          pagbank_qr_code,
          pagbank_qr_code_text,
          pagbank_payment_method,
          pagbank_updated_at
        `)
        .eq(ownerKey, proprietarioId)
        .order('data_vencimento', { ascending: true }),
        
      // --- 3. Buscar Recebimentos (Histórico) ---
      (ownerType === 'Admin' || ownerType === 'AdminUsuario') ? supabase
        .from('admin_recebimentos')
        .select(`
          *,
          saldo_contas ( nome ),
          admin_parcelas_receber (
            numero_parcela,
            admin_contas_receber ( id, descricao, origem, cliente_id )
          )
        `)
        .eq('admin_id', proprietarioId)
        .not('cliente_id', 'is', null)
        .order('data_recebimento', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (contasRes.error) {
        showError('Erro ao carregar contas: ' + contasRes.error.message);
        setCarregandoDados(false);
        return;
    }
    
    if (parcelasRes.error) {
        showError('Erro ao carregar parcelas: ' + parcelasRes.error.message);
        setCarregandoDados(false);
        return;
    }
    
    let fetchedContas = contasRes.data as ContaReceberComProgresso[];
    let fetchedParcelas = parcelasRes.data as unknown as ExtendedParcelaDetalhada[];
        
        // --- Buscar nomes dos clientes da tabela correta ---
        const clienteIds = [...new Set([
            ...fetchedContas.map(c => c.cliente_id).filter(Boolean),
            ...fetchedParcelas.map(p => p.contas_receber?.cliente_id).filter(Boolean)
        ])];
        
        let clienteMap: Record<string, { nome: string; razao_social?: string | null; telefone?: string; email?: string }> = {};
        if (clienteIds.length > 0) {
            const { data: clientesData } = await supabase
                .from(tabelaClientes)
                .select('id, nome, razao_social, telefone, email')
                .in('id', clienteIds);
                
            if (clientesData) {
                clienteMap = clientesData.reduce((acc, c) => {
                    acc[c.id] = { nome: c.nome, razao_social: c.razao_social, telefone: c.telefone, email: c.email };
                    return acc;
                }, {} as Record<string, { nome: string; razao_social?: string | null; telefone?: string; email?: string }>);
                
                // Merge dos nomes dos clientes nas contas
                fetchedContas = fetchedContas.map(conta => ({
                    ...conta,
                    clientes: conta.cliente_id && clienteMap[conta.cliente_id] 
                        ? { nome: clienteMap[conta.cliente_id].nome, razao_social: clienteMap[conta.cliente_id].razao_social } as any
                        : conta.clientes
                }));
                
                // Merge dos nomes dos clientes nas parcelas
                fetchedParcelas = fetchedParcelas.map(parcela => ({
                    ...parcela,
                    contas_receber: parcela.contas_receber ? {
                        ...parcela.contas_receber,
                        clientes: parcela.contas_receber.cliente_id && clienteMap[parcela.contas_receber.cliente_id]
                            ? clienteMap[parcela.contas_receber.cliente_id]
                            : null
                    } : null
                }));
            }
        }
        
        // --- Lógica para calcular progresso de pagamento ---
        const parcelasPorConta = fetchedParcelas.reduce((acc, p) => {
            acc[p.conta_receber_id] = acc[p.conta_receber_id] || [];
            acc[p.conta_receber_id].push(p);
            return acc;
        }, {} as Record<string, ExtendedParcelaDetalhada[]>);
        
        fetchedContas = fetchedContas.map(conta => {
            const parcelas = parcelasPorConta[conta.id] || [];
            const pagas = parcelas.filter(p => p.status === 'paga').length;
            return {
                ...conta,
                parcelas_pagas: pagas,
                parcelas_total: parcelas.length,
            };
        });
        
    setContas(fetchedContas);
    setParcelas(fetchedParcelas);
    
    if ((ownerType === 'Admin' || ownerType === 'AdminUsuario') && recebimentosRes.data) {
        setRecebimentos(recebimentosRes.data as AdminRecebimento[]);
        
        // Atualiza o mapa de nomes de clientes para recebimentos
        const clienteIdsRecebimentos = recebimentosRes.data.map(r => r.cliente_id);
        
        // 1. Buscar nomes dos clientes (tbl_clientes)
        const { data: clientesData } = await supabase
            .from('tbl_clientes')
            .select('id, nome')
            .in('id', clienteIdsRecebimentos);
            
        if (clientesData) {
            const map = clientesData.reduce((acc, c) => {
                acc[c.id] = c.nome;
                return acc;
            }, {} as Record<string, string>);
            setClienteNomeMap(map);
        }
    }

    setCarregandoDados(false);
  }, [proprietarioId, ownerType, filtroPeriodo, shouldBlockSetup]);
  
  useEffect(() => {
    if (!carregandoSessao && usuario) {
      buscarDados();
    }
  }, [carregandoSessao, usuario, buscarDados]);

  const handleSaveComplete = () => {
    setDialogAberto(false);
    setContaSelecionada(null);
    buscarDados();
  };
  
  const handlePagamentoCompleto = () => {
    setPagamentoDialogOpen(false);
    buscarDados();
  };

  // CORREÇÃO: Implementação da função handleEdit
  const handleEdit = (conta: ContaReceberComProgresso) => {
    // Converte ContaReceberComProgresso para ContaReceber (removendo os campos opcionais)
    const baseConta: ContaReceber = {
        id: conta.id,
        empresa_id: (conta as any).empresa_id || (conta as any).admin_id,
        cliente_id: conta.cliente_id,
        origem: conta.origem,
        descricao: conta.descricao,
        valor_total: conta.valor_total,
        data_emissao: conta.data_emissao,
        data_vencimento: conta.data_vencimento,
        status: conta.status,
        tipo_receita: conta.tipo_receita,
        clientes: conta.clientes,
        created_at: conta.created_at,
        updated_at: conta.updated_at,
        historico_id: conta.historico_id,
        id_conta_patrimonial: conta.id_conta_patrimonial, // <-- FIX: Usando id_conta_patrimonial
    };
    setContaSelecionada(baseConta);
    setDialogAberto(true);
  };

  const handleDelete = async (contaId: string) => {
    setCarregandoDados(true);
    const tabelaContasReceber = ownerType === 'Admin' || ownerType === 'AdminUsuario' ? 'admin_contas_receber' : 'contas_receber';
    const tabelaParcelasReceber = ownerType === 'Admin' || ownerType === 'AdminUsuario' ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
    
    try {
      // 1. Verificar se existem parcelas vinculadas
      const { count: parcelasCount, error: countError } = await supabase
          .from(tabelaParcelasReceber)
          .select('*', { count: 'exact', head: true })
          .eq('conta_receber_id', contaId);
          
      if (countError) throw countError;
      
      if (parcelasCount && parcelasCount > 0) {
        showError(`Não é possível excluir. Existem ${parcelasCount} parcela(s) vinculada(s) a esta conta. Exclua as parcelas individualmente primeiro.`);
        setCarregandoDados(false);
        return;
      }
      
      // 2. Buscar a descrição da conta sintética antes de deletar
      const contaToDelete = contas.find(c => c.id === contaId);
      const descricaoBusca = contaToDelete?.descricao || '';
      
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
      const { error } = await supabase.from(tabelaContasReceber).delete().eq('id', contaId);
      
      if (error) throw error;
      
      showSuccess('Conta excluída com sucesso.');
      buscarDados();
    } catch (error: any) {
      showError('Falha ao excluir conta: ' + error.message);
      setCarregandoDados(false);
    }
  };
  
  // CORREÇÃO: Atualiza handleOpenParcelas para aceitar ContaReceberComProgresso
  const handleOpenParcelas = (conta: ContaReceberComProgresso) => {
    // Converte ContaReceberComProgresso para ContaReceber (removendo os campos opcionais)
    const baseConta: ContaReceber = {
        id: conta.id,
        empresa_id: (conta as any).empresa_id || (conta as any).admin_id,
        cliente_id: conta.cliente_id,
        origem: conta.origem,
        descricao: conta.descricao,
        valor_total: conta.valor_total,
        data_emissao: conta.data_emissao,
        data_vencimento: conta.data_vencimento,
        status: conta.status,
        tipo_receita: conta.tipo_receita,
        clientes: conta.clientes,
        created_at: conta.created_at,
        updated_at: conta.updated_at,
        historico_id: conta.historico_id,
        id_conta_patrimonial: conta.id_conta_patrimonial, // <-- FIX: Usando id_conta_patrimonial
    };
    setContaSelecionada(baseConta);
    setParcelasDialogOpen(true);
  };
  
  const handleOpenPagamento = (parcela: any) => {
    const isMyLaunch = ownerType === 'Admin' || ownerType === 'AdminUsuario';
    
    const contaReceber = isMyLaunch 
        ? (parcela as ExtendedParcelaDetalhada).contas_receber
        : (parcela as ExtendedParcelaDetalhada).contas_receber;
        
    let clienteId: string | null = (contaReceber?.cliente_id as string | null) || null; 
        
    const mappedParcela: ParcelaParaPagamento = {
        id: parcela.id,
        conta_receber_id: parcela.conta_receber_id,
        empresa_id: proprietarioId!,
        valor_parcela: parcela.valor_parcela,
        valor_pago: parcela.valor_pago,
        cliente_id: clienteId,
    };
    
    setParcelaParaPagamento(mappedParcela);
    setPagamentoDialogOpen(true);
  };

  const handleMapearComExtrato = useCallback(async (parcela: ExtendedParcelaDetalhada) => {
    setParcelaParaMapear(parcela);
    setLoadingTransacoesExtrato(true);
    setModalMapeamentoExtratoOpen(true);

    try {
      const clienteNome = parcela.contas_receber?.clientes?.nome || 'Desconhecido';
      const transacoes = await buscarTransacoesExtratoDisponiveis(
        {
          valor: parcela.valor_parcela,
          data_vencimento: parcela.data_vencimento,
          cliente_nome: clienteNome,
          tipo: 'CR'
        },
        ownerId
      );
      setTransacoesExtratoDisponiveis(transacoes);
    } catch (error) {
      console.error('Erro ao buscar transações do extrato:', error);
      setTransacoesExtratoDisponiveis([]);
    } finally {
      setLoadingTransacoesExtrato(false);
    }
  }, [ownerId]);

  const handleConfirmarMapeamentoExtrato = useCallback(async (transacaoId: string) => {
    if (!parcelaParaMapear) return;

    const result = await vincularParcelaComExtrato(
      parcelaParaMapear.id,
      transacaoId,
      'CR',
      role === 'Admin',
      ownerId
    );

    if (result.success) {
      showSuccess('Parcela vinculada com extrato bancário com sucesso!');
      setModalMapeamentoExtratoOpen(false);
      setParcelaParaMapear(null);
      buscarDados();
    } else {
      showError(result.error || 'Erro ao vincular parcela com extrato');
    }
  }, [parcelaParaMapear, ownerId, role, buscarDados]);

  const handleGerarBoleto = useCallback(async (parcela: ExtendedParcelaDetalhada) => {
    setGerandoBoleto(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-pagbank-boleto', {
        body: { 
          parcela_id: parcela.id,
          admin_id: proprietarioId
        }
      });
      
      if (error) throw error;
      
      if (data.success) {
        setBoletoData({
          barcode: data.barcode,
          pdfLink: data.pdf_link,
          valorOriginal: data.valor_original,
          valorMulta: data.valor_multa,
          valorJuros: data.valor_juros,
          valorTotal: data.valor_total,
          diasAtraso: data.dias_atraso,
          clienteNome: parcela.contas_receber?.clientes?.nome,
          clienteTelefone: parcela.contas_receber?.clientes?.telefone,
          clienteEmail: parcela.contas_receber?.clientes?.email,
        });
        setBoletoDialogOpen(true);
        showSuccess('Boleto gerado com sucesso!');
        buscarDados();
      } else {
        showError(data.message || 'Erro ao gerar boleto');
      }
    } catch (error: any) {
      console.error('Erro ao gerar boleto:', error);
      showError('Erro ao gerar boleto: ' + error.message);
    } finally {
      setGerandoBoleto(false);
    }
  }, [buscarDados]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateString: string) => formatarData(dateString);
  
  // Função para formatar timestamp completo (ISO string)
  const formatTimestamp = (dateString: string) => {
    try {
        const date = parseISO(dateString);
        return format(date, 'dd/MM/yyyy HH:mm:ss');
    } catch (e) {
        return 'Invalid Date';
    }
  };
  
  // --- Filtros de Dados (Mantidos) ---
  const filterData = (data: any[], dateKey: string) => {
    if (!filtroPeriodo?.from) return data;
    
    const start = filtroPeriodo.from;
    const end = filtroPeriodo.to || new Date();
    
    return data.filter(item => {
        const dateString = item[dateKey];
        let date: Date;
        
        if (dateString.includes('T')) {
            date = parseISO(dateString);
        } else {
            date = parseISO(dateString + 'T00:00:00');
        }
        
        const itemDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());

        return itemDateOnly >= startDateOnly && itemDateOnly <= endDateOnly;
    });
  };
  
  const filterByStatus = (data: ContaReceberComProgresso[] | ExtendedParcelaDetalhada[], isSynthetic: boolean) => {
    let filteredByStatus = data;
    
    if (filtroStatus !== 'todos') {
        filteredByStatus = data.filter(item => {
            let isPaid: boolean;
            
            if (isSynthetic) {
                const conta = item as ContaReceberComProgresso;
                const total = conta.parcelas_total ?? 0;
                const pagas = conta.parcelas_pagas ?? 0;
                isPaid = total > 0 && pagas === total;
            } else {
                const parcela = item as ExtendedParcelaDetalhada;
                isPaid = parcela.status === 'paga';
            }

            return filtroStatus === 'quitado' ? isPaid : !isPaid;
        }) as any;
    }
    
    if (isSynthetic && filtroOrigem !== 'todos') {
        filteredByStatus = filteredByStatus.filter(item => {
            const conta = item as ContaReceberComProgresso;
            return conta.origem === filtroOrigem;
        }) as any;
    }
    
    if (!isSynthetic && filtroOrigem !== 'todos') {
        filteredByStatus = filteredByStatus.filter(item => {
            const parcela = item as ExtendedParcelaDetalhada;
            const origem = parcela.contas_receber?.origem;
            return origem === filtroOrigem;
        }) as any;
    }

    return filteredByStatus;
  };
  
  const contasFiltradas = useMemo(() => {
    let filtered = filterData(contas, 'data_vencimento') as ContaReceberComProgresso[];
    filtered = filterByStatus(filtered, true) as ContaReceberComProgresso[];
    
    if (filtroTextoDebounced) {
        const termo = filtroTextoDebounced.toLowerCase();
        filtered = filtered.filter(c => 
            c.id.toLowerCase().includes(termo) ||
            c.clientes?.nome?.toLowerCase().includes(termo) ||
            c.clientes?.razao_social?.toLowerCase().includes(termo) ||
            c.descricao.toLowerCase().includes(termo)
        );
    }
    
    return filtered;
  }, [contas, filtroPeriodo, filtroStatus, filtroOrigem, filtroTextoDebounced]);

  const parcelasFiltradas = useMemo(() => {
    const dateFiltered = filterData(parcelas, 'data_vencimento') as ExtendedParcelaDetalhada[];
    
    // Filtro de texto para parcelas (busca por ID da conta sintética, descrição ou cliente)
    let filteredByText = dateFiltered;
    if (filtroTextoDebounced) {
        const termo = filtroTextoDebounced.toLowerCase();
        filteredByText = filteredByText.filter(p => {
            const contaId = p.contas_receber?.id || '';
            const descricao = p.contas_receber?.descricao || '';
            const clienteNome = p.contas_receber?.clientes?.nome || '';
            const razaoSocial = p.contas_receber?.clientes?.razao_social || '';
            
            return p.id.toLowerCase().includes(termo) ||
                   contaId.toLowerCase().includes(termo) ||
                   descricao.toLowerCase().includes(termo) ||
                   clienteNome.toLowerCase().includes(termo) ||
                   razaoSocial.toLowerCase().includes(termo);
        });
    }
    
    return filterByStatus(filteredByText, false) as ExtendedParcelaDetalhada[];
  }, [parcelas, filtroPeriodo, filtroStatus, filtroOrigem, filtroTextoDebounced]);
  
  const recebimentosFiltrados = useMemo(() => {
    let filtered = filterData(recebimentos, 'data_recebimento');
    
    // Filtro de texto para recebimentos (busca por ID da conta sintética, descrição ou cliente)
    if (filtroTextoDebounced) {
        const termo = filtroTextoDebounced.toLowerCase();
        filtered = filtered.filter(r => {
            const contaId = r.admin_parcelas_receber?.admin_contas_receber?.id || '';
            const descricao = r.admin_parcelas_receber?.admin_contas_receber?.descricao || '';
            const clienteNome = clienteNomeMap[r.cliente_id] || '';
            
            return r.id.toLowerCase().includes(termo) ||
                   contaId.toLowerCase().includes(termo) ||
                   descricao.toLowerCase().includes(termo) ||
                   clienteNome.toLowerCase().includes(termo);
        });
    }
    
    if (filtroOrigem !== 'todos') {
        filtered = filtered.filter(r => {
            const origem = r.admin_parcelas_receber?.admin_contas_receber?.origem;
            return origem === filtroOrigem;
        });
    }
    
    return filtered;
  }, [recebimentos, filtroPeriodo, filtroOrigem, filtroTextoDebounced, clienteNomeMap]);

  if (carregandoSessao || carregandoDados) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  if (shouldBlockSetup) {
    return (
      <LayoutPrincipal>
        <SetupBlocker missingSteps={setupStatus?.missingSteps ?? []} />
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold">Contas a Receber</h1>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setContaSelecionada(null)} className="w-full sm:w-auto">
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Lançamento
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{contaSelecionada ? 'Editar Lançamento' : 'Novo Lançamento'}</DialogTitle>
            </DialogHeader>
            <FormContasReceber 
              contaInicial={contaSelecionada}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
      </div>
      
      <ContasReceberAcoes
        activeTab={activeTab}
        filtroPeriodo={filtroPeriodo}
        setFiltroPeriodo={setFiltroPeriodo}
        contasFiltradas={contasFiltradas}
        parcelasFiltradas={parcelasFiltradas}
        recebimentosFiltrados={recebimentosFiltrados}
        clienteNomeMap={clienteNomeMap}
        isAdmin={isAdmin}
        filtroStatus={filtroStatus}
        setFiltroStatus={setFiltroStatus}
        filtroOrigem={filtroOrigem}
        setFiltroOrigem={setFiltroOrigem}
        filtroTexto={filtroTexto} // NOVO PROP
        setFiltroTexto={setFiltroTexto} // NOVO PROP
      />
      
      <ContasReceberResumo
        activeTab={activeTab}
        contasFiltradas={contasFiltradas}
        parcelasFiltradas={parcelasFiltradas}
        recebimentosFiltrados={recebimentosFiltrados}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-4">
        <TabsList className="flex flex-wrap justify-start w-full h-auto p-1">
          <TabsTrigger value="parcela_sintetica" className="flex-1 sm:flex-auto">Resumo (Sintético)</TabsTrigger>
          <TabsTrigger value="parcelas" className="flex-1 sm:flex-auto">Parcelas (Analítico)</TabsTrigger>
          <TabsTrigger value="recebimentos" className="flex-1 sm:flex-auto">Recebimentos (Histórico)</TabsTrigger>
        </TabsList>
        
        {/* ABA 1: RESUMO (SINTÉTICO) */}
        <TabsContent value="parcela_sintetica" className="mt-4">
          <TabelaSintetica
            contasFiltradas={contasFiltradas}
            handleOpenParcelas={handleOpenParcelas}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
          />
        </TabsContent>
        
        {/* ABA 2: PARCELAS (ANALÍTICO) */}
        <TabsContent value="parcelas" className="mt-4">
          <TabelaParcelas
            parcelasFiltradas={parcelasFiltradas}
            handleOpenPagamento={handleOpenPagamento}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            getBadgeVariant={getBadgeVariant}
            onGerarLinkPagBank={(parcela) => {
              setSelectedParcela(parcela);
              setPagbankDialogOpen(true);
            }}
            onVisualizarLinkPagBank={(parcela) => {
              setSelectedParcela(parcela);
              setVisualizarPagbankDialogOpen(true);
            }}
            onRegerarLinkPagBank={async (parcela) => {
              if (!confirm('Deseja regerar o link de pagamento? O link anterior será invalidado.')) {
                return;
              }
              try {
                // Limpar link antigo
                const { error } = await supabase
                  .from('admin_parcelas_receber')
                  .update({
                    pagbank_checkout_id: null,
                    pagbank_checkout_link: null,
                    pagbank_link_expira_em: null,
                    pagbank_status: null,
                  })
                  .eq('id', parcela.id);

                if (error) throw error;

                toast.success('Link anterior removido. Gerando novo link...');
                
                // Abrir modal para gerar novo link
                setSelectedParcela(parcela);
                setPagbankDialogOpen(true);
                
              } catch (error: any) {
                console.error('Erro ao regerar link:', error);
                toast.error('Erro ao limpar link antigo: ' + error.message);
              }
            }}
            onMapearComExtrato={handleMapearComExtrato}
            onGerarBoleto={handleGerarBoleto}
          />
        </TabsContent>
        
        {/* ABA 3: RECEBIMENTOS (HISTÓRICO) */}
        <TabsContent value="recebimentos" className="mt-4">
          <TabelaRecebimentos
            recebimentosFiltrados={recebimentosFiltrados}
            clienteNomeMap={clienteNomeMap}
            formatCurrency={formatCurrency}
            formatTimestamp={formatTimestamp}
          />
        </TabsContent>
      </Tabs>
      
      <DetalhesParcelasDialog
        conta={contaSelecionada}
        open={parcelasDialogOpen}
        onOpenChange={setParcelasDialogOpen}
        onDataChange={buscarDados}
      />
      
      <RegistrarPagamentoDialog
        parcela={parcelaParaPagamento}
        open={pagamentoDialogOpen}
        onOpenChange={setPagamentoDialogOpen}
        onSaveComplete={handlePagamentoCompleto}
      />
      
      {selectedParcela && (
        <GerarLinkPagBankDialog
          open={pagbankDialogOpen}
          onOpenChange={setPagbankDialogOpen}
          parcelaId={selectedParcela.id}
          valorParcela={selectedParcela.valor_parcela}
          descricao={selectedParcela.contas_receber?.descricao || ''}
          onSuccess={() => {
            setPagbankDialogOpen(false);
            buscarDados();
          }}
        />
      )}
      
      {selectedParcela && (
        <VisualizarLinkPagBankDialog
          open={visualizarPagbankDialogOpen}
          onOpenChange={setVisualizarPagbankDialogOpen}
          paymentLink={selectedParcela.pagbank_payment_link}
          checkoutLink={selectedParcela.pagbank_checkout_link}
          qrCode={selectedParcela.pagbank_qr_code}
          qrCodeText={selectedParcela.pagbank_qr_code_text}
          valorParcela={selectedParcela.valor_parcela}
          descricao={selectedParcela.contas_receber?.descricao || ''}
          status={selectedParcela.pagbank_status}
          parcelaId={selectedParcela.id}
          clienteNome={selectedParcela.contas_receber?.clientes?.nome}
          clienteTelefone={selectedParcela.contas_receber?.clientes?.telefone}
          clienteEmail={selectedParcela.contas_receber?.clientes?.email}
          linkExpiraEm={selectedParcela.pagbank_link_expira_em}
        />
      )}

      <ModalSelecionarTransacaoExtrato
        open={modalMapeamentoExtratoOpen}
        onClose={() => {
          setModalMapeamentoExtratoOpen(false);
          setParcelaParaMapear(null);
        }}
        transacoes={transacoesExtratoDisponiveis}
        parcelaValor={parcelaParaMapear?.valor_parcela || 0}
        parcelaVencimento={parcelaParaMapear?.data_vencimento || ''}
        parcelaNome={parcelaParaMapear?.contas_receber?.clientes?.nome || 'Desconhecido'}
        loading={loadingTransacoesExtrato}
        onConfirmar={handleConfirmarMapeamentoExtrato}
      />
      
      {boletoData && (
        <VisualizarBoletoDialog
          open={boletoDialogOpen}
          onOpenChange={setBoletoDialogOpen}
          barcode={boletoData.barcode}
          pdfLink={boletoData.pdfLink}
          valorOriginal={boletoData.valorOriginal}
          valorMulta={boletoData.valorMulta}
          valorJuros={boletoData.valorJuros}
          valorTotal={boletoData.valorTotal}
          diasAtraso={boletoData.diasAtraso}
          clienteNome={boletoData.clienteNome}
          clienteTelefone={boletoData.clienteTelefone}
          clienteEmail={boletoData.clienteEmail}
        />
      )}
    </LayoutPrincipal>
  );
};

export default ContasReceber;