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
import { useContabilConfig } from '@/hooks/use-contabil-config'; // NOVO IMPORT
import { useCapitalSocial } from '@/hooks/use-capital-social'; // NOVO IMPORT
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
  
  // Check if user is direct admin OR admin employee
  const isDirectAdmin = role === 'Admin';
  // Admin employee has role 'Usuario' but has admin_id in profile (from admin_usuarios table)
  const adminIdFromProfile = (perfil as any)?.admin_id ?? null;
  const isAdminUsuario = role === 'Usuario' && !!adminIdFromProfile;
  const isAdminOrEmployee = isDirectAdmin || isAdminUsuario;
  const isCliente = role === 'Cliente'; 

  const [modelo, setModelo] = useState<ContratoModelo | null>(null);
  const [clientesCR, setClientesCR] = useState<any[]>([]);
  const [tagsCustomizadas, setTagsCustomizadas] = useState<ContratoTag[]>([]);
  const [valoresTags, setValoresTags] = useState<Record<string, string>>({});
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
  const [dadosContratada, setDadosContratada] = useState<any>(null);

  const isEditing = !!contratoId;

    const [resolvedOwnerId, setResolvedOwnerId] = useState<string | null>(null);
  
        useEffect(() => {
  
          const resolveOwner = async () => {
  
              if (carregandoSessao || !usuario) return;
  
              // For direct admin: use their own ID
              if (isDirectAdmin) {
                  setResolvedOwnerId(usuario.id);
                  return;
              }
  
              // For admin employee (AdminUsuario): get admin_id from profile or lookup
              const adminIdFromProfile = (perfil as any)?.admin_id;
              if (adminIdFromProfile) {
                  setResolvedOwnerId(adminIdFromProfile);
                  return;
              }
  
      
  
              // If not on profile, try the lookup table. This should cover 'Cliente' users.
  
              const { data, error } = await supabase
  
                  .from('admin_user_lookup')
  
                  .select('admin_id')
  
                  .eq('user_id', usuario.id)
  
                  .single();
  
              
  
              if (data && !error) {
  
                  setResolvedOwnerId(data.admin_id);
  
                  return;
  
              }
  
      
  
              // If all else fails, show an error.
  
              showError('Não foi possível identificar a empresa contratada. Contate o suporte.');
  
              console.error('Could not resolve owner ID from profile or lookup table for user:', usuario.id);
  
          };
  
          resolveOwner();
  
        }, [carregandoSessao, usuario, isDirectAdmin, perfil]);  useEffect(() => {
    const fetchContratadaData = async () => {
        if (!proprietarioContratoId) {
            setDadosContratada(null);
            return;
        };

        const { data, error } = await supabase
            .from('tbl_admins')
            .select('*')
            .eq('id', proprietarioContratoId)
            .single();

        if (data && !error) {
            setDadosContratada(data);
        } else {
            // Fallback para o admin logado, para manter o comportamento que já funciona.
            if (isAdminOrEmployee && proprietarioContratoId === resolvedOwnerId) {
                setDadosContratada(perfil);
            } else {
                setDadosContratada(null);
                console.error("Não foi possível carregar os dados da CONTRATADA de tbl_admin:", error?.message);
            }
        }
    };
    fetchContratadaData();
  }, [proprietarioContratoId, isAdminOrEmployee, resolvedOwnerId, perfil]);

  // Função auxiliar de formatação de moeda
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const fetchDependentData = useCallback(async (targetId: string) => {
    if (!targetId || !resolvedOwnerId) return;

    // 1. Busca Tags
    const { data: tagsData } = await supabase
      .from('contrato_tags')
      .select('*')
      .eq('empresa_id', targetId);
      
    if (tagsData) setTagsCustomizadas(tagsData);

    // 2. Busca Clientes com a nova lógica
    let clientesDataSource: Promise<any>;

    // Admin users always get clients from tbl_clientes filtered by admin_id
    // Regular clients get clients from clientes table filtered by proprietario_id
    if (isAdminOrEmployee) {
      // For admin or admin employees: get all tbl_clientes where admin_id = targetId (the admin's ID)
      clientesDataSource = supabase
        .from('tbl_clientes')
        .select('*')
        .eq('admin_id', targetId) // targetId is the admin_id when selecting "Meus Contratos"
        .eq('aprovado', true)
        .order('nome');
    } else {
      // For clients: get from clientes table where proprietario_id = their client ID
      clientesDataSource = supabase
        .from('clientes')
        .select('*')
        .eq('proprietario_id', targetId)
        .order('nome');
    }
    
    const { data: clientesData } = await clientesDataSource;
      
    if (clientesData) {
        // CRÍTICO: Desduplicação por ID
        const uniqueClients = Array.from(new Map(clientesData.map(item => [item.id, item])).values());
        setClientesCR(uniqueClients);
    } else {
        setClientesCR([]); // Limpa a lista se nada for encontrado
    }
  }, [isAdminOrEmployee, resolvedOwnerId]);

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
    
    // 2. Carregar Empresas (Se Admin ou Usuario do Admin)
    if (isAdminOrEmployee && resolvedOwnerId) {
      // Get all approved clients for this admin
      const { data } = await supabase
        .from('tbl_clientes')
        .select('id, nome')
        .eq('admin_id', resolvedOwnerId) // Filter by admin_id
        .eq('aprovado', true);
      
      // Add "Meus Contratos" option at the top
      const options = [{ id: resolvedOwnerId, nome: 'Meus Contratos' }, ...(data || [])];
      setEmpresasContrato(options);
    }
    
    // Define o proprietário inicial como o usuário logado
    // Se for edição, isso será sobrescrito logo abaixo
    let currentProprietarioId = resolvedOwnerId;
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
  }, [modeloId, resolvedOwnerId, isAdminOrEmployee, fetchDependentData, contratoId]);

  // Carregamento inicial
  useEffect(() => {
    if (!carregandoSessao && resolvedOwnerId) buscarDados();
  }, [carregandoSessao, resolvedOwnerId, buscarDados]);

  // Se o proprietário mudar manualmente (no select do Admin), recarrega clientes
  // Adicionamos uma verificação para não recarregar se já estiver carregando (evita loop na inicialização)
  useEffect(() => {
      if (proprietarioContratoId && !carregandoDados) {
          fetchDependentData(proprietarioContratoId);
      }
  }, [proprietarioContratoId, fetchDependentData, carregandoDados]);



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

      // 2. Dados da Empresa (Contratada)
      if (dadosContratada) {
          newTags['{{EMPRESA_NOME}}'] = dadosContratada.nome || dadosContratada.razao_social || '';
          newTags['{{EMPRESA_DOCUMENTO}}'] = dadosContratada.documento || dadosContratada.cnpj || '';
          newTags['{{EMPRESA_EMAIL}}'] = dadosContratada.email || '';
          newTags['{{EMPRESA_TELEFONE}}'] = dadosContratada.telefone || '';
          newTags['{{EMPRESA_CEP}}'] = dadosContratada.cep || '';
          newTags['{{EMPRESA_ENDERECO}}'] = dadosContratada.endereco || '';
          newTags['{{EMPRESA_NUMERO}}'] = dadosContratada.numero || '';
          newTags['{{EMPRESA_COMPLEMENTO}}'] = dadosContratada.complemento || '';
          newTags['{{EMPRESA_BAIRRO}}'] = dadosContratada.bairro || '';
          newTags['{{EMPRESA_CIDADE}}'] = dadosContratada.cidade || '';
          newTags['{{EMPRESA_ESTADO}}'] = dadosContratada.estado || '';
          newTags['{{EMPRESA_CNPJ}}'] = dadosContratada.cnpj || '';
          newTags['{{EMPRESA_CPF}}'] = dadosContratada.cpf || '';
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
      dadosContratada, 
      valorTotal, 
      tipoLancamento, 
      numeroParcelas, 
      dataVencimentoUnico, 
      dataPrimeiroVencimento,
  ]);

  // Filtro para mostrar tags manuais na UI
  const tagsParaPreenchimentoManual = useMemo(() => {
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

  const handleSalvarContrato = async (status: string) => {
    if (!temCapitalSocial && status !== 'rascunho') {
        showError('É necessário fazer o lançamento inicial do Capital Social antes de gerar contratos que criam Contas a Receber.');
        return;
    }
    
    const dataInicio = tipoLancamento === 'unico' ? dataVencimentoUnico : dataPrimeiroVencimento;
    
    if (!clienteSelecionadoId || !proprietarioContratoId || !dataInicio) {
        showError('Preencha o cliente, proprietário e as datas de vencimento.');
        return;
    }

    setIsSubmitting(true);
    
    // Determina as tabelas e chaves
    const tabelaContasReceber = isAdminOrEmployee ? 'admin_contas_receber' : 'contas_receber';
    const tabelaParcelasReceber = isAdminOrEmployee ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
    const ownerKey = isAdminOrEmployee ? 'admin_id' : 'empresa_id';
    
    // Busca as contas contábeis mapeadas
    const { data: configData } = await supabase
        .from('configuracao_contratos')
        .select('id_conta_clientes_receber, id_conta_receita_contrato')
        .eq('proprietario_id', proprietarioContratoId)
        .single();
        
    const contaPatrimonialId = configData?.id_conta_clientes_receber || null;
    const contaReceitaId = configData?.id_conta_receita_contrato || null;
    
    // Busca a conta de parcela (analítica)
    const { data: parcelaConfig } = await supabase
        .from('configuracao_contas_receber')
        .select('conta_contabil_id')
        .eq('proprietario_id', proprietarioContratoId)
        .eq('tipo_registro', 'parcela')
        .single();
        
    const contaParcelaId = parcelaConfig?.conta_contabil_id || null;
    
    const temConfigContabil = !!contaPatrimonialId && !!contaReceitaId && !!contaParcelaId;

    try {
        let valorTotalFinal = valorTotal;
        let valorParcela = valorTotal;
        let parcelasParaInserir = [];

        if (tipoLancamento === 'unico') {
            valorTotalFinal = valorTotal;
            valorParcela = valorTotal;
            parcelasParaInserir.push({ numero_parcela: 1, valor_parcela: valorTotal, data_vencimento: format(dataVencimentoUnico!, 'yyyy-MM-dd'), status: 'aberta' });
        } else if (tipoLancamento === 'parcelar') {
            valorTotalFinal = valorTotal;
            valorParcela = numeroParcelas > 0 ? valorTotal / numeroParcelas : 0;
            for (let i = 0; i < numeroParcelas; i++) {
                parcelasParaInserir.push({ numero_parcela: i + 1, valor_parcela: valorParcela, data_vencimento: format(addDays(dataPrimeiroVencimento!, i * intervaloDias), 'yyyy-MM-dd'), status: 'aberta' });
            }
        } else if (tipoLancamento === 'repetir') {
            valorTotalFinal = valorTotal * numeroParcelas;
            valorParcela = valorTotal;
            for (let i = 0; i < numeroParcelas; i++) {
                parcelasParaInserir.push({ numero_parcela: i + 1, valor_parcela: valorParcela, data_vencimento: format(addDays(dataPrimeiroVencimento!, i * intervaloDias), 'yyyy-MM-dd'), status: 'aberta' });
            }
        }
        
        let currentContratoId = contratoId;
        let contaReceberId: string | null = null;
        
        // 1. SE FOR EDIÇÃO: Deletar lançamentos contábeis antigos e conta sintética
        if (isEditing && contratoInicial) {
            // 1.1. Buscar a conta sintética antiga
            const { data: oldContaSintetica } = await supabase
                .from(tabelaContasReceber)
                .select('id')
                .eq('contrato_gerado_id', contratoInicial.id)
                .single();
                
            if (oldContaSintetica) {
                contaReceberId = oldContaSintetica.id;
                
                // 1.2. Deletar lançamentos contábeis antigos (usando o ID da conta sintética)
                await supabase.from('lancamentos')
                    .delete()
                    .eq('origem', 'lancamento_cr')
                    .eq('proprietario_id', proprietarioContratoId)
                    .or(`descricao.ilike.%CR ID: ${contaReceberId.substring(0, 8)}%`);
                    
                // 1.3. Deletar parcelas antigas e a conta sintética (CASCADE)
                await supabase.from(tabelaContasReceber).delete().eq('id', contaReceberId);
            }
        }
        
        // 2. Inserir/Atualizar Contrato Gerado
        const contratoPayload = {
            modelo_id: modelo?.id,
            cliente_id: clienteSelecionadoId,
            proprietario_id: proprietarioContratoId,
            status: status,
            valor_total: valorTotalFinal,
            data_inicio: format(dataInicio, 'yyyy-MM-dd'),
            numero_parcelas: tipoLancamento === 'unico' ? 1 : numeroParcelas,
            valores_tags_preenchidos: { ...valoresTags, titulo: tituloDocumento, tipo_conteudo: 'html' },
            conteudo_renderizado: renderConteudo(),
        };
        
        if (isEditing) {
            const { data, error } = await supabase.from('contratos_gerados').update(contratoPayload).eq('id', contratoId).select('id').single();
            if (error) throw error;
            currentContratoId = data.id;
        } else {
            const { data, error } = await supabase.from('contratos_gerados').insert(contratoPayload).select('id').single();
            if (error) throw error;
            currentContratoId = data.id;
        }
        
        // 3. Inserir Nova Conta Sintética (Contas a Receber)
        const contaReceberPayload = isAdminOrEmployee ? {
            admin_id: proprietarioContratoId,
            cliente_id: clienteSelecionadoId,
            descricao: `Contrato: ${tituloDocumento}`,
            valor_total: valorTotalFinal,
            data_emissao: format(new Date(), 'yyyy-MM-dd'),
            data_vencimento: parcelasParaInserir[0].data_vencimento,
            tipo_receita: tipoLancamento === 'unico' ? 'única' : 'recorrente',
            status: 'aberta',
            origem: 'contrato',
            contrato_gerado_id: currentContratoId,
            id_conta_patrimonial: contaPatrimonialId,
            id_conta_resultado: contaReceitaId,
        } : {
            empresa_id: proprietarioContratoId,
            cliente_id: clienteSelecionadoId,
            descricao: `Contrato: ${tituloDocumento}`,
            valor_total: valorTotalFinal,
            data_emissao: format(new Date(), 'yyyy-MM-dd'),
            data_vencimento: parcelasParaInserir[0].data_vencimento,
            tipo_receita: tipoLancamento === 'unico' ? 'única' : 'recorrente',
            status: 'aberta',
            origem: 'contrato',
            contrato_gerado_id: currentContratoId,
            id_conta_patrimonial: contaPatrimonialId,
            id_conta_resultado: contaReceitaId,
        };
        
        const { data: newContaSintetica, error: contaError } = await supabase
            .from(tabelaContasReceber)
            .insert(contaReceberPayload)
            .select('id')
            .single();
            
        if (contaError) throw contaError;
        contaReceberId = newContaSintetica.id;
        
        // 4. Inserir Parcelas
        const parcelasComId = parcelasParaInserir.map(p => ({ 
            ...p, 
            conta_receber_id: contaReceberId, 
            [ownerKey]: proprietarioContratoId,
            ...(temConfigContabil && { id_conta_contabil: contaParcelaId })
        }));
        
        const { error: parcelError } = await supabase.from(tabelaParcelasReceber).insert(parcelasComId);
        if (parcelError) throw parcelError;
        
        // 5. Lançamentos Contábeis (Partidas Dobradas)
        if (temConfigContabil && status !== 'rascunho') {
            const dataMovimentacao = format(new Date(), 'yyyy-MM-dd') + 'T12:00:00Z';
            const launchDescription = `Contrato: ${tituloDocumento}`;
            const contaReceberIdShort = contaReceberId.substring(0, 8);
            
            // CRÍTICO: Geração de IDs e Referência Cruzada
            const idPatrimonial = uuidv4();
            const idReceita = uuidv4();
            
            // D: Conta Patrimonial (Clientes a Receber) - ENTRADA (Débito)
            const lancamentoPatrimonialPayload = {
                id: idPatrimonial,
                proprietario_id: proprietarioContratoId,
                data_movimentacao: dataMovimentacao,
                descricao: `Lançamento Inicial CR: ${launchDescription} (CR ID: ${contaReceberIdShort})`,
                valor: valorTotalFinal,
                tipo: 'Entrada' as const, // Entrada no Ativo (Débito)
                conta_bancaria_id: null,
                conta_contabil_id: contaPatrimonialId,
                origem: 'lancamento_cr',
                historico_id: null,
                conta_resultado_id: idReceita, // REFERÊNCIA CRUZADA
            };
            
            // C: Conta de Resultado (Receita) - SAÍDA (Crédito)
            const lancamentoReceitaPayload = {
                id: idReceita,
                proprietario_id: proprietarioContratoId,
                data_movimentacao: dataMovimentacao,
                descricao: `Receita: ${launchDescription} (CR ID: ${contaReceberIdShort})`,
                valor: valorTotalFinal,
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

        showSuccess(`Contrato ${isEditing ? 'atualizado' : 'salvo'} e Contas a Receber geradas com sucesso!`);
        navigate('/contratos');
    } catch (e: any) {
        showError(e.message);
    } finally {
        setIsSubmitting(false);
    }
  };
  
  // Renderizador dos botões de ação para reutilização no topo e rodapé
  const renderActionButtons = () => (
      <div className="flex space-x-4">
        <Button variant="secondary" onClick={() => handleSalvarContrato('rascunho')} disabled={isSubmitting || carregandoCapital}>
            <Save className="mr-2 h-4 w-4"/> Rascunho
        </Button>
        <Button onClick={() => handleSalvarContrato('pendente_assinatura')} disabled={isSubmitting || carregandoCapital || !temCapitalSocial}>
            Gerar e Enviar
        </Button>
      </div>
  );

  if (carregandoSessao || carregandoDados || carregandoCapital) {
    return <LayoutPrincipal><div className="flex justify-center p-20"><Loader2 className="animate-spin" /></div></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      {/* CABEÇALHO COM TÍTULO E BOTÕES DE AÇÃO */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <div className="flex items-center">
            <Button onClick={() => navigate('/contratos')} variant="link" className="p-0 mr-4"><ChevronLeft /> Voltar</Button>
            <h1 className="text-2xl font-bold">Preencher: {modelo?.titulo}</h1>
        </div>
        {renderActionButtons()}
      </div>
      
      {/* ALERTA DE CAPITAL SOCIAL */}
      {!temCapitalSocial && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Lançamento Inicial Obrigatório</AlertTitle>
          <AlertDescription>
            É necessário fazer o lançamento inicial do Capital Social antes de gerar contratos que criam Contas a Receber.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>1. Identificação e Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {isAdminOrEmployee && (
                <div className="space-y-2">
                  <Label>Empresa Contratante</Label>
                  <Select value={proprietarioContratoId || ''} onValueChange={setProprietarioContratoId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{empresasContrato.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Título do Documento</Label>
                <Input value={tituloDocumento} onChange={e => setTituloDocumento(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Cliente (Contratado)</Label>
                <Select value={clienteSelecionadoId} onValueChange={setClienteSelecionadoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o Cliente" /></SelectTrigger>
                  <SelectContent>
                    {clientesCR.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                            {c.nome} {c.documento ? `(${c.documento})` : ''}
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>2. Detalhes Financeiros</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor Base (R$)</Label>
                  <Input type="number" value={valorTotal} onChange={e => setValorTotal(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Lançamento</Label>
                  <RadioGroup value={tipoLancamento} onValueChange={(v: any) => setTipoLancamento(v)} className="flex space-x-2 pt-2">
                    <div className="flex items-center space-x-1"><RadioGroupItem value="unico" id="u"/><Label htmlFor="u">Único</Label></div>
                    <div className="flex items-center space-x-1"><RadioGroupItem value="parcelar" id="p"/><Label htmlFor="p">Parcelar</Label></div>
                    <div className="flex items-center space-x-1"><RadioGroupItem value="repetir" id="r"/><Label htmlFor="r">Repetir</Label></div>
                  </RadioGroup>
                </div>
              </div>

              {tipoLancamento === 'unico' ? (
                <div className="space-y-2">
                  <Label>Data de Vencimento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dataVencimentoUnico ? format(dataVencimentoUnico, 'dd/MM/yyyy', { locale: ptBR }) : "Selecione a data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dataVencimentoUnico} onSelect={setDataVencimentoUnico} initialFocus locale={ptBR} /></PopoverContent>
                  </Popover>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-2"><Label>Parcelas</Label><Input type="number" value={numeroParcelas} onChange={e => setNumeroParcelas(Number(e.target.value))} /></div>
                  <div className="space-y-2"><Label>Intervalo</Label><Input type="number" value={intervaloDias} onChange={e => setIntervaloDias(Number(e.target.value))} /></div>
                  <div className="space-y-2">
                    <Label>1º Vencimento</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="outline" 
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !dataPrimeiroVencimento && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dataPrimeiroVencimento ? format(dataPrimeiroVencimento, 'dd/MM/yyyy', { locale: ptBR }) : <span>Selecione</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dataPrimeiroVencimento} onSelect={setDataPrimeiroVencimento} initialFocus locale={ptBR} /></PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>3. Tags Manuais (Outras)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {tagsParaPreenchimentoManual.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tag manual extra detectada.</p>}
              {tagsParaPreenchimentoManual.map(tag => (
                <div key={tag} className="space-y-1">
                  <Label className="text-xs">{tag}</Label>
                  <Input placeholder={`Valor para ${tag}`} value={valoresTags[tag] || ''} onChange={e => setValoresTags(prev => ({...prev, [tag]: e.target.value}))} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit sticky top-6">
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              Prévia do Documento
              <Button variant="ghost" size="sm" onClick={() => setPreviewOpen(true)}><Eye className="h-4 w-4 mr-2" /> Ampliar</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border p-6 rounded bg-slate-50 dark:bg-white text-zinc-900 min-h-[400px] text-sm overflow-y-auto max-h-[600px] ql-editor" 
                 dangerouslySetInnerHTML={{ __html: renderConteudo() }} />
          </CardContent>
        </Card>
      </div>
      
      {/* BOTÕES DE AÇÃO NO RODAPÉ */}
      <div className="mt-6 flex justify-end space-x-4">
        {renderActionButtons()}
      </div>

      <ContratoPreviewDialog 
        open={previewOpen} 
        onOpenChange={setPreviewOpen} 
        conteudoHtml={renderConteudo()} 
        titulo={tituloDocumento} 
        isHtml={true} 
      />
    </LayoutPrincipal>
  );
};

export default PreencherContrato;