import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileSignature, ChevronLeft, Save, CalendarIcon, Eye, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo, ContratoTag, ContratoGerado } from '@/types/contratos';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClienteProfile, UsuarioProfile, AdminProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addDays, parseISO } from 'date-fns';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import ContratoPreviewDialog from '@/components/contratos/ContratoPreviewDialog';
import { useSessao } from '@/hooks/use-sessao';

type TipoLancamento = 'unico' | 'repetir' | 'parcelar';
type TipoConteudo = 'html' | 'texto';

// FIX 224, 234, 47: Define status type locally
type DocumentoStatus = 'rascunho' | 'finalizado' | 'arquivado' | 'ativo';

interface EmpresaLogada {
    nome: string;
    email: string;
    documento?: string | null;
    endereco_completo?: string | null;
    cpf?: string | null;
    cnpj?: string | null;
    rg?: string | null;
    telefone?: string | null;
    cep?: string | null;
    endereco?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    estado?: string | null;
}

interface EmpresaContrato {
    id: string;
    nome: string;
}

// NOVO TIPO: Cliente CR com todos os campos de tag
interface ClienteCRCompleto {
    id: string;
    proprietario_id?: string | null; // Adicionado para compatibilidade com a tabela 'clientes'
    nome: string;
    razao_social?: string | null;
    nome_fantasia?: string | null;
    documento?: string | null;
    email?: string | null;
    telefone?: string | null;
    telefone_fixo?: string | null;
    cep?: string | null;
    endereco?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    estado?: string | null;
    cpf?: string | null;
    cnpj?: string | null;
    rg?: string | null;
    data_nascimento?: string | null;
}

