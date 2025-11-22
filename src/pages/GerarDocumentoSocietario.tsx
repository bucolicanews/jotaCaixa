import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileSignature, ChevronLeft, Save, Eye, Building2, PlusCircle, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { DocumentoSocietarioModelo, BlocoSocietario, DocumentoSocietarioGerado } from '@/types/documentos-societarios';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClienteProfile, UsuarioProfile, AdminProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DocumentoPreviewDialog from '@/components/documentos-societarios/DocumentoPreviewDialog';
import { useSessao } from '@/hooks/use-sessao';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { sanitizeConteudo } from '@/utils/formatters';
import { useForm, FormProvider, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';

type TipoConteudo = 'html' | 'texto';
type DocumentoStatus = 'rascunho' | 'finalizado' | 'arquivado' | 'ativo';

interface ExtendedDocumentoSocietarioGerado extends DocumentoSocietarioGerado {
    titulo: string;
    status: DocumentoStatus;
}

interface EmpresaContrato {
    id: string;
    nome: string;
}

interface ClienteCRCompleto {
    id: string;
    proprietario_id?: string | null;
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

// Esquema de validação para o formulário
const formSchema = z.object({
    titulo_documento: z.string().min(1, 'O título é obrigatório.'),
    cliente_id: z.string().uuid('Selecione um cliente válido.'),
    proprietario_documento_id: z.string().uuid('Selecione o proprietário.'),
    tipo_conteudo: z.enum(['html', 'texto']),
    
    // Campos dinâmicos (tags)
    conteudo_principal: z.string().min(10, 'O conteúdo é muito curto.'),
    valores_tags: z.record(z.string()).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const GerarDocumentoSocietario: React.FC = () => {
  const { modeloId: modeloIdParam } = useParams<{ modeloId: string }>();
  const [searchParams] = useSearchParams();
  const documentoId = searchParams.get('documentoId');
  const navigate = useNavigate();
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  
  const [modelo, setModelo] = useState<DocumentoSocietarioModelo | null>(null);
  const [documentoInicial, setDocumentoInicial] = useState<ExtendedDocumentoSocietarioGerado | null>(null);
  const [blocos, setBlocos] = useState<BlocoSocietario[]>([]);
  const [tagsCustomizadas, setTagsCustomizadas] = useState<any[]>([]);
  
  const [clientesCR, setClientesCR] = useState<ClienteCRCompleto[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [previewOpen, setPreviewOpen] = useState(false);
  const [conteudoPreview, setConteudoPreview] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const isEditing = !!documentoId;
  const modeloId = modeloIdParam || documentoInicial?.modelo_id;

  const isAdmin = role === 'Admin';
  const isClient = role === 'Cliente';
  
  const getOwnerIdLogado = () => {
    if (isAdmin) return usuario?.id || null;
    if (isClient) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerIdLogado = getOwnerIdLogado();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
        titulo_documento: '',
        cliente_id: '',
        proprietario_documento_id: ownerIdLogado || '',
        tipo_conteudo: 'html',
        conteudo_principal: '',
        valores_tags: {},
    },
  });
  
  const { watch, setValue, getValues } = form;
  
  const clienteSelecionadoId = watch('cliente_id');
  const proprietarioDocumentoId = watch('proprietario_documento_id');
  const tituloDocumento = watch('titulo_documento');
  const tipoConteudo = watch('tipo_conteudo');
  const valoresTags = watch('valores_tags') || {};
  const conteudoPrincipal = watch('conteudo_principal');

  // Cliente selecionado (para preenchimento de tags)
  const clienteSelecionado = useMemo(() => {
      return clientesCR.find((c: ClienteCRCompleto) => c.id === clienteSelecionadoId);
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
        cpf: (profile as AdminProfile).cpf || (profile as ClienteProfile)?.cpf, 
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
        setTagsCustomizadas(tagsData);
    }
    
    // 2. Buscar Clientes (Contratados) - AGORA BUSCA NA TABELA 'clientes' (Clientes CR)
    let queryClients = supabase
        .from('clientes')
        .select('*')
        .eq('proprietario_id', targetEmpresaId)
        .order('nome');
        
    const { data: clientesCRData, error: errorCR } = await queryClients;
        
    if (errorCR) {
        showError('Erro ao carregar clientes CR: ' + errorCR.message);
        setClientesCR([]);
    } else {
        const mappedClients = (clientesCRData as ClienteCRCompleto[]).filter((c: ClienteCRCompleto) => c.id !== targetEmpresaId);
        setClientesCR(mappedClients);
        
        if (clienteSelecionadoId && !mappedClients.some((c: ClienteCRCompleto) => c.id === clienteSelecionadoId)) {
            setValue('cliente_id', '');
        }
    }
    
    // 3. Buscar Blocos de Conteúdo
    const { data: blocosData, error: blocosError } = await supabase
        .from('blocos_societarios')
        .select('*')
        .or(`proprietario_id.eq.${targetEmpresaId},proprietario_id.is.null`)
        .order('titulo');
        
    if (blocosError) {
        console.error('Erro ao carregar blocos:', blocosError);
    } else {
        setBlocos(blocosData as BlocoSocietario[]);
    }
    
  }, [clienteSelecionadoId, setValue]);


  // --- FUNÇÃO PRINCIPAL DE BUSCA DE DADOS INICIAIS ---
  const buscarDados = useCallback(async () => {
    if (!modeloId && !documentoId || !ownerIdLogado) {
        setCarregandoDados(false);
        return;
    }
    
    setCarregandoDados(true);
    
    let initialProprietarioDocumentoId = ownerIdLogado;
    let currentModelo: DocumentoSocietarioModelo | null = null;
    let initialValoresTags: Record<string, string> = {};
    let initialClienteId = '';
    
    // 1. Carregar Documento Inicial (se for edição)
    if (documentoId) {
        const { data: docData, error: docLoadError } = await supabase
            .from('documentos_societarios_gerados')
            .select('*')
            .eq('id', documentoId)
            .single();
            
        if (docLoadError) {
            showError('Documento para edição não encontrado ou acesso negado.');
            navigate('/documentos-societarios', { replace: true });
            return;
        }
        
        const doc = docData as ExtendedDocumentoSocietarioGerado;
        setDocumentoInicial(doc);
        initialProprietarioDocumentoId = doc.proprietario_id;
        initialClienteId = doc.cliente_id || '';
        initialValoresTags = doc.valores_tags_preenchidos || {};
        
        // 1.1. Buscar Modelo associado
        const { data: modeloData } = await supabase
            .from('modelos_societarios')
            .select('*, tipo_conteudo')
            .eq('id', doc.modelo_id)
            .single();
        currentModelo = modeloData as DocumentoSocietarioModelo;
        
    } else if (modeloId) {
        // 2. Buscar Modelo (se for criação)
        const { data: modeloData, error: modeloError } = await supabase
            .from('modelos_societarios')
            .select('*, tipo_conteudo')
            .eq('id', modeloId)
            .single();
            
        if (modeloError) {
            showError('Modelo não encontrado ou acesso negado.');
            navigate('/documentos-societarios', { replace: true });
            return;
        }
        currentModelo = modeloData as DocumentoSocietarioModelo;
        
        // NOVO: Inicializa o campo {{CONTEUDO_PRINCIPAL}} com o template do modelo
        initialValoresTags['{{CONTEUDO_PRINCIPAL}}'] = sanitizeConteudo(modeloData.conteudo_template);
    }
    
    setModelo(currentModelo);
    
    // 3. Configurar Empresas Contratantes (Apenas Admin)
    if (isAdmin) {
        const { data: clientesData } = await supabase
            .from('tbl_clientes')
            .select('id, nome')
            .eq('aprovado', true)
            .order('nome');
            
        if (clientesData) {
            const adminOption: EmpresaContrato = { id: ownerIdLogado, nome: 'Meus Documentos (Admin)' };
            const allClients = [adminOption, ...(clientesData as EmpresaContrato[])];
            setEmpresasContrato(allClients);
            if (!documentoId) initialProprietarioDocumentoId = allClients[0].id;
        }
    }
    
    // 4. Resetar o formulário com os dados carregados
    form.reset({
        titulo_documento: (documentoId ? docData?.valores_tags_preenchidos?.titulo : currentModelo?.titulo) || '',
        cliente_id: initialClienteId,
        proprietario_documento_id: initialProprietarioDocumentoId,
        tipo_conteudo: currentModelo?.tipo_conteudo || 'html',
        conteudo_principal: initialValoresTags['{{CONTEUDO_PRINCIPAL}}'] || '',
        valores_tags: initialValoresTags,
    });
    
    setCarregandoDados(false);
  }, [modeloId, documentoId, ownerIdLogado, navigate, isAdmin, isClient, empresaLogadaMemo, form]);
  
  // Efeito para monitorar a mudança do proprietário do documento
  useEffect(() => {
      if (proprietarioDocumentoId) {
          fetchDependentData(proprietarioDocumentoId);
      }
  }, [proprietarioDocumentoId, fetchDependentData]);


  useEffect(() => {
    if (!carregandoSessao && ownerIdLogado) {
      buscarDados();
    } else if (!carregandoSessao && !isAdmin && !isClient) {
        navigate('/painel', { replace: true });
    }
  }, [carregandoSessao, ownerIdLogado, buscarDados, navigate, isAdmin, isClient]);

  // --- Lógica de Preenchimento de Tags ---
  const allAvailableTags = useMemo(() => {
      const customTagsMap = tagsCustomizadas.reduce((acc, tag) => {
          acc[tag.nome_tag] = tag;
          return acc;
      }, {} as Record<string, ContratoTag>);
      
      const tagsNaoFinanceiras = TAGS_PADRAO.filter(t => !t.origem_dado?.startsWith('contas_receber'));
      
      const combined = [...tagsNaoFinanceiras, ...tagsCustomizadas];
      
      const uniqueTags = Array.from(new Set(combined.map(t => t.nome_tag)))
          .map(tagKey => {
              const customTag = customTagsMap[tagKey];
              const defaultTag = tagsNaoFinanceiras.find(t => t.nome_tag === tagKey);
              return customTag || defaultTag;
          })
          .filter((t): t is ContratoTag => !!t)
          .sort((a, b) => a.nome_tag.localeCompare(b.nome_tag));
          
      return uniqueTags;
  }, [tagsCustomizadas]);

  const updateTags = useCallback(() => {
    const newTags: Record<string, string> = {};
    const currentTags = getValues('valores_tags') || {};
    
    allAvailableTags.forEach(tag => {
        const tagKey = tag.nome_tag;
        let tagValue: string | null = null;
        
        if (tag.origem_dado) {
            const [sourceTable, sourceField] = tag.origem_dado.split('.');
            
            // Mapeamento de dados da Empresa Logada (Contratante)
            if ((sourceTable === 'tbl_clientes' || sourceTable === 'tbl_admins') && empresaLogadaMemo) {
                const empresaData = empresaLogadaMemo as any;
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
        }
        
        if (tagValue !== null && tagValue !== undefined && tagValue !== 'N/A') {
            newTags[tagKey] = tagValue;
        } else {
            // Mantém o valor digitado anteriormente
            newTags[tagKey] = currentTags[tagKey] || '';
        }
    });
    
    // Atualiza o campo de tags no RHF
    setValue('valores_tags', newTags, { shouldDirty: true });
  }, [clienteSelecionado, empresaLogadaMemo, allAvailableTags, getValues, setValue]);

  useEffect(() => {
    updateTags();
  }, [updateTags, clienteSelecionadoId]); // Roda quando o cliente muda

  const handleTagChange = (tag: string, value: string) => {
    const currentTags = getValues('valores_tags') || {};
    setValue('valores_tags', { ...currentTags, [tag]: value }, { shouldDirty: true });
  };
  
  const renderizarConteudo = (template: string, tags: Record<string, string>): string => {
    let conteudoRenderizado = template;
    
    Object.keys(tags).forEach(tagKey => {
        const regex = new RegExp(tagKey, 'g');
        conteudoRenderizado = conteudoRenderizado.replace(regex, tags[tagKey]);
    });
    
    return conteudoRenderizado;
  };
  
  const handlePreview = () => {
      if (!modelo) return;
      
      const templateToRender = conteudoPrincipal || modelo.conteudo_template;
      const conteudoRenderizado = renderizarConteudo(templateToRender, valoresTags);
      
      setConteudoPreview(conteudoRenderizado);
      setPreviewTitle(tituloDocumento || modelo.titulo);
      setPreviewOpen(true);
  };

  const handleSalvarDocumento = async (status: DocumentoStatus) => {
    const values = getValues();
    
    if (!modelo || !values.cliente_id || !ownerIdLogado || !values.titulo_documento || !values.proprietario_documento_id) {
        showError('Preencha Título, Cliente e Proprietário.');
        return;
    }
    
    setIsSubmitting(true);
    
    try {
        const clienteSelecionado = clientesCR.find((c: ClienteCRCompleto) => c.id === values.cliente_id);
        if (!clienteSelecionado) throw new Error('Cliente selecionado não encontrado.');
        
        const templateToRender = values.conteudo_principal || modelo.conteudo_template;
        const conteudoRenderizado = renderizarConteudo(templateToRender, values.valores_tags || {});
        
        // 1. Sanitiza o conteúdo principal antes de salvar
        const sanitizedContudoPrincipal = sanitizeConteudo(values.conteudo_principal);
        
        // 2. Prepara dados do Documento Gerado
        const documentoPayload = {
            modelo_id: modelo.id,
            cliente_id: values.cliente_id,
            proprietario_id: values.proprietario_documento_id,
            status: status,
            titulo: values.titulo_documento,
            valores_tags_preenchidos: { 
                ...values.valores_tags, 
                titulo: values.titulo_documento, 
                tipo_conteudo: values.tipo_conteudo,
                '{{CONTEUDO_PRINCIPAL}}': sanitizedContudoPrincipal, // Salva o conteúdo principal sanitizado
            },
            conteudo_renderizado: conteudoRenderizado,
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
  
  // --- FUNÇÕES DE DRAG AND DROP E INSERÇÃO DE BLOCOS ---
  
  const handleInsertText = (text: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentValue = getValues('conteudo_principal') || ''; 
      
      const sanitizedText = sanitizeConteudo(text); // Sanitiza o texto a ser inserido
      
      const newValue = currentValue.substring(0, start) + sanitizedText + currentValue.substring(end);
      
      setValue('conteudo_principal', newValue, { shouldDirty: true });
      
      setTimeout(() => {
          textarea.focus();
          textarea.selectionStart = start + sanitizedText.length;
          textarea.selectionEnd = start + sanitizedText.length;
      }, 0);
  };
  
  const handleInsertBloco = (bloco: BlocoSocietario) => {
      handleInsertText(`\n\n${bloco.conteudo}\n\n`);
      showSuccess(`Bloco '${bloco.titulo}' inserido no conteúdo.`);
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
  };
  
  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      const tag = e.dataTransfer.getData("text/plain");
      
      if (!tag) return;
      
      handleInsertText(tag);
      showSuccess(`Conteúdo inserido.`);
  };
  
  // --- FIM FUNÇÕES DE DRAG AND DROP E INSERÇÃO DE BLOCOS ---

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
  
  // Filtra tags que já foram preenchidas automaticamente (para não pedir valor manual)
  const tagsParaPreenchimentoManual = allAvailableTags.filter(tag => {
      if (tag.nome_tag === '{{CONTEUDO_PRINCIPAL}}') return false;
      if (tag.nome_tag.startsWith('{{EMPRESA_') && valoresTags[tag.nome_tag]) return false;
      if (tag.nome_tag.startsWith('{{CLIENTE_') && valoresTags[tag.nome_tag]) return false;
      
      return !valoresTags[tag.nome_tag];
  }).map(t => t.nome_tag);

  return (
    <LayoutPrincipal>
       <div className="flex items-center mb-6">
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
              onClick={() => handleSalvarDocumento('ativo')} 
              className="flex-1 h-12"
              disabled={isSubmitting || !clienteSelecionadoId}
          >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEditing ? 'Salvar Alterações' : 'Gerar Documento'}
          </Button>
      </div>
      
      <FormProvider {...form}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => handleSalvarDocumento('ativo'))} className="space-y-6">
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
                                          <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
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
                                                      onChange={(e) => handleTagChange(tagKey, e.target.value)} // Usa o handler local
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
              
              {/* Coluna 2: Template e Blocos */}
              <Card className="lg:col-span-2">
                  <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="text-xl">Conteúdo do Documento</CardTitle>
                      <Button 
                          onClick={() => handleSalvarDocumento('rascunho')} 
                          variant="secondary" 
                          size="sm"
                          disabled={isSubmitting || !clienteSelecionadoId}
                      >
                          <Save className="mr-2 h-4 w-4" />
                          Salvar Rascunho
                      </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                      
                      {/* Campo de Conteúdo Principal (Editável) */}
                      <div className="space-y-2">
                          <Label htmlFor="conteudo-principal">Conteúdo Principal (Editável)</Label>
                          <FormField control={form.control} name="conteudo_principal" render={({ field }) => (
                              <FormItem>
                                  <FormControl>
                                      <Textarea
                                          id="conteudo-principal"
                                          ref={textareaRef}
                                          rows={15}
                                          className={cn("font-mono text-sm", tipoConteudo === 'html' ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : '')}
                                          onDragOver={handleDragOver}
                                          onDrop={handleDrop}
                                          {...field}
                                          value={field.value || ''}
                                      />
                                  </FormControl>
                                  <FormMessage />
                              </FormItem>
                          )} />
                      </div>
                      
                      <Separator />
                      
                      {/* Tags e Blocos de Conteúdo */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Tags Arrastáveis */}
                          <div className="space-y-2">
                              <h3 className="font-semibold text-lg flex items-center">
                                  <Tag className="w-4 h-4 mr-2" /> Arrastar Tags
                              </h3>
                              <p className="text-sm text-muted-foreground">Arraste as tags para o campo de conteúdo acima.</p>
                              <div className="space-y-2 max-h-40 overflow-y-auto p-2 border rounded-md">
                                  {allAvailableTags.map((tag: ContratoTag) => (
                                      <div 
                                          key={tag.nome_tag} 
                                          className="p-2 border rounded-md cursor-pointer hover:bg-accent/50 transition-colors"
                                          draggable
                                          onDragStart={(e) => e.dataTransfer.setData("text/plain", tag.nome_tag)}
                                          onClick={() => handleInsertText(tag.nome_tag)}
                                      >
                                          <p className="font-mono text-xs font-semibold text-primary">{tag.nome_tag}</p>
                                          <p className="text-xs text-muted-foreground">{tag.descricao}</p>
                                      </div>
                                  ))}
                              </div>
                          </div>
                          
                          {/* Blocos de Conteúdo */}
                          <div className="space-y-2">
                              <h3 className="font-semibold text-lg flex items-center">
                                  <PlusCircle className="w-4 h-4 mr-2" /> Inserir Blocos
                              </h3>
                              <p className="text-sm text-muted-foreground">Clique ou arraste para adicionar um bloco pré-definido.</p>
                              <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto p-2 border rounded-md">
                                  {blocos.length === 0 ? (
                                      <p className="text-muted-foreground text-sm col-span-2">Nenhum bloco disponível.</p>
                                  ) : (
                                      blocos.map(bloco => (
                                          <Button 
                                              key={bloco.id} 
                                              variant="outline" 
                                              size="sm" 
                                              onClick={() => handleInsertBloco(bloco)}
                                              className="justify-start truncate"
                                              draggable
                                              onDragStart={(e) => e.dataTransfer.setData("text/plain", `\n\n${bloco.conteudo}\n\n`)}
                                          >
                                              {bloco.titulo}
                                          </Button>
                                      ))
                                  )}
                              </div>
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