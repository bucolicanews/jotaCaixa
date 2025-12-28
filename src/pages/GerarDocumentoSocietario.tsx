// src/pages/GerarDocumentoSocietario.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileSignature, ChevronLeft, Save, Eye, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { DocumentoSocietarioModelo, DocumentoSocietarioGerado } from '@/types/documentos-societarios';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClienteProfile, UsuarioProfile, AdminProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DocumentoPreviewDialog from '@/components/documentos-societarios/DocumentoPreviewDialog';
import { useSessao } from '@/hooks/use-sessao';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import { Separator } from '@/components/ui/separator';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { sanitizeConteudo } from '@/utils/formatters';

type TipoConteudo = 'html' | 'texto';
type DocumentoStatus = 'rascunho' | 'finalizado' | 'arquivado' | 'ativo';

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

// Esquema de validação simplificado
const formSchema = z.object({
    titulo_documento: z.string().min(1, 'O título é obrigatório.'),
    cliente_id: z.string().uuid('Selecione um cliente válido.'),
    proprietario_documento_id: z.string().uuid('Selecione o proprietário.'),
    tipo_conteudo: z.enum(['html', 'texto']),
    valores_tags: z.record(z.string()).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const GerarDocumentoSocietario: React.FC = () => {
  const { modeloId: modeloIdParam } = useParams<{ modeloId: string }>();
  const [searchParams] = useSearchParams();
  const documentoId = searchParams.get('documentoId');
  const navigate = useNavigate();
  const { perfil, carregando: carregandoSessao } = useSessao();
  const { ownerId, ownerType } = useOwner();

  const [modelo, setModelo] = useState<DocumentoSocietarioModelo | null>(null);
  const [documentoInicial, setDocumentoInicial] = useState<DocumentoSocietarioGerado | null>(null);
  const [clientesCR, setClientesCR] = useState<ClienteCRCompleto[]>([]);
  const [tagsCustomizadas, setTagsCustomizadas] = useState<any[]>([]);
  
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [previewOpen, setPreviewOpen] = useState(false);
  const [conteudoPreview, setConteudoPreview] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  
  const [empresasContrato, setEmpresasContrato] = useState<EmpresaContrato[]>([]);
  
  const isEditing = !!documentoId;
  const modeloId = modeloIdParam || documentoInicial?.modelo_id;
  const isSupervisaoContext = ownerType === 'Admin' || ownerType === 'AdminUsuario';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
        titulo_documento: '',
        cliente_id: '',
        proprietario_documento_id: ownerId || '',
        tipo_conteudo: 'html',
        valores_tags: {},
    },
  });
  
  const { watch, setValue, getValues } = form;
  
  const clienteSelecionadoId = watch('cliente_id');
  const proprietarioDocumentoId = watch('proprietario_documento_id');
  const valoresTags = watch('valores_tags') || {};

  const fetchDependentData = useCallback(async (targetOwnerId: string) => {
    if (!targetOwnerId) return;

    const { data: tagsData } = await supabase
        .from('contrato_tags')
        .select('*')
        .eq('proprietario_id', targetOwnerId);
    setTagsCustomizadas(tagsData || []);
    
    const { data: ownerProfile } = await supabase
        .from('tbl_admins')
        .select('id')
        .eq('id', targetOwnerId)
        .maybeSingle();
        
    const isTargetAdmin = !!ownerProfile;

    let clientesDataSource;
    if (isTargetAdmin) {
      clientesDataSource = await supabase
        .from('tbl_clientes')
        .select('*')
        .eq('admin_id', targetOwnerId)
        .eq('aprovado', true)
        .order('nome');
    } else {
      clientesDataSource = await supabase
        .from('clientes')
        .select('*')
        .eq('proprietario_id', targetOwnerId)
        .order('nome');
    }
    
    const { data: clientesData } = clientesDataSource;
    const uniqueClients = clientesData ? Array.from(new Map(clientesData.map(item => [item.id, item])).values()) : [];
    setClientesCR(uniqueClients as ClienteCRCompleto[]);
  }, []);

  const buscarDadosIniciais = useCallback(async () => {
    if (!ownerId) return;
    setCarregandoDados(true);
    
    let currentModelo: DocumentoSocietarioModelo | null = null;
    let initialProprietarioId = ownerId;
    let initialValoresTags: Record<string, string> = {};
    let initialClienteId = '';
    
    if (documentoId) {
        const { data: doc, error } = await supabase.from('documentos_societarios_gerados').select('*').eq('id', documentoId).single();
        if (error || !doc) {
            showError('Documento para edição não encontrado.');
            navigate('/documentos-societarios', { replace: true });
            return;
        }
        setDocumentoInicial(doc);
        initialProprietarioId = doc.proprietario_id;
        initialClienteId = doc.cliente_id || '';
        initialValoresTags = doc.valores_tags_preenchidos || {};
        const { data: modeloData } = await supabase.from('modelos_societarios').select('*').eq('id', doc.modelo_id).single();
        currentModelo = modeloData as DocumentoSocietarioModelo;
    } else if (modeloId) {
        const { data: modeloData, error } = await supabase.from('modelos_societarios').select('*').eq('id', modeloId).single();
        if (error || !modeloData) {
            showError('Modelo não encontrado.');
            navigate('/documentos-societarios/modelos', { replace: true });
            return;
        }
        currentModelo = modeloData as DocumentoSocietarioModelo;
        initialValoresTags['{{CONTEUDO_PRINCIPAL}}'] = currentModelo.conteudo_template;
    }
    
    setModelo(currentModelo);

    if (isSupervisaoContext) {
        const { data: clientesData } = await supabase.from('tbl_clientes').select('id, nome').eq('aprovado', true).order('nome');
        const adminOption: EmpresaContrato = { id: ownerId, nome: 'Meus Documentos (Admin)' };
        setEmpresasContrato([adminOption, ...(clientesData as EmpresaContrato[] || [])]);
    }
    
    await fetchDependentData(initialProprietarioId);
    
    form.reset({
        titulo_documento: (documentoId ? (initialValoresTags?.titulo || '') : (currentModelo?.titulo || '')) || '',
        cliente_id: initialClienteId,
        proprietario_documento_id: initialProprietarioId,
        tipo_conteudo: currentModelo?.tipo_conteudo || 'html',
        valores_tags: initialValoresTags,
    });
    
    setCarregandoDados(false);
  }, [documentoId, modeloId, ownerId, isSupervisaoContext, navigate, fetchDependentData, form]);

  useEffect(() => {
    if (!carregandoSessao) {
      buscarDadosIniciais();
    }
  }, [carregandoSessao, buscarDadosIniciais]);
  
  useEffect(() => {
    if (proprietarioDocumentoId && !carregandoDados) {
      fetchDependentData(proprietarioDocumentoId);
    }
  }, [proprietarioDocumentoId, fetchDependentData, carregandoDados]);

  const allAvailableTags = useMemo(() => {
      const tagsNaoFinanceiras = TAGS_PADRAO.filter(t => !t.origem_dado?.startsWith('contas_receber'));
      const customTagsMap = tagsCustomizadas.reduce((acc, tag) => {
          acc[tag.nome_tag] = tag;
          return acc;
      }, {} as Record<string, any>);
      
      const combined = [...tagsNaoFinanceiras, ...tagsCustomizadas];
      
      return Array.from(new Set(combined.map(t => t.nome_tag)))
          .map(tagKey => customTagsMap[tagKey] || tagsNaoFinanceiras.find(t => t.nome_tag === tagKey))
          .filter((t): t is any => !!t)
          .sort((a, b) => a.nome_tag.localeCompare(b.nome_tag));
  }, [tagsCustomizadas]);

  const empresaLogadaMemo = useMemo(() => {
    if (!perfil) return null;
    const p = perfil as any;
    return {
        nome: p.nome, email: p.email, documento: p.documento || p.cnpj || p.cpf,
        cpf: p.cpf, cnpj: p.cnpj, rg: p.rg, telefone: p.telefone, cep: p.cep,
        endereco: p.endereco, numero: p.numero, complemento: p.complemento,
        bairro: p.bairro, cidade: p.cidade, estado: p.estado,
    };
  }, [perfil]);

  const clienteSelecionado = useMemo(() => 
      clientesCR.find((c: ClienteCRCompleto) => c.id === clienteSelecionadoId)
  , [clientesCR, clienteSelecionadoId]);

  useEffect(() => {
    const newTags: Record<string, string> = {};
    allAvailableTags.forEach(tag => {
        const tagKey = tag.nome_tag;
        let tagValue: string | null = null;
        if (tag.origem_dado) {
            const [sourceTable, sourceField] = tag.origem_dado.split('.');
            if ((sourceTable === 'tbl_clientes' || sourceTable === 'tbl_admins') && empresaLogadaMemo) {
                tagValue = (empresaLogadaMemo as any)[sourceField];
            } else if (sourceTable === 'clientes' && clienteSelecionado) {
                tagValue = (clienteSelecionado as any)[sourceField];
            }
        }
        newTags[tagKey] = tagValue || getValues('valores_tags')?.[tagKey] || '';
    });

    const currentContent = getValues('valores_tags')?.['{{CONTEUDO_PRINCIPAL}}'];
    newTags['{{CONTEUDO_PRINCIPAL}}'] = currentContent || modelo?.conteudo_template || '';

    setValue('valores_tags', newTags, { shouldDirty: false });
  }, [clienteSelecionado, empresaLogadaMemo, allAvailableTags, modelo, setValue, getValues]);
  
  // Efeito para monitorar a mudança do proprietário do documento (para recarregar clientes e tags)
  useEffect(() => {
      if (proprietarioDocumentoId) {
          fetchDependentData(proprietarioDocumentoId);
      }
  }, [proprietarioDocumentoId, fetchDependentData]);
  
  // Efeito para aplicar tags automáticas quando o cliente selecionado muda
  useEffect(() => {
      if (clienteSelecionadoId && modelo && !carregandoDados) {
          // Aplica as tags automáticas (mantendo as tags manuais)
          applyTagsToForm(getValues('valores_tags') || {}, clienteSelecionado, empresaLogada, modelo.conteudo_template);
      }
  // mantive dependências essenciais apenas
  }, [clienteSelecionadoId, modelo, carregandoDados, clienteSelecionado, empresaLogada, applyTagsToForm, getValues]);


  useEffect(() => {
    if (!carregandoSessao && ownerIdLogado) {
      buscarDados();
    } else if (!carregandoSessao && !isAdmin && !isClient) {
        navigate('/painel', { replace: true });
    }
  }, [carregandoSessao, ownerIdLogado, buscarDados, navigate, isAdmin, isClient]);

  const handleTagChange = (tag: string, value: string) => {
    const currentTags = getValues('valores_tags') || {};
    setValue('valores_tags', { ...currentTags, [tag]: value }, { shouldDirty: true });
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
      
      // O conteúdo principal é o valor da tag {{CONTEUDO_PRINCIPAL}} ou o template original
      const templateToRender = valoresTags['{{CONTEUDO_PRINCIPAL}}'] || modelo.conteudo_template;
      
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