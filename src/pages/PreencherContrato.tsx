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
  
  const isAdmin = role === 'Admin';
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

    // 2. Busca Clientes (Contratados)
    let clientesDataSource: Promise<any>;
    
    // Verifica se o targetId é um Admin (Admin logado ou Admin selecionado no dropdown)
    const isTargetAdmin = targetId === ownerIdLogado && isAdmin;

    if (isTargetAdmin) {
      // Admin: Busca clientes do sistema (tbl_clientes)
      clientesDataSource = supabase
        .from('tbl_clientes')
        .select('*')
        .eq('admin_id', targetId)
        .eq('aprovado', true)
        .order('nome');
    } else {
      // Cliente ou Usuário: Busca clientes CR (clientes)
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
      const { data } = await supabase.from('tbl_clientes').select('id, nome').eq('aprovado', true);
      const options = [{ id: ownerIdLogado, nome: 'Meus Contratos' }, ...(data || [])];
      setEmpresasContrato(options);
    }
    
    // Define o proprietário inicial como o usuário logado
    // Se for edição, isso será sobrescrito logo abaixo
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

  const handleSalvarDocumento = async (status: DocumentoStatus) => {
    const values = getValues();
    
    if (!modelo || !values.cliente_id || !ownerIdLogado || !values.titulo_documento || !values.proprietario_documento_id) {
        showError('Preencha Título, Cliente e Proprietário.');
        return;
    }
    
    setIsSubmitting(true);
    
    try {
        // 0. GARANTIR QUE O CLIENTE EXISTA NA TABELA 'tbl_clientes' (para FK)
        const clienteSelecionado = clientesCR.find(c => c.id === values.cliente_id);
        if (!clienteSelecionado) throw new Error('Cliente selecionado não encontrado.');
        
        // 1. Renderizar Conteúdo Final
        const conteudoRenderizado = renderizarConteudo(modelo.conteudo_template, values.valores_tags || {});
        
        // 2. Preparar dados do Documento Gerado
        const documentoPayload = {
            modelo_id: modelo.id,
            cliente_id: values.cliente_id,
            proprietario_id: values.proprietario_documento_id,
            status: status,
            // O título é salvo nos valores_tags e no campo titulo_documento
            valores_tags_preenchidos: { 
                ...values.valores_tags, 
                titulo: values.titulo_documento, 
                tipo_conteudo: values.tipo_conteudo,
                '{{CONTEUDO_PRINCIPAL}}': sanitizeConteudo(values.valores_tags?.['{{CONTEUDO_PRINCIPAL}}'] || ''), // Salva o conteúdo principal sanitizado
            },
            conteudo_renderizado: conteudoRenderizado,
            data_registro: format(new Date(), 'yyyy-MM-dd'),
        };
        
        if (isEditing && documentoInicial) {
            const { error } = await supabase
                .from('documentos_societarios_gerados')
                .update(documentoPayload)
                .eq('id', documentoInicial.id);
            if (error) throw error;
            
        } else {
            const { error } = await supabase
                .from('documentos_societarios_gerados')
                .insert(documentoPayload);
            if (error) throw error;
        }

        showSuccess(`Documento ${isEditing ? 'atualizado' : 'salvo'} como ${status} com sucesso!`);
        navigate('/documentos-societarios');
        
    } catch (error: any) {
        console.error('Erro ao salvar documento:', error);
        showError('Falha ao salvar documento: ' + error.message);
    } finally {
        setIsSubmitting(false);
    }
  };
  
  // Filtra tags que já foram preenchidas automaticamente (para não pedir valor manual)
  const tagsParaPreenchimentoManual = allAvailableTags.filter(tag => {
      // Exclui tags de sistema (EMPRESA_*) que foram preenchidas
      if (tag.nome_tag.startsWith('{{EMPRESA_') && valoresTags[tag.nome_tag]) return false;
      
      // Exclui tags de cliente (CLIENTE_*) que foram preenchidas
      if (tag.nome_tag.startsWith('{{CLIENTE_') && valoresTags[tag.nome_tag]) return false;
      
      // Exclui a tag de conteúdo principal
      if (tag.nome_tag === '{{CONTEUDO_PRINCIPAL}}') return false;
      
      // Inclui tags que não têm valor preenchido
      return !valoresTags[tag.nome_tag];
  }).map(tag => tag.nome_tag); // Mapeia para retornar apenas a string do nome da tag

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
          <FileSignature className="w-6 h-6 mr-2" /> {isEditing ? 'Editar Documento' : 'Gerar Documento'}: {modelo.titulo}
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
              onClick={() => handleSalvarDocumento('finalizado')} 
              className="flex-1 h-12"
              disabled={isSubmitting || !clienteSelecionadoId}
          >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEditing ? 'Salvar Alterações' : 'Gerar Documento'}
          </Button>
      </div>
      
      <FormProvider {...form}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => handleSalvarDocumento('finalizado'))} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Coluna 1: Dados e Tags */}
              <Card className="lg:col-span-1 h-fit">
                  <CardHeader><CardTitle className="text-xl">Dados e Tags</CardTitle></CardHeader>
                  <CardContent className="space-y-6">
                      
                      {isAdmin && (
                          <FormField control={form.control} name="proprietario_documento_id" render={({ field }) => (
                              <FormItem className="space-y-2">
                                  <FormLabel htmlFor="empresa-documento">Empresa Proprietária</FormLabel>
                                  <Select 
                                      value={field.value || ''} 
                                      onValueChange={field.onChange}
                                  >
                                      <FormControl>
                                          <SelectTrigger id="empresa-documento">
                                              <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                                              <SelectValue placeholder="Selecione a Empresa" />
                                          </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                          {empresasContrato.map((e: EmpresaContrato) => (
                                              <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                                          ))}
                                      </SelectContent>
                                  </Select>
                                  <FormMessage />
                              </FormItem>
                          )} />
                      )}
                      
                      <FormField control={form.control} name="titulo_documento" render={({ field }) => (
                          <FormItem className="space-y-2">
                              <FormLabel htmlFor="titulo-documento">Título do Documento</FormLabel>
                              <FormControl>
                                  <Input 
                                      id="titulo-documento"
                                      placeholder={modelo.titulo}
                                      {...field}
                                  />
                              </FormControl>
                              <FormMessage />
                          </FormItem>
                      )} />
                      
                      <FormField control={form.control} name="cliente_id" render={({ field }) => (
                          <FormItem className="space-y-2">
                              <FormLabel htmlFor="cliente">Cliente (Contratado)</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange} disabled={!proprietarioDocumentoId}>
                                  <FormControl>
                                      <SelectTrigger id="cliente">
                                          <SelectValue placeholder="Selecione o Cliente" />
                                      </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                      {clientesCR.map(c => (
                                          <SelectItem key={c.id} value={c.id}>
                                              {c.nome}
                                          </SelectItem>
                                      ))}
                                  </SelectContent>
                              </Select>
                              <FormMessage />
                          </FormItem>
                      )} />
                      
                      <Separator />
                      
                      <div className="space-y-4">
                          <h3 className="font-semibold text-lg">Tags Manuais</h3>
                          <p className="text-sm text-muted-foreground">Preencha as tags que não foram preenchidas automaticamente.</p>
                          
                          {tagsParaPreenchimentoManual.length === 0 ? (
                              <p className="text-muted-foreground text-sm">Nenhuma tag manual pendente.</p>
                          ) : (
                              tagsParaPreenchimentoManual.map(tagKey => (
                                  <FormField
                                      key={tagKey}
                                      control={form.control}
                                      name={`valores_tags.${tagKey}`}
                                      render={({ field }) => (
                                          <FormItem className="space-y-1">
                                              <FormLabel htmlFor={tagKey} className="font-semibold">{tagKey}</FormLabel>
                                              <FormControl>
                                                  <Input 
                                                      id={tagKey}
                                                      placeholder={`Insira o valor para ${tagKey}`}
                                                      {...field}
                                                      value={field.value || ''}
                                                      onChange={(e) => handleTagChange(tagKey, e.target.value)}
                                                  />
                                              </FormControl>
                                              <FormMessage />
                                          </FormItem>
                                      )}
                                  />
                              ))
                          )}
                      </div>
                  </CardContent>
              </Card>
              
              {/* Coluna 2: Conteúdo Principal (Editável) e Prévia */}
              <Card className="lg:col-span-2">
                  <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="text-xl">Conteúdo do Documento</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                      
                      {/* Campo de Edição do Conteúdo Principal */}
                      <FormField
                          control={form.control}
                          name={`valores_tags.{{CONTEUDO_PRINCIPAL}}`}
                          render={({ field }) => (
                              <FormItem>
                                  <FormLabel>Conteúdo Principal (Editável)</FormLabel>
                                  <FormControl>
                                      <Textarea 
                                          placeholder="Edite o conteúdo principal do documento aqui..." 
                                          {...field} 
                                          rows={15}
                                          className="font-mono text-sm"
                                      />
                                  </FormControl>
                                  <FormMessage />
                              </FormItem>
                          )}
                      />
                      
                      <Separator />
                      
                      {/* Prévia Renderizada */}
                      <div className="space-y-2">
                          <Label>Prévia Renderizada</Label>
                          <div className="border rounded-md p-4 bg-background shadow-inner max-h-[400px] overflow-y-auto">
                              {templateContent ? (
                                  <div dangerouslySetInnerHTML={{ __html: renderizarConteudo(templateContent, valoresTags) }} />
                              ) : (
                                  <p className="text-muted-foreground">Selecione um modelo e um cliente para ver a prévia.</p>
                              )}
                          </div>
                      </div>
                      
                  </CardContent>
              </Card>
              
            </div>
            
            <Button type="submit" className="w-full" disabled={isSubmitting || !clienteSelecionadoId}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isEditing ? 'Salvar Alterações' : 'Gerar Documento'}
            </Button>
          </form>
        </Form>
      </FormProvider>
      
      <DocumentoPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        conteudoHtml={conteudoPreview}
        titulo={previewTitle}
        isHtml={tipoConteudo === 'html'}
      />
    </LayoutPrincipal>
  );
};

export default GerarDocumentoSocietario;