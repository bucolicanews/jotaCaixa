import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileSignature, ChevronLeft, Save, CalendarIcon, Eye, Building2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo, ContratoTag, ContratoGerado } from '@/types/contratos';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClienteProfile, AdminProfile, UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, addDays, parseISO } from 'date-fns';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import ContratoPreviewDialog from '@/components/contratos/ContratoPreviewDialog';
import { useSessao } from '@/hooks/use-sessao';
import { Separator } from '@/components/ui/separator';
import { ptBR } from 'date-fns/locale';
import { useContabilConfig } from '@/hooks/use-contabil-config'; // NOVO HOOK
import { useCapitalSocial } from '@/hooks/use-capital-social'; // NOVO HOOK
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { v4 as uuidv4 } from 'uuid';

type TipoLancamento = 'unico' | 'repetir' | 'parcelar';

const PreencherContrato: React.FC = () => {
  const { modeloId } = useParams<{ modeloId: string }>();
  const [searchParams] = useSearchParams();
  const contratoId = searchParams.get('contratoId');
  const navigate = useNavigate();
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  const { configMap } = useContabilConfig(); // NOVO HOOK
  const { temCapitalSocial, carregando: carregandoCapital } = useCapitalSocial(); // NOVO HOOK
  
  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente'; 

  const [modelo, setModelo] = useState<ContratoModelo | null>(null);
  const [clientesCR, setClientesCR] = useState<any[]>([]);
  const [tagsCustomizadas, setTagsCustomizadas] = useState<ContratoTag[]>([]);
  const [valoresTags, setValoresTags] = useState<Record<string, string>>({}); // MANTIDO COMO ESTADO LOCAL
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  
  // Estados do Formulário
  const [clienteSelecionadoId, setClienteSelecionadoId, ] = useState<string>('');
  const [valorTotal, setValorTotal] = useState<number>(0); 
  const [tituloDocumento, setTituloDocumento] = useState('');
  const [proprietarioContratoId, setProprietarioContratoId] = useState<string | null>(null); 
  const [empresasContrato, setEmpresasContrato] = useState<any[]>([]);
  const [tipoLancamento, setTipoLancamento] = useState<TipoLancamento>('unico');
  const [dataVencimentoUnico, setDataVencimentoUnico] = useState<Date | undefined>(new Date());
  const [numeroParcelas, setNumeroParcelas] = useState<number>(1);
  const [dataPrimeiroVencimento, setDataPrimeiroVencimento] = useState<Date | undefined>(new Date());
  const [intervaloDias, setIntervaloDias] = useState<number>(30);
  const [contratoInicial, setContratoInicial] = useState<ContratoGerado | null>(null); // NOVO ESTADO PARA EDIÇÃO

  const isEditing = !!contratoId;

  const ownerIdLogado = useMemo(() => {
    if (carregandoSessao) return null;
    if (isAdmin) return usuario?.id || null;
    if (isCliente) return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as any)?.admin_id || (perfil as any)?.cliente_id || null;
    return null;
  }, [carregandoSessao, isAdmin, isCliente, role, usuario, perfil]);

  // Função auxiliar de formatação de moeda
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const fetchDependentData = useCallback(async (targetId: string) => {
    if (!targetId || !ownerIdLogado) return;

    // 1. Busca Tags
    const { data: tagsData } = await supabase
      .from('contrato_tags')
      .select('*')
      .eq('empresa_id', targetId);
      
    if (tagsData) setTagsCustomizadas(tagsData);

    // 2. Busca Clientes: Lógica de roteamento estrita
    const combinedClientsMap = new Map<string, any>();
    
    // Se o proprietário do contrato for o Admin logado (ou Sub-Admin)
    if (isAdmin && targetId === ownerIdLogado) {
        // 2.1. Busca clientes do sistema (tbl_clientes) que o Admin gerencia
        const { data: dataSistema } = await supabase
            .from('tbl_clientes')
            .select('id, nome, razao_social, nome_fantasia, documento, email, telefone, cep, endereco, numero, complemento, bairro, cidade, estado, cpf, cnpj, rg')
            .eq('admin_id', targetId)
            .eq('aprovado', true)
            .neq('id', targetId) // Exclui o próprio Admin se ele estiver na tbl_clientes
            .order('nome');
        
        (dataSistema || []).forEach(c => {
            combinedClientsMap.set(c.id, { ...c, proprietario_id: targetId });
        });
        
        // 2.2. Busca clientes CR (clientes) que o Admin criou
        const { data: dataCR } = await supabase
            .from('clientes')
            .select('id, nome, razao_social, nome_fantasia, documento, email, telefone, telefone_fixo, cep, endereco, numero, complemento, bairro, cidade, estado, cpf, cnpj, rg, data_nascimento')
            .eq('proprietario_id', targetId)
            .order('nome');
            
        (dataCR || []).forEach(c => {
            if (!combinedClientsMap.has(c.id)) { // Prioriza tbl_clientes
                combinedClientsMap.set(c.id, { ...c, proprietario_id: targetId });
            }
        });
        
    } else {
        // Se o proprietário do contrato for um Cliente (ou Usuário de Cliente), busca apenas da tabela 'clientes'
        const { data: dataCR } = await supabase
            .from('clientes')
            .select('id, nome, razao_social, nome_fantasia, documento, email, telefone, telefone_fixo, cep, endereco, numero, complemento, bairro, cidade, estado, cpf, cnpj, rg, data_nascimento')
            .eq('proprietario_id', targetId)
            .order('nome');
            
        (dataCR || []).forEach(c => {
            combinedClientsMap.set(c.id, { ...c, proprietario_id: targetId });
        });
    }
        
    setClientesCR(Array.from(combinedClientsMap.values()));
    
  }, [isAdmin, ownerIdLogado]);

  const buscarDados = useCallback(async () => {
    setCarregandoDados(true);
    
    // 1. Carregar Modelo
    if (modeloId) {
      const { data } = await supabase.from('contrato_modelos').select('*').eq('id', modeloId).single();
      if (data) {
        setModelo(data);
        setTituloDocumento(data.titulo);
      }
    }
    
    // 2. Carregar Empresas (Se Admin)
    if (isAdmin && ownerIdLogado) {
      const { data } = await supabase.from('tbl_clientes').select('id, nome').eq('admin_id', ownerIdLogado).eq('aprovado', true);
      const options = [{ id: ownerIdLogado, nome: 'Meus Contratos' }, ...(data || [])];
      setEmpresasContrato(options);
    }
    
    // Define o proprietário inicial como o usuário logado
    let currentProprietarioId = ownerIdLogado;
    setProprietarioContratoId(currentProprietarioId);
    
    // 3. SE FOR EDIÇÃO: Carregar dados do contrato existente
    if (contratoId) {
        const { data: contratoExistente, error: contratoError } = await supabase
            .from('contratos_gerados')
            .select('*')
            .eq('id', contratoId)
            .single();
            
        if (contratoError) {
            showError('Erro ao carregar contrato para edição: ' + contratoError.message);
        } else if (contratoExistente) {
            setContratoInicial(contratoExistente); // SALVA O CONTRATO INICIAL
            
            // Preenche os estados com os dados do banco
            setClienteSelecionadoId(contratoExistente.cliente_id);
            setProprietarioContratoId(contratoExistente.proprietario_id);
            currentProprietarioId = contratoExistente.proprietario_id; // Atualiza para buscar dados dependentes corretos
            
            setValorTotal(contratoExistente.valor_total || 0);
            setNumeroParcelas(contratoExistente.numero_parcelas || 1);
            
            // Tenta inferir o tipo de lançamento
            if ((contratoExistente.numero_parcelas || 1) > 1) {
                setTipoLancamento('parcelar'); // Assumindo parcelar como padrão para > 1
            } else {
                setTipoLancamento('unico');
            }
            
            if (contratoExistente.data_inicio) {
                const dataInicio = parseISO(contratoExistente.data_inicio);
                setDataVencimentoUnico(dataInicio);
                setDataPrimeiroVencimento(dataInicio);
            }
            
            if (contratoExistente.valores_tags_preenchidos) {
                // ATUALIZA O ESTADO DE VALORES TAGS
                setValoresTags(contratoExistente.valores_tags_preenchidos as Record<string, string>);
                // Se o título estiver salvo nas tags, usa ele
                if ((contratoExistente.valores_tags_preenchidos as any)['titulo']) {
                    setTituloDocumento((contratoExistente.valores_tags_preenchidos as any)['titulo']);
                }
            }
        }
    }
    
    // Carrega dados dependentes (clientes, tags) usando o proprietário correto
    if (currentProprietarioId) {
        await fetchDependentData(currentProprietarioId);
    }
    
    setCarregandoDados(false);
  }, [modeloId, ownerIdLogado, isAdmin, fetchDependentData, contratoId]);

  // Carregamento inicial
  useEffect(() => {
    if (!carregandoSessao && ownerIdLogado) buscarDados();
  }, [carregandoSessao, ownerIdLogado, buscarDados]);

  // Se o proprietário mudar manualmente (no select do Admin), recarrega clientes
  // Adicionamos uma verificação para não recarregar se já estiver carregando (evita loop na inicialização)
  useEffect(() => {
      if (proprietarioContratoId && !carregandoDados) {
          fetchDependentData(proprietarioContratoId);
      }
  }, [proprietarioContratoId, fetchDependentData, carregandoDados]);

  // Dados da Empresa (Contratante) para preenchimento de tags
  const empresaLogadaData = useMemo(() => {
    if (!perfil) return null;
    
    const p = perfil as ClienteProfile | AdminProfile | UsuarioProfile | AdminUsuarioProfile;
    const safeGet = (obj: any, key: string) => obj && obj[key] ? obj[key] : '';
    
    return {
        nome: safeGet(p, 'nome') || safeGet(p, 'razao_social'),
        documento: safeGet(p, 'documento') || safeGet(p, 'cnpj') || safeGet(p, 'cpf'),
        email: safeGet(p, 'email'),
        telefone: safeGet(p, 'telefone'),
        cep: safeGet(p, 'cep'),
        endereco: safeGet(p, 'endereco'),
        numero: safeGet(p, 'numero'),
        complemento: safeGet(p, 'complemento'),
        bairro: safeGet(p, 'bairro'),
        cidade: safeGet(p, 'cidade'),
        estado: safeGet(p, 'estado'),
        cnpj: safeGet(p, 'cnpj'),
        cpf: safeGet(p, 'cpf'),
        rg: safeGet(p, 'rg'),
    };
  }, [perfil]);

  // --- LÓGICA DE PREENCHIMENTO AUTOMÁTICO DAS TAGS ---
  useEffect(() => {
      // Se estiver editando e os dados acabaram de carregar, não sobrescreve imediatamente
      // a menos que o usuário mude algo. Porém, para garantir reatividade, mesclamos.
      
      const newTags: Record<string, string> = { ...valoresTags };
      
      // 1. Dados do Cliente Selecionado
      const cliente = clientesCR.find(c => c.id === clienteSelecionadoId);
      
      if (cliente) {
          newTags['{{CLIENTE_NOME}}'] = cliente.nome || '';
          newTags['{{CLIENTE_RAZAO_SOCIAL}}'] = cliente.razao_social || cliente.nome || '';
          newTags['{{CLIENTE_NOME_FANTASIA}}'] = cliente.nome_fantasia || '';
          newTags['{{CLIENTE_DOCUMENTO}}'] = cliente.documento || cliente.cpf || cliente.cnpj || '';
          newTags['{{CLIENTE_CPF}}'] = cliente.cpf || '';
          newTags['{{CLIENTE_CNPJ}}'] = cliente.cnpj || '';
          newTags['{{CLIENTE_RG}}'] = cliente.rg || '';
          newTags['{{CLIENTE_EMAIL}}'] = cliente.email || '';
          newTags['{{CLIENTE_TELEFONE}}'] = cliente.telefone || '';
          newTags['{{CLIENTE_TELEFONE_FIXO}}'] = cliente.telefone_fixo || '';
          newTags['{{CLIENTE_CEP}}'] = cliente.cep || '';
          newTags['{{CLIENTE_ENDERECO}}'] = cliente.endereco || '';
          newTags['{{CLIENTE_NUMERO}}'] = cliente.numero || '';
          newTags['{{CLIENTE_COMPLEMENTO}}'] = cliente.complemento || '';
          newTags['{{CLIENTE_BAIRRO}}'] = cliente.bairro || '';
          newTags['{{CLIENTE_CIDADE}}'] = cliente.cidade || '';
          newTags['{{CLIENTE_ESTADO}}'] = cliente.estado || '';
          newTags['{{CLIENTE_DATA_NASCIMENTO}}'] = cliente.data_nascimento ? format(parseISO(cliente.data_nascimento), 'dd/MM/yyyy') : '';
      }

      // 2. Dados da Empresa
      if (empresaLogadaData) {
          newTags['{{EMPRESA_NOME}}'] = empresaLogadaData.nome || '';
          newTags['{{EMPRESA_DOCUMENTO}}'] = empresaLogadaData.documento || '';
          newTags['{{EMPRESA_EMAIL}}'] = empresaLogadaData.email || '';
          newTags['{{EMPRESA_TELEFONE}}'] = empresaLogadaData.telefone || '';
          newTags['{{EMPRESA_CEP}}'] = empresaLogadaData.cep || '';
          newTags['{{EMPRESA_ENDERECO}}'] = empresaLogadaData.endereco || '';
          newTags['{{EMPRESA_NUMERO}}'] = empresaLogadaData.numero || '';
          newTags['{{EMPRESA_COMPLEMENTO}}'] = empresaLogadaData.complemento || '';
          newTags['{{EMPRESA_BAIRRO}}'] = empresaLogadaData.bairro || '';
          newTags['{{EMPRESA_CIDADE}}'] = empresaLogadaData.cidade || '';
          newTags['{{EMPRESA_ESTADO}}'] = empresaLogadaData.estado || '';
          newTags['{{EMPRESA_CNPJ}}'] = empresaLogadaData.cnpj || '';
          newTags['{{EMPRESA_CPF}}'] = empresaLogadaData.cpf || '';
      }

      // 3. Dados Financeiros
      let valorFinalContrato = 0;
      let valorParcelaFinal = 0;
      let dataPrimeiroVenc = '';

      if (tipoLancamento === 'unico') {
          valorFinalContrato = valorTotal;
          valorParcelaFinal = valorTotal;
          dataPrimeiroVenc = dataVencimentoUnico ? format(dataVencimentoUnico, 'dd/MM/yyyy') : '';
      } else if (tipoLancamento === 'parcelar') {
          valorFinalContrato = valorTotal;
          valorParcelaFinal = numeroParcelas > 0 ? valorTotal / numeroParcelas : 0;
          dataPrimeiroVenc = dataPrimeiroVencimento ? format(dataPrimeiroVencimento, 'dd/MM/yyyy') : '';
      } else if (tipoLancamento === 'repetir') {
          valorFinalContrato = valorTotal * numeroParcelas;
          valorParcelaFinal = valorTotal;
          dataPrimeiroVenc = dataPrimeiroVencimento ? format(dataPrimeiroVencimento, 'dd/MM/yyyy') : '';
      }

      newTags['{{VALOR_TOTAL_CONTRATO}}'] = formatCurrency(valorFinalContrato);
      newTags['{{VALOR_PARCELA}}'] = formatCurrency(valorParcelaFinal);
      newTags['{{NUMERO_PARCELAS}}'] = numeroParcelas.toString();
      newTags['{{PRIMEIRO_VENCIMENTO}}'] = dataPrimeiroVenc;
      newTags['{{DATA_EMISSAO}}'] = format(new Date(), 'dd/MM/yyyy');
      
      setValoresTags(newTags);

  }, [
      clienteSelecionadoId, 
      clientesCR, 
      empresaLogadaData, 
      valorTotal, 
      tipoLancamento, 
      numeroParcelas, 
      dataVencimentoUnico, 
      dataPrimeiroVencimento,
      valoresTags, // Adicionado para garantir que tags manuais sejam mantidas
  ]);

  // Filtro para mostrar tags manuais na UI
  const manualTagsKeys = useMemo(() => {
    const combined = [...TAGS_PADRAO, ...tagsCustomizadas];
    return combined
        .filter(tag => 
            !tag.nome_tag.startsWith('{{CLIENTE_') && 
            !tag.nome_tag.startsWith('{{EMPRESA_') &&
            !['{{VALOR_TOTAL_CONTRATO}}', '{{VALOR_PARCELA}}', '{{NUMERO_PARCELAS}}', '{{PRIMEIRO_VENCIMENTO}}', '{{DATA_EMISSAO}}'].includes(tag.nome_tag)
        )
        .map(t => t.nome_tag);
  }, [tagsCustomizadas]);

  const renderConteudo = useCallback(() => {
    let html = modelo?.conteudo_template || '';
    Object.keys(valoresTags).forEach(tag => {
      const regex = new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      html = html.replace(regex, valoresTags[tag] || '');
    });
    return html;
  }, [modelo, valoresTags]);
  
  // 🚨 FUNÇÃO handlePreview DEFINIDA AQUI
  const handlePreview = () => {
      if (!modelo) return;
      
      const conteudoRenderizado = renderConteudo();
      
      setConteudoPreview(conteudoRenderizado);
      setPreviewTitle(tituloDocumento || modelo.titulo);
      setPreviewOpen(true);
  };
  // 🚨 FUNÇÃO handlePreview DEFINIDA AQUI

  const handleTagChange = (tag: string, value: string) => {
    setValoresTags(prev => ({ ...prev, [tag]: value }));
  };
  
  // 🚨 FUNÇÃO handleSalvarContrato DEFINIDA AQUI
  const handleSalvarContrato = async (status: ContratoGerado['status']) => {
    if (!modelo || !clienteSelecionadoId || !proprietarioContratoId || !tituloDocumento || valorTotal <= 0 || !temCapitalSocial) {
        showError('Preencha todos os campos obrigatórios (Título, Cliente, Valor) e registre o Capital Social.');
        return;
    }
    
    setIsSubmitting(true);
    
    // Determina as tabelas corretas
    const isProprietarioAdmin = proprietarioContratoId === ownerIdLogado && isAdmin;
    const tabelaContasReceber = isProprietarioAdmin ? 'admin_contas_receber' : 'contas_receber';
    const tabelaParcelasReceber = isProprietarioAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
    const ownerKey = isProprietarioAdmin ? 'admin_id' : 'empresa_id';
    
    // 1. Buscar Configurações Contábeis
    const { data: configCRData } = await supabase
        .from('configuracao_contratos')
        .select('id_conta_clientes_receber, id_conta_receita_contrato')
        .eq('proprietario_id', proprietarioContratoId)
        .single();
        
    const contaPatrimonialId = configCRData?.id_conta_clientes_receber || null;
    const contaReceitaId = configCRData?.id_conta_receita_contrato || null;
    
    const { data: configParcelaData } = await supabase
        .from('configuracao_contas_receber')
        .select('conta_contabil_id')
        .eq('proprietario_id', proprietarioContratoId)
        .eq('tipo_registro', 'parcela')
        .single();
        
    const contaParcelaId = configParcelaData?.conta_contabil_id || null;
    
    const temConfigContabil = contaPatrimonialId && contaReceitaId && contaParcelaId;
    
    // 2. Calcular Parcelas
    let valorFinalContrato = 0;
    let valorParcela = 0;
    let numParcelas = 0;
    let dataInicioContrato: Date;
    let parcelasParaInserir = [];

    if (tipoLancamento === 'unico') {
        valorFinalContrato = valorTotal;
        valorParcela = valorTotal;
        numParcelas = 1;
        dataInicioContrato = dataVencimentoUnico!;
        parcelasParaInserir.push({ numero_parcela: 1, valor_parcela: valorParcela, data_vencimento: format(dataInicioContrato, 'yyyy-MM-dd'), status: 'aberta' });
    } else {
        numParcelas = numeroParcelas;
        valorParcela = tipoLancamento === 'parcelar' ? valorTotal / numParcelas : valorTotal;
        valorFinalContrato = tipoLancamento === 'parcelar' ? valorTotal : valorTotal * numParcelas;
        dataInicioContrato = dataPrimeiroVencimento!;
        
        for (let i = 0; i < numParcelas; i++) {
            parcelasParaInserir.push({ 
                numero_parcela: i + 1, 
                valor_parcela: valorParcela, 
                data_vencimento: format(addDays(dataInicioContrato, i * intervaloDias), 'yyyy-MM-dd'), 
                status: 'aberta' 
            });
        }
    }
    
    // 3. Renderizar Conteúdo Final
    const conteudoRenderizado = renderConteudo();
    
    // 4. Preparar dados do Contrato Gerado
    const contratoPayload = {
        modelo_id: modelo.id,
        cliente_id: clienteSelecionadoId,
        proprietario_id: proprietarioContratoId,
        status: status,
        valor_total: valorFinalContrato,
        data_inicio: format(dataInicioContrato, 'yyyy-MM-dd'),
        numero_parcelas: numParcelas,
        dia_vencimento_parcela: dataInicioContrato.getDate(),
        valores_tags_preenchidos: { 
            ...valoresTags, 
            titulo: tituloDocumento, 
            tipo_conteudo: 'html', // Força HTML
        },
        conteudo_renderizado: conteudoRenderizado,
        link_assinatura_externo: `${window.location.origin}/contrato-link/${contratoId || uuidv4()}`,
        // Assinatura do Proprietário (Admin/Cliente)
        assinatura_proprietario_nome: (perfil as any)?.assinatura_proprietario_nome || (perfil as any)?.nome,
        assinatura_proprietario_url: (perfil as any)?.assinatura_proprietario_url || (perfil as any)?.logo_url,
    };
    
    let newContratoId = contratoId;
    let contaReceberId: string | null = null;
    
    try {
        // 5. Inserir/Atualizar Contrato
        if (isEditing && contratoInicial) {
            // Se for edição, deletamos as parcelas e lançamentos antigos antes de atualizar
            
            // 5.1. Buscar conta a receber antiga
            const { data: oldContaSintetica } = await supabase
                .from(tabelaContasReceber)
                .select('id, descricao')
                .eq('contrato_gerado_id', contratoInicial.id)
                .single();
                
            if (oldContaSintetica) {
                // 5.2. Deletar parcelas antigas (CASCADE deve funcionar)
                await supabase.from(tabelaParcelasReceber).delete().eq('conta_receber_id', oldContaSintetica.id);
                
                // 5.3. Deletar lançamentos contábeis antigos (usando a descrição da conta sintética original)
                const oldLaunchDescriptionPrefix = `Lançamento Inicial CR: Contrato: ${oldContaSintetica.descricao} (CR ID: ${oldContaSintetica.id.substring(0, 8)})`;
                const oldReceitaDescriptionPrefix = `Receita: Contrato: ${oldContaSintetica.descricao} (CR ID: ${oldContaSintetica.id.substring(0, 8)})`;
                
                await supabase.from('lancamentos')
                    .delete()
                    .eq('origem', 'lancamento_cr')
                    .eq('proprietario_id', proprietarioContratoId)
                    .or(`descricao.ilike.${oldLaunchDescriptionPrefix}%,descricao.ilike.${oldReceitaDescriptionPrefix}%`);
                    
                // 5.4. Deletar a conta sintética antiga
                await supabase.from(tabelaContasReceber).delete().eq('id', oldContaSintetica.id);
            }
            
            // 5.5. Atualizar o contrato
            const { data, error } = await supabase.from('contratos_gerados').update(contratoPayload).eq('id', contratoInicial.id).select('id').single();
            if (error) throw error;
            newContratoId = data.id;
            
        } else {
            // 5.1. Inserir novo contrato
            const { data, error } = await supabase.from('contratos_gerados').insert(contratoPayload).select('id').single();
            if (error) throw error;
            newContratoId = data.id;
        }
        
        // 6. Criar Conta Sintética (Contas a Receber)
        const contaReceberPayload = {
            [ownerKey]: proprietarioContratoId,
            cliente_id: clienteSelecionadoId,
            descricao: `Contrato: ${tituloDocumento}`,
            valor_total: valorFinalContrato,
            data_emissao: format(new Date(), 'yyyy-MM-dd'),
            data_vencimento: parcelasParaInserir[0].data_vencimento,
            tipo_receita: tipoLancamento === 'unico' ? 'única' : 'recorrente',
            status: 'aberta',
            origem: 'contrato',
            contrato_gerado_id: newContratoId,
            historico_id: null, // Pode ser adicionado depois
            id_conta_patrimonial: contaPatrimonialId,
            id_conta_resultado: contaReceitaId,
        };
        
        const { data: newContaSintetica, error: sinteticaError } = await supabase
            .from(tabelaContasReceber)
            .insert(contaReceberPayload)
            .select('id')
            .single();
            
        if (sinteticaError) throw sinteticaError;
        contaReceberId = newContaSintetica.id;
        
        // 7. Inserir Parcelas
        const parcelasComId = parcelasParaInserir.map(p => ({ 
            ...p, 
            conta_receber_id: contaReceberId, 
            [ownerKey]: proprietarioContratoId,
            ...(temConfigContabil && { id_conta_contabil: contaParcelaId })
        }));
        
        const { error: parcelError } = await supabase.from(tabelaParcelasReceber).insert(parcelasComId);
        if (parcelError) throw parcelError;
        
        // 8. Lançamentos Contábeis (Partidas Dobradas)
        if (temConfigContabil) {
            const dataMovimentacao = format(new Date(), 'yyyy-MM-dd') + 'T12:00:00Z';
            const contaReceberIdShort = contaReceberId.substring(0, 8);
            
            const idPatrimonial = uuidv4();
            const idReceita = uuidv4();
            
            // Lançamento 1: DÉBITO (Ativo) - Aumenta o direito a receber
            const lancamentoPatrimonialPayload = {
                id: idPatrimonial,
                proprietario_id: proprietarioContratoId,
                data_movimentacao: dataMovimentacao,
                descricao: `Lançamento Inicial CR: Contrato: ${tituloDocumento} (CR ID: ${contaReceberIdShort})`,
                valor: valorFinalContrato,
                tipo: 'Entrada' as const, // Entrada no Ativo (Débito)
                conta_bancaria_id: null,
                conta_contabil_id: contaPatrimonialId,
                origem: 'lancamento_cr',
                historico_id: null,
                conta_resultado_id: idReceita, // REFERÊNCIA CRUZADA
            };
            
            // Lançamento 2: CRÉDITO (Resultado) - Aumenta a Receita (DRE)
            const lancamentoReceitaPayload = {
                id: idReceita,
                proprietario_id: proprietarioContratoId,
                data_movimentacao: dataMovimentacao,
                descricao: `Receita: Contrato: ${tituloDocumento} (CR ID: ${contaReceberIdShort})`,
                valor: valorFinalContrato,
                tipo: 'Saida' as const, // Saída (Crédito) na Receita
                conta_bancaria_id: null,
                conta_contabil_id: contaReceitaId,
                origem: 'lancamento_cr',
                historico_id: null,
                conta_resultado_id: idPatrimonial, // REFERÊNCIA CRUZADA
            };
            
            const { error: lancamentoError } = await supabase.from('lancamentos').insert([lancamentoPatrimonialPayload, lancamentoReceitaPayload]);
            if (lancamentoError) throw lancamentoError;
        }
        
        // 9. Redireciona para a página de contratos
        navigate('/contratos');
        
    } catch (error: any) {
        console.error('Erro ao salvar contrato:', error);
        showError('Falha ao salvar contrato: ' + error.message);
    } finally {
        setIsSubmitting(false);
    }
  };
  // 🚨 FUNÇÃO handleSalvarContrato DEFINIDA AQUI

  if (carregandoSessao || carregandoDados || carregandoCapital) {
    return <LayoutPrincipal><div className="flex justify-center p-20"><Loader2 className="animate-spin" /></div></LayoutPrincipal>;
  }
  
  if (!modelo) {
      return <LayoutPrincipal><Card><CardHeader><CardTitle>Erro</CardTitle></CardHeader><CardContent><p>Modelo de documento não encontrado.</p></CardContent></Card></LayoutPrincipal>;
  }
  
  const templateContent = valoresTags['{{CONTEUDO_PRINCIPAL}}'] || modelo.conteudo_template;

  return (
    <LayoutPrincipal>
       <div className="flex items-center mb-6 w-full">
        <Button 
            onClick={() => navigate('/documentos-societarios')} 
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
      
      {/* Alerta de Capital Social */}
      {!temCapitalSocial && (
          <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Lançamento Inicial Obrigatório</AlertTitle>
              <AlertDescription>
                  É necessário fazer o lançamento inicial do Capital Social antes de gerar contratos que criam Contas a Receber. Salve como rascunho ou complete o lançamento em <Link to="/lancamentos" className="underline">Lançamentos</Link>.
              </AlertDescription>
          </Alert>
      )}
      
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <Button 
              onClick={handlePreview} 
              variant="outline"
              className="flex-1 h-12"
              disabled={!modelo || !clienteSelecionadoId}
          >
              <Eye className="mr-2 h-4 w-4" />
              Pré-visualizar Contrato
          </Button>
          <Button 
              onClick={() => handleSalvarContrato('pendente_assinatura')} 
              className="flex-1 h-12"
              disabled={isSubmitting || !clienteSelecionadoId}
          >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEditing ? 'Salvar Alterações' : 'Gerar para Assinatura'}
          </Button>
      </div>
      
      <Card>
        <CardHeader><CardTitle className="text-xl">1. Dados Essenciais</CardTitle></CardHeader>
        <CardContent className="space-y-6">
            
            {isAdmin && (
                <div className="space-y-2">
                    <Label htmlFor="empresa-contratante">Empresa Contratante (Proprietária do Contrato)</Label>
                    <Select 
                        value={proprietarioContratoId || ''} 
                        onValueChange={setProprietarioContratoId}
                    >
                        <SelectTrigger id="empresa-contratante">
                            <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                            <SelectValue placeholder="Selecione a Empresa" />
                        </SelectTrigger>
                        <SelectContent>
                            {empresasContrato.map((e: any) => (
                                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="titulo-documento">Título do Contrato</Label>
                    <Input 
                        id="titulo-documento"
                        placeholder={modelo.titulo}
                        value={tituloDocumento}
                        onChange={(e) => setTituloDocumento(e.target.value)}
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
                                <SelectItem key={c.id} value={c.id}>
                                    {c.nome} {c.documento ? `(${c.documento})` : ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader><CardTitle className="text-xl">2. Detalhes Financeiros</CardTitle></CardHeader>
        <CardContent className="space-y-6">
            <div className="space-y-2">
                <Label>Tipo de Lançamento</Label>
                <RadioGroup 
                    value={tipoLancamento} 
                    onValueChange={(v: TipoLancamento) => setTipoLancamento(v)} 
                    className="flex space-x-4 pt-2"
                >
                    <div className="flex items-center space-x-2"><RadioGroupItem value="unico" id="unico" /><Label htmlFor="unico">Único</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="repetir" id="repetir" /><Label htmlFor="repetir">Repetir Valor</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="parcelar" id="parcelar" /><Label htmlFor="parcelar">Parcelar Valor</Label></div>
                </RadioGroup>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="valor-total">{tipoLancamento === 'parcelar' ? 'Valor Total a Parcelar' : 'Valor da Parcela'}</Label>
                    <Input 
                        id="valor-total"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={valorTotal}
                        onChange={(e) => setValorTotal(parseFloat(e.target.value) || 0)}
                    />
                </div>
                
                {tipoLancamento === 'unico' && (
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="data-vencimento">Data de Vencimento</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn("w-full pl-3 text-left font-normal", !dataVencimentoUnico && "text-muted-foreground")}
                                >
                                    {dataVencimentoUnico ? format(dataVencimentoUnico, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar mode="single" selected={dataVencimentoUnico} onSelect={setDataVencimentoUnico} initialFocus locale={ptBR} />
                            </PopoverContent>
                        </Popover>
                    </div>
                )}
                
                {tipoLancamento !== 'unico' && (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="num-parcelas">Nº de Parcelas</Label>
                            <Input 
                                id="num-parcelas"
                                type="number"
                                min={1}
                                placeholder="12"
                                value={numeroParcelas}
                                onChange={(e) => setNumeroParcelas(parseInt(e.target.value) || 1)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="intervalo-dias">Intervalo (dias)</Label>
                            <Input 
                                id="intervalo-dias"
                                type="number"
                                min={1}
                                placeholder="30"
                                value={intervaloDias}
                                onChange={(e) => setIntervaloDias(parseInt(e.target.value) || 30)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="data-primeiro-vencimento">1º Vencimento</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn("w-full pl-3 text-left font-normal", !dataPrimeiroVencimento && "text-muted-foreground")}
                                    >
                                        {dataPrimeiroVencimento ? format(dataPrimeiroVencimento, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar mode="single" selected={dataPrimeiroVencimento} onSelect={setDataPrimeiroVencimento} initialFocus locale={ptBR} />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </>
                )}
            </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader><CardTitle className="text-xl">3. Conteúdo e Tags</CardTitle></CardHeader>
        <CardContent className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Tags Automáticas */}
                <div className="space-y-4">
                    <h3 className="font-semibold">Tags Automáticas (Perfil)</h3>
                    <div className="space-y-2 border rounded-md p-4 max-h-64 overflow-y-auto">
                        {Object.keys(valoresTags).filter(tag => tag.startsWith('{{CLIENTE_') || tag.startsWith('{{EMPRESA_')).map(tagKey => (
                            <div key={tagKey} className="text-sm">
                                <p className="font-mono text-xs font-semibold text-primary">{tagKey}</p>
                                <p className="text-muted-foreground">{valoresTags[tagKey] || 'N/A'}</p>
                            </div>
                        ))}
                    </div>
                </div>
                
                {/* Tags Manuais */}
                <div className="space-y-4">
                    <h3 className="font-semibold">Tags Manuais</h3>
                    <div className="space-y-2 border rounded-md p-4 max-h-64 overflow-y-auto">
                        {manualTagsKeys.map(tagKey => (
                            <div key={tagKey} className="space-y-1">
                                <Label htmlFor={tagKey} className="font-semibold text-sm">{tagKey}</Label>
                                <Input 
                                    id={tagKey}
                                    placeholder={`Insira o valor para ${tagKey}`}
                                    value={valoresTags[tagKey] || ''}
                                    onChange={(e) => handleTagChange(tagKey, e.target.value)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            
            <Separator />
            
            <div className="space-y-2">
                <Label>Conteúdo do Contrato (Template)</Label>
                <div className="border rounded-md p-4 bg-background shadow-inner max-h-[400px] overflow-y-auto">
                    {templateContent ? (
                        <div dangerouslySetInnerHTML={{ __html: renderConteudo() }} />
                    ) : (
                        <p className="text-muted-foreground">Selecione um modelo e um cliente para ver a prévia.</p>
                    )}
                </div>
            </div>
            
        </CardContent>
      </Card>
      
      <Button 
          onClick={() => handleSalvarContrato('rascunho')} 
          variant="secondary" 
          className="w-full"
          disabled={isSubmitting}
      >
          Salvar como Rascunho
      </Button>
      
      <ContratoPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        conteudoHtml={renderConteudo()}
        titulo={tituloDocumento || modelo?.titulo || 'Contrato'}
        isHtml={true}
      />
    </LayoutPrincipal>
  );
};

export default PreencherContrato;