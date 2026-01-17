// src/pages/GerarDocumentoSocietario.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileSignature, ChevronLeft, Save, Eye, Building2, Info, Tag } from 'lucide-react';
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
    conteudo_principal_manual: z.string().optional(), // Nome limpo para o campo de texto
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
  const [dadosEmpresaProprietaria, setDadosEmpresaProprietaria] = useState<any>(null);
  
  const isEditing = !!documentoId;
  const modeloId = modeloIdParam;

  const isAdmin = role === 'Admin';
  const isClient = role === 'Cliente';
  const isAdminUsuario = role === 'Usuario' && !!(perfil as any)?.admin_id;
  
  const getOwnerIdLogado = () => {
    if (isAdmin) return usuario?.id || null;
    if (isClient) return (perfil as ClienteProfile)?.id;
    if (isAdminUsuario) return (perfil as any).admin_id;
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
        conteudo_principal_manual: '',
    },
  });
  
  const { watch, setValue, getValues } = form;
  
  const clienteSelecionadoId = watch('cliente_id');
  const proprietarioDocumentoId = watch('proprietario_documento_id');
  const tituloDocumento = watch('titulo_documento');
  const valoresTags = watch('valores_tags') || {};
  const conteudoPrincipalManual = watch('conteudo_principal_manual') || '';

  const clienteSelecionado = useMemo(() => {
      return clientesCR.find((c: ClienteCRCompleto) => c.id === clienteSelecionadoId);
  }, [clientesCR, clienteSelecionadoId]);

  const fetchEmpresaProprietaria = useCallback(async (id: string) => {
      const { data, error } = await supabase
          .from('tbl_admins')
          .select('*')
          .eq('id', id)
          .single();
          
      if (data && !error) {
          setDadosEmpresaProprietaria(data);
      } else {
          const { data: clientData } = await supabase
              .from('tbl_clientes')
              .select('*')
              .eq('id', id)
              .single();
          setDadosEmpresaProprietaria(clientData || null);
      }
  }, []);

  useEffect(() => {
      if (proprietarioDocumentoId) {
          fetchEmpresaProprietaria(proprietarioDocumentoId);
      }
  }, [proprietarioDocumentoId, fetchEmpresaProprietaria]);

  const allAvailableTags = useMemo(() => {
      const tagsNaoFinanceiras = TAGS_PADRAO.filter(t => !t.origem_dado?.startsWith('contas_receber'));
      const combined = [...tagsNaoFinanceiras, ...tagsCustomizadas];
      
      return Array.from(new Set(combined.map(t => t.nome_tag)))
          .map(tagKey => combined.find(t => t.nome_tag === tagKey))
          .filter((t): t is any => !!t)
          .sort((a, b) => a.nome_tag.localeCompare(b.nome_tag));
  }, [tagsCustomizadas]);

  const applyTagsToForm = useCallback((
      currentTags: Record<string, string>, 
      cliente: ClienteCRCompleto | undefined, 
      empresa: any
  ) => {
      const newTags: Record<string, string> = { ...currentTags };
      
      allAvailableTags.forEach(tag => {
          const tagKey = tag.nome_tag;
          let tagValue: string | null = null;
          
          if (tag.origem_dado) {
              const parts = tag.origem_dado.split('.');
              const sourceField = parts[parts.length - 1]; 
              
              if (tagKey.startsWith('{{EMPRESA_') && empresa) {
                  tagValue = empresa[sourceField] || null;
              } 
              else if (tagKey.startsWith('{{CLIENTE_') && cliente) {
                  tagValue = (cliente as any)[sourceField] || null;
                  if (!tagValue && sourceField === 'documento') tagValue = cliente.cnpj || cliente.cpf || null;
              } 
          }
          
          if (tagValue !== null && tagValue !== undefined && tagValue !== 'N/A' && tagValue !== '') {
              newTags[tagKey] = String(tagValue);
          }
      });
      
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
        setTagsCustomizadas(tagsData);
    }
    
    const { data: clientesSistemaData } = await supabase
        .from('tbl_clientes')
        .select('*')
        .eq('admin_id', targetEmpresaId)
        .eq('aprovado', true)
        .neq('id', targetEmpresaId);
        
    const { data: clientesCRData } = await supabase
        .from('clientes')
        .select('*')
        .eq('proprietario_id', targetEmpresaId);
        
    const combinedClientsMap = new Map<string, ClienteCRCompleto>();
    
    (clientesSistemaData || []).forEach(c => {
        combinedClientsMap.set(c.id, { ...c } as ClienteCRCompleto);
    });
    
    (clientesCRData || []).forEach(c => {
        if (!combinedClientsMap.has(c.id)) {
            combinedClientsMap.set(c.id, { ...c } as ClienteCRCompleto);
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
    
    let initialProprietarioId = ownerIdLogado;
    let currentModelo: DocumentoSocietarioModelo | null = null;
    let initialValoresTags: Record<string, string> = {};
    let initialClienteId = '';
    let initialConteudoPrincipal = '';
    
    if (documentoId) {
        const { data: doc, error: docLoadError } = await supabase
            .from('documentos_societarios_gerados')
            .select('*')
            .eq('id', documentoId)
            .single();
            
        if (docLoadError) {
            showError('Documento não encontrado.');
            navigate('/documentos-societarios');
            return;
        }
        
        initialProprietarioId = doc.proprietario_id;
        initialClienteId = doc.cliente_id || '';
        initialValoresTags = doc.valores_tags_preenchidos || {};
        initialConteudoPrincipal = initialValoresTags['{{CONTEUDO_PRINCIPAL}}'] || '';
        
        const { data: modeloData } = await supabase
            .from('modelos_societarios')
            .select('*')
            .eq('id', doc.modelo_id)
            .single();
        currentModelo = modeloData as DocumentoSocietarioModelo;
        
    } else if (modeloId) {
        const { data: modeloData, error: modeloError } = await supabase
            .from('modelos_societarios')
            .select('*')
            .eq('id', modeloId)
            .single();
            
        if (modeloError) {
            showError('Modelo não encontrado.');
            navigate('/documentos-societarios');
            return;
        }
        currentModelo = modeloData as DocumentoSocietarioModelo;
        initialConteudoPrincipal = currentModelo.conteudo_template;
    }
    
    setModelo(currentModelo);
    
    if (isAdmin || isAdminUsuario) {
        const { data: clientsData } = await supabase
            .from('tbl_clientes')
            .select('id, nome')
            .eq('admin_id', ownerIdLogado)
            .eq('aprovado', true)
            .order('nome');
            
        const adminOption: EmpresaContrato = { id: ownerIdLogado, nome: 'Minha Empresa (Admin)' };
        setEmpresasContrato([adminOption, ...(clientsData || [])]);
    }
    
    await fetchDependentData(initialProprietarioId || ownerIdLogado);
    
    form.reset({
        titulo_documento: (documentoId ? (initialValoresTags?.titulo || '') : (currentModelo?.titulo || '')) || '',
        cliente_id: initialClienteId,
        proprietario_documento_id: initialProprietarioId || '',
        tipo_conteudo: 'html',
        valores_tags: initialValoresTags,
        conteudo_principal_manual: initialConteudoPrincipal,
    });
    
    setCarregandoDados(false);
  }, [modeloId, documentoId, ownerIdLogado, navigate, isAdmin, isAdminUsuario, form, fetchDependentData]);

  useEffect(() => {
    if (!carregandoSessao && ownerIdLogado) {
      buscarDados();
    }
  }, [carregandoSessao, ownerIdLogado, buscarDados]);

  useEffect(() => {
      if (clienteSelecionadoId && modelo && !carregandoDados) {
          applyTagsToForm(getValues('valores_tags') || {}, clienteSelecionado, dadosEmpresaProprietaria);
      }
  }, [clienteSelecionadoId, proprietarioDocumentoId, modelo, carregandoDados, clienteSelecionado, dadosEmpresaProprietaria, applyTagsToForm, getValues]);


  const handleTagChange = (tag: string, value: string) => {
    const currentTags = getValues('valores_tags') || {};
    setValue('valores_tags', { ...currentTags, [tag]: value }, { shouldDirty: true });
  };
  
  const renderizarConteudo = (template: string, tags: Record<string, string>): string => {
    let html = template;
    Object.keys(tags).forEach(tagKey => {
        if (tagKey === '{{CONTEUDO_PRINCIPAL}}') return; // Ignora o conteúdo base na substituição de tags
        const regex = new RegExp(tagKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        html = html.replace(regex, tags[tagKey] || '');
    });
    return html;
  };
  
  const handlePreview = () => {
      if (!modelo) return;
      const templateToRender = conteudoPrincipalManual || modelo.conteudo_template;
      const finalHtml = renderizarConteudo(templateToRender, valoresTags);
      setConteudoPreview(finalHtml);
      setPreviewTitle(tituloDocumento || modelo.titulo);
      setPreviewOpen(true);
  };

  const handleSalvarDocumento = async (status: DocumentoStatus) => {
    const values = getValues();
    if (!modelo || !values.cliente_id || !values.titulo_documento || !values.proprietario_documento_id) {
        showError('Preencha o Título, o Cliente e a Empresa Proprietária.');
        return;
    }
    
    setIsSubmitting(true);
    try {
        const templateToRender = values.conteudo_principal_manual || modelo.conteudo_template;
        const conteudoRenderizado = renderizarConteudo(templateToRender, values.valores_tags || {});
        
        const payload = {
            modelo_id: modelo.id,
            cliente_id: values.cliente_id,
            proprietario_id: values.proprietario_documento_id,
            status: status,
            valores_tags_preenchidos: { 
                ...values.valores_tags, 
                titulo: values.titulo_documento,
                '{{CONTEUDO_PRINCIPAL}}': sanitizeConteudo(values.conteudo_principal_manual || ''),
            },
            conteudo_renderizado: conteudoRenderizado,
            data_registro: format(new Date(), 'yyyy-MM-dd'),
        };

        if (isEditing && documentoId) {
            const { error } = await supabase.from('documentos_societarios_gerados').update(payload).eq('id', documentoId);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('documentos_societarios_gerados').insert(payload);
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

  if (carregandoSessao || carregandoDados) {
    return <LayoutPrincipal><div className="flex justify-center p-20"><Loader2 className="animate-spin" /></div></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
       <div className="flex items-center mb-6 w-full">
        <Button onClick={() => navigate('/documentos-societarios')} variant="link" type="button" className="text-muted-foreground hover:text-primary flex items-center mr-4 p-0 h-auto">
            <ChevronLeft className="w-5 h-5" /> Voltar
        </Button>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileSignature className="w-6 h-6 mr-2" /> {isEditing ? 'Editar Documento' : 'Gerar Documento'}: {modelo?.titulo}
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
          <form className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              <Card className="lg:col-span-1 h-fit">
                  <CardHeader><CardTitle className="text-xl">Configurações e Dados</CardTitle></CardHeader>
                  <CardContent className="space-y-6">
                      {isAdmin || isAdminUsuario ? (
                          <FormField control={form.control} name="proprietario_documento_id" render={({ field }) => (
                              <FormItem className="space-y-2">
                                  <FormLabel>Empresa Proprietária (Seu Escritório)</FormLabel>
                                  <Select value={field.value || ''} onValueChange={field.onChange}>
                                      <FormControl>
                                          <SelectTrigger>
                                              <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                                              <SelectValue placeholder="Selecione a Empresa" />
                                          </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>{empresasContrato.map((e) => (<SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>))}</SelectContent>
                                  </Select>
                                  <FormMessage />
                              </FormItem>
                          )} />
                      ) : null}
                      
                      <FormField control={form.control} name="titulo_documento" render={({ field }) => (
                          <FormItem className="space-y-2">
                              <FormLabel>Título do Documento</FormLabel>
                              <FormControl><Input placeholder="Ex: Ata de Eleição" {...field} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )} />

                      <FormField control={form.control} name="cliente_id" render={({ field }) => (
                          <FormItem className="space-y-2">
                              <FormLabel>Cliente (Sendo Documentado)</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange} disabled={!proprietarioDocumentoId}>
                                  <FormControl>
                                      <SelectTrigger>
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
                              <p className="text-[10px] text-muted-foreground mt-1">
                                <Info className="w-3 h-3 inline mr-1" /> 
                                {"Use tags {{CLIENTE_...}} para preencher dados desta empresa."}
                              </p>
                          </FormItem>
                      )} />
                      
                      <Separator />
                      
                      <div className="space-y-4">
                          <h3 className="font-semibold text-lg flex items-center gap-2">
                              <Tag className="w-4 h-4" /> Tags Pendentes
                          </h3>
                          <p className="text-xs text-muted-foreground">Preencha manualmente as tags não encontradas no cadastro.</p>
                          {allAvailableTags.filter(t => t.nome_tag !== '{{CONTEUDO_PRINCIPAL}}' && !valoresTags[t.nome_tag]).length === 0 ? (
                              <p className="text-muted-foreground text-sm italic">Nenhuma tag manual pendente.</p>
                          ) : (
                              allAvailableTags.filter(t => t.nome_tag !== '{{CONTEUDO_PRINCIPAL}}' && !valoresTags[t.nome_tag]).map(tag => (
                                  <div key={tag.nome_tag} className="space-y-1">
                                      <Label className="text-xs font-semibold">{tag.nome_tag}</Label>
                                      <Input 
                                          placeholder={`Insira o valor para ${tag.descricao}`} 
                                          value={valoresTags[tag.nome_tag] || ''} 
                                          onChange={(e) => handleTagChange(tag.nome_tag, e.target.value)} 
                                      />
                                  </div>
                              ))
                          )}
                      </div>
                  </CardContent>
              </Card>
              
              <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-xl">Conteúdo do Documento</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                      <FormField control={form.control} name="conteudo_principal_manual" render={({ field }) => (
                              <FormItem>
                                  <FormLabel>Edite o Conteúdo Base</FormLabel>
                                  <FormControl><Textarea placeholder="Edite o conteúdo aqui..." {...field} rows={15} className="font-mono text-sm" /></FormControl>
                                  <FormMessage />
                              </FormItem>
                          )}
                      />
                      <Separator />
                      <div className="space-y-2">
                          <Label>Prévia Renderizada</Label>
                          <div className="border rounded-md p-4 bg-white text-zinc-900 shadow-inner max-h-[400px] overflow-y-auto">
                              {conteudoPrincipalManual ? (
                                  <div 
                                      className="ql-editor"
                                      dangerouslySetInnerHTML={{ __html: renderizarConteudo(conteudoPrincipalManual, valoresTags) }} 
                                  />
                              ) : (
                                  <p className="text-muted-foreground italic text-center py-10">Selecione um cliente para processar as tags.</p>
                              )}
                          </div>
                      </div>
                  </CardContent>
              </Card>
            </div>
          </form>
        </Form>
      </FormProvider>
      <DocumentoPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} conteudoHtml={conteudoPreview} titulo={previewTitle} isHtml={true} />
    </LayoutPrincipal>
  );
};

export default GerarDocumentoSocietario;