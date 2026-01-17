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
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  
  const [modelo, setModelo] = useState<DocumentoSocietarioModelo | null>(null);
  const [clientesCR, setClientesCR] = useState<ClienteCRCompleto[]>([]);
  const [tagsCustomizadas, setTagsCustomizadas] = useState<any[]>([]);
  
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [previewOpen, setPreviewOpen] = useState(false);
  const [conteudoPreview, setConteudoPreview] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  
  const [empresasContrato, setEmpresasContrato] = useState<EmpresaContrato[]>([]);
  const [empresaLogada, setEmpresaLogada] = useState<any>(null);
  
  const isEditing = !!documentoId;
  const modeloId = modeloIdParam;

  const isAdmin = role === 'Admin';
  const isClient = role === 'Cliente';
  
  const getOwnerIdLogado = () => {
    if (isAdmin) return usuario?.id || null;
    if (isClient) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') {
      const user = perfil as UsuarioProfile | AdminUsuarioProfile;
      if ('admin_id' in user && user.admin_id) return user.admin_id;
      if ('cliente_id' in user && user.cliente_id) return user.cliente_id;
    }
    return null;
  };
  
  const ownerIdLogado = getOwnerIdLogado();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
        titulo_documento: '',
        cliente_id: '',
        proprietario_documento_id: '',
        tipo_conteudo: 'html',
        valores_tags: {},
    },
  });
  
  const { watch, setValue, getValues } = form;
  
  const clienteSelecionadoId = watch('cliente_id');
  const proprietarioDocumentoId = watch('proprietario_documento_id');
  const tituloDocumento = watch('titulo_documento');
  const tipoConteudo = watch('tipo_conteudo');
  const valoresTags = watch('valores_tags') || {};

  const clienteSelecionado = useMemo(() => {
      return clientesCR.find((c: ClienteCRCompleto) => c.id === clienteSelecionadoId);
  }, [clientesCR, clienteSelecionadoId]);

  const empresaLogadaMemo = useMemo(() => {
    if (!perfil) return null;
    const profile = perfil as AdminProfile | ClienteProfile;
    
    return {
        nome: profile.nome, 
        email: profile.email, 
        documento: (profile as any).documento || (profile as any).cnpj || (profile as any).cpf,
        cpf: (profile as any).cpf, 
        cnpj: (profile as any).cnpj, 
        rg: (profile as any).rg, 
        telefone: (profile as any).telefone,
        cep: (profile as any).cep, 
        endereco: (profile as any).endereco, 
        numero: (profile as any).numero, 
        complemento: (profile as any).complemento,
        bairro: (profile as any).bairro, 
        cidade: (profile as any).cidade, 
        estado: (profile as any).estado,
    };
  }, [perfil]);

  const allAvailableTags = useMemo(() => {
      const tagsNaoFinanceiras = TAGS_PADRAO.filter(t => !t.origem_dado?.startsWith('contas_receber'));
      
      const customTagsMap = tagsCustomizadas.reduce((acc, tag) => {
          acc[tag.nome_tag] = tag;
          return acc;
      }, {} as Record<string, any>);
      
      const combined = [...tagsNaoFinanceiras, ...tagsCustomizadas];
      
      const uniqueTags = Array.from(new Set(combined.map(t => t.nome_tag)))
          .map(tagKey => {
              const customTag = customTagsMap[tagKey];
              const defaultTag = tagsNaoFinanceiras.find(t => t.nome_tag === tagKey);
              return customTag || defaultTag;
          })
          .filter((t): t is any => !!t)
          .sort((a, b) => a.nome_tag.localeCompare(b.nome_tag));
          
      return uniqueTags;
  }, [tagsCustomizadas]);

  const applyTagsToForm = useCallback((
      currentTags: Record<string, string>, 
      cliente: ClienteCRCompleto | undefined, 
      empresa: any, 
      modeloTemplate: string
  ) => {
      const newTags: Record<string, string> = {};
      
      allAvailableTags.forEach(tag => {
          const tagKey = tag.nome_tag;
          let tagValue: string | null = null;
          
          if (tag.origem_dado) {
              const [sourceTable, sourceField] = tag.origem_dado.split('.');
              
              // Lógica de mapeamento flexível: busca nos dados da empresa ou do cliente conforme o prefixo da tag
              if (tagKey.startsWith('{{EMPRESA_') && empresa) {
                  tagValue = empresa[sourceField] || null;
              } 
              else if (tagKey.startsWith('{{CLIENTE_') && cliente) {
                  tagValue = (cliente as any)[sourceField] || null;
              } 
          }
          
          if (tagValue !== null && tagValue !== undefined && tagValue !== 'N/A' && tagValue !== '') {
              newTags[tagKey] = String(tagValue);
          } else {
              newTags[tagKey] = currentTags[tagKey] || '';
          }
      });
      
      newTags['{{CONTEUDO_PRINCIPAL}}'] = currentTags['{{CONTEUDO_PRINCIPAL}}'] || modeloTemplate || '';
      setValue('valores_tags', newTags, { shouldDirty: true });
  }, [allAvailableTags, setValue]);
  
  const fetchDependentData = useCallback(async (targetEmpresaId: string) => {
    if (!targetEmpresaId || !ownerIdLogado) return;
    
    const { data: tagsData } = await supabase
        .from('contrato_tags')
        .select('*')
        .eq('empresa_id', targetEmpresaId)
        .order('nome_tag', { ascending: true });
        
    if (tagsData) {
        const tagsNaoFinanceiras = TAGS_PADRAO.filter(t => !t.origem_dado?.startsWith('contas_receber'));
        const allTags = [...tagsNaoFinanceiras, ...tagsData]
            .filter((t, index, self) => index === self.findIndex((t2) => t2.nome_tag === t.nome_tag))
            .sort((a, b) => a.nome_tag.localeCompare(b.nome_tag));
        setTagsCustomizadas(allTags);
    }
    
    let queryClients = supabase
        .from('tbl_clientes')
        .select('*')
        .eq('admin_id', targetEmpresaId)
        .eq('aprovado', true)
        .neq('id', targetEmpresaId);
        
    const { data: clientesSistemaData } = await queryClients;
    
    const { data: clientesCRData } = await supabase
        .from('clientes')
        .select('*')
        .eq('proprietario_id', targetEmpresaId);
        
    const combinedClientsMap = new Map<string, ClienteCRCompleto>();
    
    (clientesSistemaData || []).forEach(c => {
        combinedClientsMap.set(c.id, { ...c, proprietario_id: targetEmpresaId } as ClienteCRCompleto);
    });
    
    (clientesCRData || []).forEach(c => {
        if (!combinedClientsMap.has(c.id)) {
            combinedClientsMap.set(c.id, { ...c, proprietario_id: targetEmpresaId } as ClienteCRCompleto);
        }
    });
    
    const sortedClients = Array.from(combinedClientsMap.values()).sort((a, b) => {
        const nameA = (a.razao_social || a.nome).toLowerCase();
        const nameB = (b.razao_social || b.nome).toLowerCase();
        return nameA.localeCompare(nameB);
    });
        
    setClientesCR(sortedClients);
    
  }, [ownerIdLogado]);


  const buscarDados = useCallback(async () => {
    if ((!modeloId && !documentoId) || !ownerIdLogado) {
        setCarregandoDados(false);
        return;
    }
    
    setCarregandoDados(true);
    
    let initialProprietarioDocumentoId = ownerIdLogado;
    let currentModelo: DocumentoSocietarioModelo | null = null;
    let initialValoresTags: Record<string, string> = {};
    let initialClienteId = '';
    
    if (documentoId) {
        const { data: doc, error: docLoadError } = await supabase
            .from('documentos_societarios_gerados')
            .select('*, modelos_societarios(tipo_conteudo)')
            .eq('id', documentoId)
            .single();
            
        if (docLoadError) {
            showError('Documento para edição não encontrado.');
            navigate('/documentos-societarios', { replace: true });
            return;
        }
        
        const documento = doc as DocumentoSocietarioGerado & { modelos_societarios: { tipo_conteudo: TipoConteudo } | null };
        initialProprietarioDocumentoId = documento.proprietario_id;
        initialClienteId = documento.cliente_id || '';
        initialValoresTags = documento.valores_tags_preenchidos || {};
        
        const { data: modeloData } = await supabase
            .from('modelos_societarios')
            .select('*, tipo_conteudo')
            .eq('id', documento.modelo_id)
            .single();
        currentModelo = modeloData as DocumentoSocietarioModelo;
        
    } else if (modeloId) {
        const { data: modeloData, error: modeloError } = await supabase
            .from('modelos_societarios')
            .select('*, tipo_conteudo')
            .eq('id', modeloId)
            .single();
            
        if (modeloError) {
            showError('Modelo não encontrado.');
            navigate('/documentos-societarios', { replace: true });
            return;
        }
        currentModelo = modeloData as DocumentoSocietarioModelo;
        initialValoresTags['{{CONTEUDO_PRINCIPAL}}'] = currentModelo.conteudo_template;
    }
    
    setModelo(currentModelo);
    
    let empresasContratoList: EmpresaContrato[] = [];
    if (isAdmin) {
        const { data: clientesData } = await supabase
            .from('tbl_clientes')
            .select('id, nome')
            .eq('aprovado', true)
            .order('nome');
            
        if (clientesData) {
            const adminOption: EmpresaContrato = { id: ownerIdLogado, nome: 'Meus Documentos (Admin)' };
            empresasContratoList = [adminOption, ...(clientesData as EmpresaContrato[])];
            if (!documentoId) initialProprietarioDocumentoId = empresasContratoList[0].id;
        }
    }
    setEmpresasContrato(empresasContratoList);
    
    await fetchDependentData(initialProprietarioDocumentoId || ownerIdLogado);
    
    form.reset({
        titulo_documento: (documentoId ? (initialValoresTags?.titulo || '') : (currentModelo?.titulo || '')) || '',
        cliente_id: initialClienteId,
        proprietario_documento_id: initialProprietarioDocumentoId || '',
        tipo_conteudo: currentModelo?.tipo_conteudo || 'html',
        valores_tags: initialValoresTags,
    });
    
    setEmpresaLogada(empresaLogadaMemo);
    setCarregandoDados(false);
    
  }, [modeloId, documentoId, ownerIdLogado, navigate, isAdmin, isClient, empresaLogadaMemo, form, fetchDependentData]);
  
  useEffect(() => {
      if (proprietarioDocumentoId) {
          fetchDependentData(proprietarioDocumentoId);
      }
  }, [proprietarioDocumentoId, fetchDependentData]);
  
  useEffect(() => {
      if (clienteSelecionadoId && modelo && !carregandoDados) {
          applyTagsToForm(getValues('valores_tags') || {}, clienteSelecionado, empresaLogada, modelo.conteudo_template);
      }
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
    Object.keys(tags).forEach(tagKey => {
        const regex = new RegExp(tagKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        conteudoRenderizado = conteudoRenderizado.replace(regex, tags[tagKey] || '');
    });
    return conteudoRenderizado;
  };
  
  const handlePreview = () => {
      if (!modelo) return;
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
        const clienteSelecionado = clientesCR.find(c => c.id === values.cliente_id);
        if (!clienteSelecionado) throw new Error('Cliente selecionado não encontrado.');
        const conteudoRenderizado = renderizarConteudo(modelo.conteudo_template, values.valores_tags || {});
        const documentoPayload = {
            modelo_id: modelo.id,
            cliente_id: values.cliente_id,
            proprietario_id: values.proprietario_documento_id,
            status: status,
            valores_tags_preenchidos: { 
                ...values.valores_tags, 
                titulo: values.titulo_documento, 
                tipo_conteudo: values.tipo_conteudo,
                '{{CONTEUDO_PRINCIPAL}}': sanitizeConteudo(values.valores_tags?.['{{CONTEUDO_PRINCIPAL}}'] || ''),
            },
            conteudo_renderizado: conteudoRenderizado,
            data_registro: format(new Date(), 'yyyy-MM-dd'),
        };
        if (isEditing && documentoId) {
            const { error } = await supabase.from('documentos_societarios_gerados').update(documentoPayload).eq('id', documentoId);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('documentos_societarios_gerados').insert(documentoPayload);
            if (error) throw error;
        }
        showSuccess(`Documento salvo com sucesso!`);
        navigate('/documentos-societarios');
    } catch (error: any) {
        showError('Falha ao salvar documento: ' + error.message);
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const tagsParaPreenchimentoManual = useMemo(() => {
    return allAvailableTags.filter(tag => {
        const tagKey = tag.nome_tag;
        if (tagKey === '{{CONTEUDO_PRINCIPAL}}') return false;
        
        // Se a tag já tem valor (preenchido automaticamente ou manualmente), não mostra na lista de "manuais pendentes"
        if (valoresTags[tagKey] && valoresTags[tagKey] !== '') return false;
        
        return true;
    }).map(tag => tag.nome_tag);
  }, [allAvailableTags, valoresTags]);

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
        <Button onClick={() => navigate('/documentos-societarios')} variant="link" type="button" className="text-muted-foreground hover:text-primary flex items-center mr-4 p-0 h-auto">
            <ChevronLeft className="w-5 h-5" /> Voltar
        </Button>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileSignature className="w-6 h-6 mr-2" /> {isEditing ? 'Editar Documento' : 'Gerar Documento'}: {modelo.titulo}
        </h1>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <Button onClick={handlePreview} variant="outline" className="flex-1 h-12" disabled={!modelo || !clienteSelecionadoId}>
              <Eye className="mr-2 h-4 w-4" /> Pré-visualizar Documento
          </Button>
          <Button onClick={() => handleSalvarDocumento('finalizado')} className="flex-1 h-12" disabled={isSubmitting || !clienteSelecionadoId}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} {isEditing ? 'Salvar Alterações' : 'Gerar Documento'}
          </Button>
      </div>
      
      <FormProvider {...form}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(() => handleSalvarDocumento('finalizado'))} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              <Card className="lg:col-span-1 h-fit">
                  <CardHeader><CardTitle className="text-xl">Dados e Tags</CardTitle></CardHeader>
                  <CardContent className="space-y-6">
                      {isAdmin && (
                          <FormField control={form.control} name="proprietario_documento_id" render={({ field }) => (
                              <FormItem className="space-y-2">
                                  <FormLabel htmlFor="empresa-documento">Empresa Proprietária</FormLabel>
                                  <Select value={field.value || ''} onValueChange={field.onChange}>
                                      <FormControl>
                                          <SelectTrigger id="empresa-documento">
                                              <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                                              <SelectValue placeholder="Selecione a Empresa" />
                                          </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>{empresasContrato.map((e) => (<SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>))}</SelectContent>
                                  </Select>
                                  <FormMessage />
                              </FormItem>
                          )} />
                      )}
                      <FormField control={form.control} name="titulo_documento" render={({ field }) => (
                          <FormItem className="space-y-2">
                              <FormLabel htmlFor="titulo-documento">Título do Documento</FormLabel>
                              <FormControl><Input id="titulo-documento" placeholder={modelo.titulo} {...field} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )} />
                      <FormField control={form.control} name="cliente_id" render={({ field }) => (
                          <FormItem className="space-y-2">
                              <FormLabel htmlFor="cliente">Cliente (Sendo Documentado)</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange} disabled={!proprietarioDocumentoId}>
                                  <FormControl>
                                      <SelectTrigger id="cliente">
                                          <SelectValue placeholder="Selecione o Cliente" />
                                      </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                      {clientesCR.map(c => (
                                          <SelectItem key={c.id} value={c.id}>
                                              {c.razao_social || c.nome}
                                          </SelectItem>
                                      ))}
                                  </SelectContent>
                              </Select>
                              <FormMessage />
                              <p className="text-[10px] text-muted-foreground mt-1">Dica: Use tags {{'{{CLIENTE_...}}'}} para os dados deste cliente.</p>
                          </FormItem>
                      )} />
                      <Separator />
                      <div className="space-y-4">
                          <h3 className="font-semibold text-lg">Tags Pendentes</h3>
                          <p className="text-xs text-muted-foreground">Preencha os valores para as tags que não foram encontradas automaticamente.</p>
                          {tagsParaPreenchimentoManual.length === 0 ? (<p className="text-muted-foreground text-sm italic">Nenhuma tag manual pendente.</p>) : (
                              tagsParaPreenchimentoManual.map(tagKey => (
                                  <FormField key={tagKey} control={form.control} name={`valores_tags.${tagKey}`} render={({ field }) => (
                                          <FormItem className="space-y-1">
                                              <FormLabel htmlFor={tagKey} className="font-semibold text-xs">{tagKey}</FormLabel>
                                              <FormControl><Input id={tagKey} placeholder={`Insira o valor`} {...field} value={field.value || ''} onChange={(e) => handleTagChange(tagKey, e.target.value)} /></FormControl>
                                              <FormMessage />
                                          </FormItem>
                                      )}
                                  />
                              ))
                          )}
                      </div>
                  </CardContent>
              </Card>
              
              <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-xl">Conteúdo do Documento</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                      <FormField control={form.control} name={`valores_tags.{{CONTEUDO_PRINCIPAL}}`} render={({ field }) => (
                              <FormItem>
                                  <FormLabel>Conteúdo Principal (Editável)</FormLabel>
                                  <FormControl><Textarea placeholder="Edite o conteúdo..." {...field} rows={15} className="font-mono text-sm" /></FormControl>
                                  <FormMessage />
                              </FormItem>
                          )}
                      />
                      <Separator />
                      <div className="space-y-2">
                          <Label>Prévia Renderizada</Label>
                          <div className="border rounded-md p-4 bg-white text-zinc-900 shadow-inner max-h-[400px] overflow-y-auto">
                              {templateContent ? (
                                  <div 
                                      className="ql-editor"
                                      dangerouslySetInnerHTML={{ __html: renderizarConteudo(templateContent, valoresTags) }} 
                                  />
                              ) : (
                                  <p className="text-muted-foreground italic">Selecione um cliente para ver a prévia.</p>
                              )}
                          </div>
                      </div>
                  </CardContent>
              </Card>
              
            </div>
            <Button type="submit" className="w-full h-12 text-lg" disabled={isSubmitting || !clienteSelecionadoId}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} {isEditing ? 'Salvar Alterações' : 'Gerar Documento'}
            </Button>
          </form>
        </Form>
      </FormProvider>
      <DocumentoPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} conteudoHtml={conteudoPreview} titulo={previewTitle} isHtml={tipoConteudo === 'html'} />
    </LayoutPrincipal>
  );
};

export default GerarDocumentoSocietario;