const PreencherContrato: React.FC = () => {
  const { modeloId } = useParams<{ modeloId: string }>();
  const [searchParams] = useSearchParams();
  const contratoId = searchParams.get('contratoId');
  const navigate = useNavigate();
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  
  const [modelo, setModelo] = useState<ContratoModelo | null>(null);
  const [contratoInicial, setContratoInicial] = useState<ContratoGerado | null>(null);
  const [tagsCustomizadas, setTagsCustomizadas] = useState<ContratoTag[]>([]);
  const [clientesCR, setClientesCR] = useState<ClienteCRCompleto[]>([]);
  
  const [valoresTags, setValoresTags] = useState<Record<string, string>>({});
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [previewOpen, setPreviewOpen] = useState(false);
  const [conteudoPreview, setConteudoPreview] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string>('');
  const [valorTotal, setValorTotal] = useState<number>(0);
  const [tituloDocumento, setTituloDocumento] = useState('');
  
  const [proprietarioContratoId, setProprietarioContratoId] = useState<string | null>(null); 
  const [empresasContrato, setEmpresasContrato] = useState<EmpresaContrato[]>([]);
  const [empresaLogada, setEmpresaLogada] = useState<EmpresaLogada | null>(null);
  
  // --- ESTADOS DE PAGAMENTO (MANTIDOS PARA CONTRATOS) ---
  const [tipoLancamento, setTipoLancamento] = useState<TipoLancamento>('unico');
  const [dataVencimentoUnico, setDataVencimentoUnico] = useState<Date | undefined>(undefined);
  const [numeroParcelas, setNumeroParcelas] = useState<number>(1);
  const [dataPrimeiroVencimento, setDataPrimeiroVencimento] = useState<Date | undefined>(undefined);
  const [intervaloDias, setIntervaloDias] = useState<number>(30);
  const [tipoConteudo, setTipoConteudo] = useState<TipoConteudo>('html'); 
  // ------------------------------------------------------

  // FIX TS2304: Declarando isEditing no escopo do componente
  const isEditing = !!contratoId;

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  
  const getOwnerIdLogado = () => {
    if (isAdmin) return usuario?.id || null;
    if (isCliente) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id; // FIX: proprietario_id -> cliente_id
    return null;
  };
  
  const ownerIdLogado = getOwnerIdLogado();

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (date: Date) => format(date, 'dd/MM/yyyy');

  // Cliente selecionado (para preenchimento de tags)
  const clienteSelecionado = useMemo(() => {
      return clientesCR.find(c => c.id === clienteSelecionadoId);
  }, [clientesCR, clienteSelecionadoId]);

  // Dados da Empresa Logada (para preenchimento de tags {{EMPRESA_*}})
  const empresaLogadaMemo = useMemo(() => {
    if (!perfil) return null;
    const profile = perfil as AdminProfile | ClienteProfile;
    
    const documentoCliente = (profile as ClienteProfile).documento || (profile as ClienteProfile).cpf;
    const documentoAdmin = (profile as AdminProfile).cnpj || (profile as AdminProfile).cpf;
    
    return {
        nome: profile.nome, 
        email: profile.email, 
        documento: isAdmin ? documentoAdmin : documentoCliente,
        cpf: (profile as AdminProfile).cpf || (profile as ClienteProfile).cpf, 
        cnpj: (profile as AdminProfile).cnpj, 
        rg: (profile as AdminProfile).rg || (profile as ClienteProfile)?.rg, 
        telefone: (profile as AdminProfile).telefone || (profile as ClienteProfile)?.telefone,
        cep: (profile as AdminProfile).cep || (profile as ClienteProfile)?.cep, 
        endereco: (profile as AdminProfile).endereco || (profile as ClienteProfile)?.endereco, 
        numero: (profile as AdminProfile).numero || (profile as ClienteProfile)?.numero, 
        complemento: (profile as AdminProfile).complemento || (profile as ClienteProfile)?.complemento,
        bairro: (profile as AdminProfile).bairro || (profile as ClienteProfile)?.bairro, 
        cidade: (profile as AdminProfile).cidade || (profile as ClienteProfile)?.cidade, 
        estado: (profile as AdminProfile).estado || (profile as ClienteProfile)?.estado,
    };
  }, [perfil, isAdmin, isClient]);


  // --- FUNÇÃO DE BUSCA DE CLIENTES E TAGS DEPENDENTE DO PROPRIETÁRIO ---
  const fetchDependentData = useCallback(async (targetEmpresaId: string) => {
    if (!targetEmpresaId) return;
    
    // 1. Buscar Tags Customizadas ATIVAS
    const { data: tagsData } = await supabase
        .from('contrato_tags')
        .select('*')
        .eq('empresa_id', targetEmpresaId)
        .order('nome_tag', { ascending: true });
        
    if (tagsData) {
        setTagsCustomizadas(tagsData as ContratoTag[]);
    }
    
    // 2. Buscar Clientes (Contratados) - AGORA BUSCA APENAS NA TABELA 'clientes' (Clientes CR)
    const { data: clientesCRData, error: errorCR } = await supabase
        .from('tbl_clientes') // CORREÇÃO: Usando tbl_clientes para garantir que o cliente exista no sistema
        .select('id, nome, razao_social, nome_fantasia, documento, email, telefone, telefone_fixo, cep, endereco, numero, complemento, bairro, cidade, estado, cpf, cnpj, rg') // Seleciona todos os campos para preenchimento de tags
        .eq('admin_id', targetEmpresaId) // Filtra pelos clientes do Admin
        .order('nome');
        
    if (errorCR) {
        showError('Erro ao carregar clientes CR: ' + errorCR.message);
        setClientesCR([]);
    } else {
        const mappedClients = (clientesCRData as ClienteCRCompleto[]).filter(c => c.id !== targetEmpresaId); // Filtra o próprio proprietário
        setClientesCR(mappedClients);
        
        // Se o cliente selecionado não estiver mais na lista, limpa a seleção
        if (clienteSelecionadoId && !mappedClients.some(c => c.id === clienteSelecionadoId)) {
            setClienteSelecionadoId('');
        }
    }
    
  }, [clienteSelecionadoId]);


  // --- FUNÇÃO PRINCIPAL DE BUSCA DE DADOS INICIAIS ---
  const buscarDados = useCallback(async () => {
    if (!modeloId || !ownerIdLogado) {
        setCarregandoDados(false);
        return;
    }
    
    setCarregandoDados(true);
    
    // 1. Buscar Modelo
    const { data: modeloData, error: modeloError } = await supabase
        .from('contrato_modelos')
        .select('*, tipo_conteudo')
        .eq('id', modeloId)
        .single();
        
    if (modeloError) {
        showError('Modelo não encontrado ou acesso negado.');
        navigate('/contratos', { replace: true });
        return;
    }
    setModelo(modeloData as ContratoModelo);
    setTituloDocumento(modeloData.titulo);
    
    // 2. Configurar Empresa Logada (Contratante)
    setEmpresaLogada(empresaLogadaMemo);
    
    // 3. Configurar Empresas Contratantes (Apenas Admin)
    let initialProprietarioContratoId = ownerIdLogado;
    if (isAdmin) {
        const { data: clientesData, error: clientesError } = await supabase
            .from('tbl_clientes')
            .select('id, nome')
            .eq('aprovado', true)
            .order('nome');
            
        if (clientesError) {
            showError('Erro ao carregar clientes do sistema: ' + clientesError.message);
        } else {
            const adminOption: EmpresaContrato = { id: ownerIdLogado, nome: 'Meus Contratos (Admin)' };
            const allClients = [adminOption, ...(clientesData as EmpresaContrato[])];
            setEmpresasContrato(allClients);
            initialProprietarioContratoId = allClients[0].id;
        }
    }
    
    // 4. Carregar Contrato Inicial (se for edição)
    if (contratoId) {
        const { data: contratoData, error: contratoLoadError } = await supabase
            .from('contratos_gerados')
            .select('*')
            .eq('id', contratoId)
            .single();
            
        if (contratoLoadError) {
            showError('Contrato para edição não encontrado ou acesso negado.');
            navigate('/contratos', { replace: true });
            return;
        }
        
        const contrato = contratoData as ContratoGerado;
        setContratoInicial(contrato);
        initialProprietarioContratoId = contrato.proprietario_id; // Sobrescreve o ID inicial
        
        setClienteSelecionadoId(contrato.cliente_id);
        setValorTotal(contrato.valor_total); // Define o valor total
        setValoresTags(contrato.valores_tags_preenchidos || {});
        
        const numParcelas = contrato.numero_parcelas;
        const valorTotalContrato = contrato.valor_total;
        
        const isContractOwnerAdmin = contrato.proprietario_id === ownerIdLogado && isAdmin;
        const tabelaContasReceber = isContractOwnerAdmin ? 'admin_contas_receber' : 'contas_receber';
        const tabelaParcelas = isContractOwnerAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
        
        // Busca a conta sintética para obter o ID da conta a receber
        const { data: contaReceberData, error: contaReceberError } = await supabase
            .from(tabelaContasReceber)
            .select('id')
            .eq('contrato_gerado_id', contrato.id)
            .limit(1)
            .single();
            
        if (contaReceberError && contaReceberError.code !== 'PGRST116') {
            console.error(`Erro ao buscar conta sintética na tabela ${tabelaContasReceber}:`, contaReceberError);
        }
            
        const contaReceberId = contaReceberData?.id;

        if (contaReceberId) {
            const { data: primeiraParcela, error: parcelaError } = await supabase
                .from(tabelaParcelas)
                .select('valor_parcela, data_vencimento')
                .eq('conta_receber_id', contaReceberId)
                .order('numero_parcela', { ascending: true })
                .limit(1)
                .single();
                
            if (parcelaError && parcelaError.code !== 'PGRST116') {
                console.error(`Erro ao buscar primeira parcela na tabela ${tabelaParcelas}:`, parcelaError);
            }
                
            if (primeiraParcela) {
                if (numParcelas === 1) {
                    setTipoLancamento('unico');
                    setDataVencimentoUnico(primeiraParcela.data_vencimento ? parseISO(primeiraParcela.data_vencimento) : undefined);
                    setNumeroParcelas(1);
                } else {
                    const valorParcela = primeiraParcela.valor_parcela || 0;
                    
                    // Determina se é parcelar ou repetir
                    if (Math.abs(valorTotalContrato - (valorParcela * numParcelas)) < 0.01) {
                        setTipoLancamento('parcelar');
                    } else {
                        setTipoLancamento('repetir');
                    }
                    
                    setNumeroParcelas(numParcelas);
                    setDataPrimeiroVencimento(primeiraParcela.data_vencimento ? parseISO(primeiraParcela.data_vencimento) : undefined);
                    setIntervaloDias(contrato.dia_vencimento_parcela || 30);
                }
            } else {
                // Fallback: Usa os dados do contrato para preencher o formulário
                if (numParcelas === 1) {
                    setTipoLancamento('unico');
                    setDataVencimentoUnico(contrato.data_inicio ? parseISO(contrato.data_inicio) : undefined);
                } else {
                    setTipoLancamento('parcelar'); // Assume parcelar como padrão para múltiplos
                    setNumeroParcelas(numParcelas);
                    setDataPrimeiroVencimento(contrato.data_inicio ? parseISO(contrato.data_inicio) : undefined);
                    setIntervaloDias(contrato.dia_vencimento_parcela || 30);
                }
            }
        } else {
            // Se não encontrou a conta a receber (registro ausente)
            console.error('LOG: Conta sintética não encontrada. Usando dados do contrato.');
            // Fallback: Usa os dados do contrato para preencher o formulário
            if (numParcelas === 1) {
                setTipoLancamento('unico');
                setDataVencimentoUnico(contrato.data_inicio ? parseISO(contrato.data_inicio) : undefined);
            } else {
                setTipoLancamento('parcelar');
                setNumeroParcelas(numParcelas);
                setDataPrimeiroVencimento(contrato.data_inicio ? parseISO(contrato.data_inicio) : undefined);
                setIntervaloDias(contrato.dia_vencimento_parcela || 30);
            }
        }
        
        setTipoConteudo(contrato.valores_tags_preenchidos?.tipo_conteudo || 'html');
    } else {
        // Novo Contrato
        const isHtmlContent = modeloData?.conteudo_template?.trim().startsWith('<') ?? true;
        setTipoConteudo(isHtmlContent ? 'html' : 'texto');
        setValorTotal(0);
    }
    
    setProprietarioContratoId(initialProprietarioContratoId);
    
    setCarregandoDados(false);
  }, [modeloId, ownerIdLogado, navigate, role, perfil, usuario, isAdmin, isClient, contratoId, empresaLogadaMemo]);
  
  // Efeito para monitorar a mudança do proprietário do contrato (proprietarioContratoId)
  useEffect(() => {
      if (proprietarioContratoId) {
          fetchDependentData(proprietarioContratoId);
      }
  }, [proprietarioContratoId, fetchDependentData]);


  useEffect(() => {
    if (!carregandoSessao && ownerIdLogado) {
      buscarDados();
    } else if (!carregandoSessao && !isAdmin && !isClient) {
        navigate('/painel', { replace: true });
    }
  }, [carregandoSessao, ownerIdLogado, buscarDados, navigate, isAdmin, isClient]);

  // --- Lógica de Preenchimento de Tags ---
  const allAvailableTags = useMemo(() => {
      // Combina tags padrão (sistema + financeiras) com as tags customizadas do usuário
      const customTagsMap = tagsCustomizadas.reduce((acc, tag) => {
          acc[tag.nome_tag] = tag;
          return acc;
      }, {} as Record<string, ContratoTag>);
      
      const combined = [...TAGS_PADRAO, ...tagsCustomizadas];
      
      // Remove duplicatas e ordena
      const uniqueTags = Array.from(new Set(combined.map(t => t.nome_tag)))
          .map(tagKey => {
              const customTag = customTagsMap[tagKey];
              const defaultTag = TAGS_PADRAO.find(t => t.nome_tag === tagKey);
              return customTag || defaultTag;
          })
          .filter((t): t is ContratoTag => !!t)
          .sort((a, b) => a.nome_tag.localeCompare(b.nome_tag));
          
      return uniqueTags;
  }, [tagsCustomizadas]);

  const updateTags = useCallback(() => {
    const newTags: Record<string, string> = {};
    
    allAvailableTags.forEach(tag => {
        const tagKey = tag.nome_tag;
        let tagValue: string | null = null;
        
        if (tag.origem_dado) {
            const [sourceTable, sourceField] = tag.origem_dado.split('.');
            
            // Mapeamento de dados da Empresa Logada (Contratante)
            if ((sourceTable === 'tbl_clientes' || sourceTable === 'tbl_admins') && empresaLogada) {
                const empresaData = empresaLogada as any;
                if (empresaData && empresaData[sourceField]) {
                    tagValue = String(empresaData[sourceField]);
                }
            } 
            
            // Mapeamento de dados do Cliente Selecionado (Contratado)
            else if (sourceTable === 'clientes' && clienteSelecionado) {
                const clienteData = clienteSelecionado as any;
                if (clienteData && clienteData[sourceField]) {
                    tagValue = String(clienteData[sourceField]);
                }
            } 
            
            // Mapeamento de Tags Financeiras (VALOR_TOTAL_CONTRATO, etc.)
            else if (sourceTable === 'contas_receber') {
                if (sourceField === 'valor_total') {
                    tagValue = formatCurrency(valorTotal);
                } else if (sourceField === 'numero_parcelas') {
                    tagValue = String(numeroParcelas);
                } else if (sourceField === 'valor_parcela') {
                    const valorParcela = numeroParcelas > 0 ? valorTotal / numeroParcelas : valorTotal;
                    tagValue = formatCurrency(valorParcela);
                } else if (sourceField === 'data_vencimento') {
                    const data = tipoLancamento === 'unico' ? dataVencimentoUnico : dataPrimeiroVencimento;
                    tagValue = data ? formatDate(data) : '';
                } else if (sourceField === 'data_emissao') {
                    tagValue = formatDate(new Date());
                }
            }
        }
        
        // 2. Se o valor foi preenchido automaticamente, usa-o.
        if (tagValue !== null && tagValue !== undefined && tagValue !== 'N/A') {
            newTags[tagKey] = tagValue;
        } else {
            // 3. Caso contrário, usa o valor salvo anteriormente ou o valor digitado.
            newTags[tagKey] = valoresTags[tagKey] || '';
        }
    });
    
    setValoresTags(newTags);
  }, [clienteSelecionado, empresaLogada, valoresTags, allAvailableTags, valorTotal, numeroParcelas, tipoLancamento, dataVencimentoUnico, dataPrimeiroVencimento]);

  useEffect(() => {
    updateTags();
  }, [updateTags]);

  const handleTagChange = (tag: string, value: string) => {
    setValoresTags(prev => ({ ...prev, [tag]: value }));
  };
  
  const renderizarConteudo = (template: string, tags: Record<string, string>): string => {
    let conteudoRenderizado = template;
    
    // 1. Substituição de Tags de Dados (Primeira Passagem)
    Object.keys(tags).forEach(tagKey => {
        const regex = new RegExp(tagKey, 'g');
        conteudoRenderizado = conteudoRenderizado.replace(regex, tags[tagKey]);
    });
    
    return conteudoRenderizado;
  };
  
  const handlePreview = () => {
      if (!modelo) return;
      const conteudoRenderizado = renderizarConteudo(modelo.conteudo_template, valoresTags);
      setConteudoPreview(conteudoRenderizado);
      setPreviewTitle(tituloDocumento || modelo.titulo);
      setPreviewOpen(true);
  };

  const handleSalvarContrato = async (status: ContratoGerado['status']) => {
    if (!modelo || !clienteSelecionadoId || !ownerIdLogado || !tituloDocumento || !proprietarioContratoId) {
        showError('Preencha Título, Cliente e Proprietário.');
        return;
    }
    
    // Validação de campos financeiros
    if (valorTotal <= 0) {
        showError('O valor total do contrato deve ser maior que zero.');
        return;
    }
    if (tipoLancamento === 'unico' && !dataVencimentoUnico) {
        showError('Selecione a data de vencimento única.');
        return;
    }
    if (tipoLancamento !== 'unico' && (!dataPrimeiroVencimento || numeroParcelas < 1 || intervaloDias < 1)) {
        showError('Preencha todos os campos de parcelamento.');
        return;
    }
    
    setIsSubmitting(true);
    
    try {
        // 0. GARANTIR QUE O CLIENTE EXISTA NA TABELA 'tbl_clientes' (para FK)
        const clienteSelecionado = clientesCR.find(c => c.id === clienteSelecionadoId);
        if (!clienteSelecionado) throw new Error('Cliente selecionado não encontrado.');
        
        // 1. Renderizar Conteúdo Final
        const conteudoRenderizado = renderizarConteudo(modelo.conteudo_template, valoresTags);
        
        // 2. Preparar dados do Contrato Gerado
        const dataInicio = tipoLancamento === 'unico' 
            ? format(dataVencimentoUnico!, 'yyyy-MM-dd')
            : format(dataPrimeiroVencimento!, 'yyyy-MM-dd');
            
        const contratoPayload = {
            modelo_id: modelo.id,
            cliente_id: clienteSelecionadoId, // Referencia tbl_clientes(id)
            proprietario_id: proprietarioContratoId,
            status: status,
            valor_total: valorTotal,
            data_inicio: dataInicio,
            numero_parcelas: tipoLancamento === 'unico' ? 1 : numeroParcelas,
            dia_vencimento_parcela: tipoLancamento !== 'unico' ? intervaloDias : null,
            valores_tags_preenchidos: { ...valoresTags, titulo: tituloDocumento, tipo_conteudo: tipoConteudo },
            conteudo_renderizado: conteudoRenderizado,
        };
        
        let contratoGeradoId: string;
        
        if (isEditing && contratoInicial) {
            // Atualizar Contrato Existente
            const { data, error } = await supabase
                .from('contratos_gerados')
                .update(contratoPayload)
                .eq('id', contratoInicial.id)
                .select('id')
                .single();
            if (error) throw error;
            contratoGeradoId = data.id;
            
            // Deletar contas a receber antigas (para recriar)
            const isContractOwnerAdmin = contratoInicial.proprietario_id === ownerIdLogado && isAdmin;
            const tabelaContasReceber = isContractOwnerAdmin ? 'admin_contas_receber' : 'contas_receber';
            
            const { data: contaReceberData } = await supabase
                .from(tabelaContasReceber)
                .select('id')
                .eq('contrato_gerado_id', contratoInicial.id)
                .limit(1)
                .single();
                
            if (contaReceberData) {
                await supabase.from(tabelaContasReceber).delete().eq('id', contaReceberData.id);
            }
            
        } else {
            // Inserir Novo Contrato
            const { data, error } = await supabase
                .from('contratos_gerados')
                .insert(contratoPayload)
                .select('id')
                .single();
            if (error) throw error;
            contratoGeradoId = data.id;
        }
        
        // 3. Gerar Contas a Receber (Apenas se não for rascunho)
        if (status !== 'rascunho') {
            const isContractOwnerAdmin = proprietarioContratoId === ownerIdLogado && isAdmin;
            const tabelaContasReceber = isContractOwnerAdmin ? 'admin_contas_receber' : 'contas_receber';
            const tabelaParcelasReceber = isContractOwnerAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
            const ownerKey = isContractOwnerAdmin ? 'admin_id' : 'empresa_id';
            
            // Buscar mapeamento contábil (apenas se for Admin)
            let contaAReceberId: string | null = null;
            let contaParcelaId: string | null = null;
            let contaReceitaResultado: string | null = null;
            
            if (isAdmin) {
                const [crConfig, parcelaConfig, receitaConfig] = await Promise.all([
                    supabase.from('configuracao_contas_receber').select('conta_contabil_id').eq('proprietario_id', ownerIdLogado).eq('tipo_registro', 'a_receber').single(),
                    supabase.from('configuracao_contas_receber').select('conta_contabil_id').eq('proprietario_id', ownerIdLogado).eq('tipo_registro', 'parcela').single(),
                    supabase.from('configuracao_contas_receber').select('conta_contabil_id').eq('proprietario_id', ownerIdLogado).eq('tipo_registro', 'recebimento_resultado').single(),
                ]);
                contaAReceberId = crConfig.data?.conta_contabil_id || null;
                contaParcelaId = parcelaConfig.data?.conta_contabil_id || null;
                contaReceitaResultado = receitaConfig.data?.conta_contabil_id || null;
            }
            
            // 3.1. Criar Conta Sintética
            const contaReceberPayload = {
                [ownerKey]: proprietarioContratoId,
                cliente_id: clienteSelecionadoId,
                descricao: `Contrato: ${tituloDocumento}`,
                valor_total: valorTotal,
                data_emissao: format(new Date(), 'yyyy-MM-dd'),
                data_vencimento: dataInicio,
                status: 'aberta',
                tipo_receita: tipoLancamento === 'unico' ? 'única' : 'recorrente',
                contrato_gerado_id: contratoGeradoId,
                ...(isAdmin && { id_conta_patrimonial: contaAReceberId }),
                ...(isAdmin && { id_conta_resultado: contaReceitaResultado }), // NOVO CAMPO
            };
            
            const { data: newConta, error: crError } = await supabase
                .from(tabelaContasReceber)
                .insert(contaReceberPayload)
                .select('id')
                .single();
                
            if (crError) throw crError;
            const newContaReceberId = newConta.id;
            
            // 3.2. Criar Parcelas
            let parcelasParaInserir = [];
            const valorParcela = tipoLancamento === 'parcelar' ? (valorTotal / numeroParcelas) : valorTotal;
            
            for (let i = 0; i < numeroParcelas; i++) {
                const vencimento = tipoLancamento === 'unico' 
                    ? dataVencimentoUnico! 
                    : addDays(dataPrimeiroVencimento!, i * intervaloDias);
                    
                parcelasParaInserir.push({
                    conta_receber_id: newContaReceberId,
                    [ownerKey]: proprietarioContratoId,
                    numero_parcela: i + 1,
                    valor_parcela: valorParcela,
                    data_vencimento: format(vencimento, 'yyyy-MM-dd'),
                    status: 'aberta',
                    ...(isAdmin && { id_conta_contabil: contaParcelaId }),
                });
            }
            
            const { error: parcelasError } = await supabase.from(tabelaParcelasReceber).insert(parcelasParaInserir);
            if (parcelasError) throw parcelasError;
            
            // 4. Lançamento 1: DÉBITO (Ativo) - Aumenta o direito a receber
            const dataMovimentacao = format(new Date(), 'yyyy-MM-dd') + 'T12:00:00Z';
            const launchDescription = `Contrato: ${tituloDocumento}`;
            const contaReceberIdShort = contratoGeradoId.substring(0, 8);
            
            if (contaAReceberId) {
                const lancamentoPatrimonialPayload = {
                    proprietario_id: ownerIdLogado,
                    data_movimentacao: dataMovimentacao,
                    descricao: `Lançamento Inicial CR: ${launchDescription} (CR ID: ${contaReceberIdShort})`,
                    valor: valorTotal,
                    tipo: 'Entrada' as const, // Entrada no Ativo (Débito)
                    conta_bancaria_id: null,
                    conta_contabil_id: contaAReceberId,
                    origem: 'lancamento_cr',
                };
                
                // Limpeza de lançamentos antigos (se edição)
                if (isEditing) {
                    const oldLaunchDescriptionPrefix = `Lançamento Inicial CR: ${contratoInicial?.valores_tags_preenchidos?.titulo || 'Contrato'} (CR ID: ${contratoInicial?.id.substring(0, 8)})`;
                    await supabase.from('lancamentos')
                        .delete()
                        .eq('origem', 'lancamento_cr')
                        .eq('proprietario_id', ownerIdLogado)
                        .ilike('descricao', `${oldLaunchDescriptionPrefix}%`);
                }
                
                await supabase.from('lancamentos').insert(lancamentoPatrimonialPayload);
            }
            
            // 5. Lançamento 2: CRÉDITO (Resultado) - Aumenta a Receita (DRE)
            if (isAdmin && contaReceitaResultado) {
                const lancamentoReceitaPayload = {
                    proprietario_id: ownerIdLogado,
                    data_movimentacao: dataMovimentacao,
                    descricao: `Receita: ${launchDescription} (CR ID: ${contaReceberIdShort})`,
                    valor: valorTotal,
                    tipo: 'Saida' as const, // Saída (Crédito) na Receita
                    conta_bancaria_id: null,
                    conta_contabil_id: contaReceitaResultado,
                    origem: 'lancamento_cr',
                };
                
                // Limpeza de lançamentos antigos (se edição)
                if (isEditing) {
                    const oldLaunchDescriptionPrefix = `Receita: ${contratoInicial?.valores_tags_preenchidos?.titulo || 'Contrato'} (CR ID: ${contratoInicial?.id.substring(0, 8)})`;
                    await supabase.from('lancamentos')
                        .delete()
                        .eq('origem', 'lancamento_cr')
                        .eq('proprietario_id', ownerIdLogado)
                        .ilike('descricao', `${oldLaunchDescriptionPrefix}%`);
                }
                
                await supabase.from('lancamentos').insert(lancamentoReceitaPayload);
            }
        }

        showSuccess(`Contrato ${isEditing ? 'atualizado' : 'salvo'} como ${status} com sucesso!`);
        // ALTERAÇÃO AQUI: Usando window.location.href
        window.location.href = '/contratos';
        
    } catch (error: any) {
        console.error('Erro ao salvar contrato:', error);
        showError('Falha ao salvar contrato: ' + error.message);
    } finally {
        setIsSubmitting(false);
    }
  };

  if (carregandoSessao || carregandoDados) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!modelo) {
      return <LayoutPrincipal><Card><CardHeader><CardTitle>Erro</CardTitle></CardHeader><CardContent><p>Modelo de contrato não encontrado.</p></CardContent></Card></LayoutPrincipal>;
  }
  
  // Filtra tags que já foram preenchidas automaticamente (para não pedir valor manual)
  const tagsParaPreenchimentoManual = Object.keys(valoresTags).filter(tagKey => {
      // Exclui tags financeiras (que são preenchidas pelo formulário)
      if (TAGS_PADRAO.some(t => t.origem_dado?.startsWith('contas_receber') && t.nome_tag === tagKey)) return false;
      
      // Exclui tags de sistema (EMPRESA_*) que foram preenchidas
      if (tagKey.startsWith('{{EMPRESA_') && valoresTags[tagKey]) return false;
      
      // Exclui tags de cliente (CLIENTE_*) que foram preenchidas
      if (tagKey.startsWith('{{CLIENTE_') && valoresTags[tagKey]) return false;
      
      // Inclui tags que não têm valor preenchido
      return !valoresTags[tagKey];
  });

  return (
    <LayoutPrincipal>
       <div className="flex items-center mb-6">
        <Button 
            onClick={() => { window.location.href = '/contratos';  }} 
            variant="link" 
            type="button"
            className="text-muted-foreground hover:text-primary flex items-center mr-4 p-0 h-auto"
        >
            <ChevronLeft className="w-5 h-5" />
            Voltar
        </Button>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileSignature className="w-6 h-6 mr-2" /> {isEditing ? 'Editar Contrato' : 'Preencher Contrato'}: {modelo.titulo}
        </h1>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <Button 
              onClick={handlePreview} 
              variant="outline"
              className="flex-1 h-12"
              disabled={!modelo || !clienteSelecionadoId}
          >
              <Eye className="mr-2 h-4 w-4" />
              Pré-visualizar Documento
          </Button>
          <Button 
              onClick={() => handleSalvarContrato('pendente_assinatura')} 
              className="flex-1 h-12"
              disabled={isSubmitting || !clienteSelecionadoId || valorTotal <= 0}
          >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSignature className="mr-2 h-4 w-4" />}
              Gerar e Enviar para Assinatura
          </Button>
      </div>
      
      {/* AJUSTE CRÍTICO AQUI: lg:grid-cols-[35%_65%] para dar mais espaço à prévia */}
      <div className="grid grid-cols-1 lg:grid-cols-[35%_65%] gap-6">
        
        {/* Coluna 1: Dados e Financeiro */}
        <Card className="lg:col-span-1 h-fit">
            <CardHeader><CardTitle className="text-xl">Dados e Faturamento</CardTitle></CardHeader>
            <CardContent className="space-y-6">
                
                {isAdmin && (
                    <div className="space-y-2">
                        <Label htmlFor="empresa-contrato">Empresa Contratante</Label>
                        <Select 
                            value={proprietarioContratoId || ''} 
                            onValueChange={setProprietarioContratoId}
                        >
                            <SelectTrigger id="empresa-contrato">
                                <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                                <SelectValue placeholder="Selecione a Empresa" />
                            </SelectTrigger>
                            <SelectContent>
                                {empresasContrato.map((e: EmpresaContrato) => (
                                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
                
                <div className="space-y-2">
                    <Label htmlFor="titulo-documento">Título do Contrato</Label>
                    <Input 
                        id="titulo-documento"
                        value={tituloDocumento}
                        onChange={(e) => setTituloDocumento(e.target.value)}
                        placeholder={modelo.titulo}
                    />
                </div>
                
                <div className="space-y-2">
                    <Label htmlFor="cliente">Cliente (Contratado)</Label>
                    <Select value={clienteSelecionadoId} onValueChange={setClienteSelecionadoId} disabled={!proprietarioContratoId}>
                        <SelectTrigger id="cliente">
                            <SelectValue placeholder="Selecione o Cliente" />
                        </SelectTrigger>
                        <SelectContent>
                            {clientesCR.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                
                <div className="space-y-4 pt-4 border-t">
                    <h3 className="font-semibold text-lg">Detalhes Financeiros</h3>
                    <div className="space-y-2">
                        <Label htmlFor="valor-total">Valor Total do Contrato (R$)</Label>
                        <Input 
                            id="valor-total"
                            type="number"
                            step="0.01"
                            value={valorTotal}
                            onChange={(e) => setValorTotal(parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                        />
                    </div>
                    
                    <div className="space-y-2">
                        <Label>Tipo de Lançamento</Label>
                        <RadioGroup value={tipoLancamento} onValueChange={(v: TipoLancamento) => setTipoLancamento(v)} className="flex space-x-4">
                            <div className="flex items-center space-x-2"><RadioGroupItem value="unico" id="unico" /><Label htmlFor="unico">Único</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="parcelar" id="parcelar" /><Label htmlFor="parcelar">Parcelar</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="repetir" id="repetir" /><Label htmlFor="repetir">Repetir</Label></div>
                        </RadioGroup>
                    </div>
                    
                    {tipoLancamento === 'unico' && (
                        <div className="space-y-2">
                            <Label>Data de Vencimento</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !dataVencimentoUnico && "text-muted-foreground")}>
                                        {dataVencimentoUnico ? formatDate(dataVencimentoUnico) : <span>Selecione a data</span>}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={dataVencimentoUnico} onSelect={setDataVencimentoUnico} initialFocus />
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}
                    
                    {tipoLancamento !== 'unico' && (
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Nº Parcelas</Label>
                                <Input type="number" value={numeroParcelas} onChange={(e) => setNumeroParcelas(parseInt(e.target.value) || 1)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Intervalo (dias)</Label>
                                <Input type="number" value={intervaloDias} onChange={(e) => setIntervaloDias(parseInt(e.target.value) || 30)} />
                            </div>
                            <div className="space-y-2">
                                <Label>1º Vencimento</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !dataPrimeiroVencimento && "text-muted-foreground")}>
                                            {dataPrimeiroVencimento ? formatDate(dataPrimeiroVencimento) : <span>Data</span>}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar mode="single" selected={dataPrimeiroVencimento} onSelect={setDataPrimeiroVencimento} initialFocus />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="space-y-4 pt-4 border-t">
                    <h3 className="font-semibold text-lg">Tags Manuais</h3>
                    <p className="text-sm text-muted-foreground">Preencha as tags que não foram preenchidas automaticamente.</p>
                    
                    {tagsParaPreenchimentoManual.length === 0 ? (
                        <p className="text-muted-foreground text-sm">Nenhuma tag manual pendente.</p>
                    ) : (
                        tagsParaPreenchimentoManual.map(tagKey => (
                            <div key={tagKey} className="space-y-1">
                                <Label htmlFor={tagKey} className="font-semibold">{tagKey}</Label>
                                <Input 
                                    id={tagKey}
                                    value={valoresTags[tagKey] || ''}
                                    onChange={(e) => handleTagChange(tagKey, e.target.value)}
                                    placeholder={`Insira o valor para ${tagKey}`}
                                />
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
        
        {/* Coluna 2: Template e Ações */}
        <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl">Prévia do Template</CardTitle>
                <div className="flex space-x-2">
                    <Button 
                        onClick={handlePreview} 
                        variant="outline" 
                        size="sm"
                        disabled={!modelo || !clienteSelecionadoId}
                    >
                        <Eye className="mr-2 h-4 w-4" />
                        Pré-visualizar
                    </Button>
                    <Button 
                        onClick={() => handleSalvarContrato('rascunho')} 
                        variant="secondary" 
                        size="sm"
                        disabled={isSubmitting || !clienteSelecionadoId}
                    >
                        <Save className="mr-2 h-4 w-4" />
                        Salvar Rascunho
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="border rounded-md p-4 bg-secondary/50 max-h-[400px] overflow-y-auto">
                    {modelo?.conteudo_template ? (
                        <div dangerouslySetInnerHTML={{ __html: renderizarConteudo(modelo.conteudo_template, valoresTags) }} />
                    ) : (
                        <p className="text-muted-foreground">Selecione um modelo e um cliente para ver a prévia.</p>
                    )}
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t">
                    <Button 
                        onClick={() => handleSalvarContrato('pendente_assinatura')} 
                        className="flex-1 h-12"
                        disabled={isSubmitting || !clienteSelecionadoId || valorTotal <= 0}
                    >
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSignature className="mr-2 h-4 w-4" />}
                        Gerar e Enviar para Assinatura
                    </Button>
                </div>
            </CardContent>
        </Card>
        
      </div>
      
      <ContratoPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        conteudoHtml={conteudoPreview}
        titulo={previewTitle}
        isHtml={tipoConteudo === 'html'}
      />
    </LayoutPrincipal>
  );
};

export default PreencherContrato;