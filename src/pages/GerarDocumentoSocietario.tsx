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
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  
  const [modelo, setModelo] = useState<DocumentoSocietarioModelo | null>(null);
  const [clientesCR, setClientesCR] = useState<ClienteCRCompleto[]>([]);
  const [tagsCustomizadas, setTagsCustomizadas] = useState<any[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [documentoInicial, setDocumentoInicial] = useState<DocumentoSocietarioGerado | null>(null);
  
  const [previewOpen, setPreviewOpen] = useState(false);
  const [conteudoPreview, setConteudoPreview] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  
  const [empresasContrato, setEmpresasContrato] = useState<EmpresaContrato[]>([]);
  const [empresaLogada, setEmpresaLogada] = useState<any>(null);
  
  const isEditing = !!documentoId;
  const modeloId = modeloIdParam || documentoInicial?.modelo_id;

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
  }, [perfil, isAdmin]);

  // --- Lógica de Preenchimento de Tags ---
  const allAvailableTags = useMemo(() => {
      const tagsNaoFinanceiras = TAGS_PADRAO.filter(t => !t.origem_dado?.startsWith('contas_receber'));
      
      const combined = [...tagsNaoFinanceiras, ...tagsCustomizadas];
      const uniqueTags = Array.from(new Set(combined.map(t => t.nome_tag)))
          .map(tagKey => combined.find(t => t.nome_tag === tagKey))
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
      const newTags: Record<string, string> = { ...currentTags };
      
      allAvailableTags.forEach(tag => {
          const tagKey = tag.nome_tag;
          let tagValue: string | null = null;
          
          if (tag.origem_dado) {
              const [sourceTable, sourceField] = tag.origem_dado.split('.');
              if ((sourceTable === 'tbl_clientes' || sourceTable === 'tbl_admins') && empresa) {
                  tagValue = empresa[sourceField];
              } else if (sourceTable === 'clientes' && cliente) {
                  tagValue = (cliente as any)[sourceField];
              } 
          }
          
          if (tagValue) newTags[tagKey] = String(tagValue);
      });
      
      if (!newTags['{{CONTEUDO_PRINCIPAL}}']) newTags['{{CONTEUDO_PRINCIPAL}}'] = modeloTemplate || '';
      setValue('valores_tags', newTags, { shouldDirty: true });
  }, [allAvailableTags, setValue]);
  
  // --- FUNÇÃO DE BUSCA DE CLIENTES E TAGS DEPENDENTE DO PROPRIETÁRIO ---
  const fetchDependentData = useCallback(async (targetEmpresaId: string) => {
    if (!targetEmpresaId) return;
    
    const { data: tagsData } = await supabase.from('contrato_tags').select('*').eq('empresa_id', targetEmpresaId).order('nome_tag');
    if (tagsData) setTagsCustomizadas(tagsData);
    
    let finalClientList: any[] = [];
    const { data: adminCheck } = await supabase.from('tbl_admins').select('id').eq('id', targetEmpresaId).maybeSingle();
    const isTargetAdmin = !!adminCheck;

    if (isTargetAdmin) {
        const { data: dataSistema } = await supabase.from('tbl_clientes').select('id, nome, documento, email, telefone').eq('admin_id', targetEmpresaId).eq('aprovado', true).order('nome');
        finalClientList = dataSistema || [];
    } else {
        const { data: dataCR } = await supabase.from('clientes').select('id, nome, documento, email, telefone').eq('proprietario_id', targetEmpresaId).order('nome');
        finalClientList = dataCR || [];
    }
    setClientesCR(finalClientList);
  }, []);


  // --- FUNÇÃO PRINCIPAL DE BUSCA DE DADOS INICIAIS ---
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
    
    if (documentoId) {
        const { data: doc } = await supabase.from('documentos_societarios_gerados').select('*').eq('id', documentoId).single();
        if (doc) {
            setDocumentoInicial(doc);
            initialProprietarioId = doc.proprietario_id;
            initialClienteId = doc.cliente_id || '';
            initialValoresTags = doc.valores_tags_preenchidos || {};
            const { data: m } = await supabase.from('modelos_societarios').select('*').eq('id', doc.modelo_id).single();
            currentModelo = m as DocumentoSocietarioModelo;
        }
    } else if (modeloId) {
        const { data: m } = await supabase.from('modelos_societarios').select('*').eq('id', modeloId).single();
        currentModelo = m as DocumentoSocietarioModelo;
        initialValoresTags['{{CONTEUDO_PRINCIPAL}}'] = currentModelo?.conteudo_template || '';
    }
    
    setModelo(currentModelo);
    
    if (isAdmin && ownerIdLogado) {
        const { data } = await supabase.from('tbl_clientes').select('id, nome').eq('admin_id', ownerIdLogado).eq('aprovado', true).order('nome');
        const options = [{ id: ownerIdLogado, nome: 'Meus Documentos' }, ...(data || [])];
        setEmpresasContrato(options);
    }
    
    if (initialProprietarioId) await fetchDependentData(initialProprietarioId);
    
    form.reset({
        titulo_documento: (documentoId ? (initialValoresTags?.titulo || '') : (currentModelo?.titulo || '')) || '',
        cliente_id: initialClienteId,
        proprietario_documento_id: initialProprietarioId || '',
        tipo_conteudo: (currentModelo?.tipo_conteudo as TipoConteudo) || 'html',
        valores_tags: initialValoresTags,
    });
    
    setEmpresaLogada(empresaLogadaMemo);
    setCarregandoDados(false);
  }, [modeloId, documentoId, ownerIdLogado, isAdmin, empresaLogadaMemo, form, fetchDependentData]);
  
  useEffect(() => {
      if (proprietarioDocumentoId) fetchDependentData(proprietarioDocumentoId);
  }, [proprietarioDocumentoId, fetchDependentData]);
  
  useEffect(() => {
      if (clienteSelecionadoId && modelo && !carregandoDados) {
          applyTagsToForm(getValues('valores_tags') || {}, clienteSelecionado, empresaLogada, modelo.conteudo_template);
      }
  }, [clienteSelecionadoId, modelo, carregandoDados, clienteSelecionado, empresaLogada, applyTagsToForm, getValues]);


  useEffect(() => {
    if (!carregandoSessao && ownerIdLogado) buscarDados();
  }, [carregandoSessao, ownerIdLogado, buscarDados]);

  const handleTagChange = (tag: string, value: string) => {
    const currentTags = getValues('valores_tags') || {};
    setValue('valores_tags', { ...currentTags, [tag]: value }, { shouldDirty: true });
  };
  
  const handlePreview = () => {
      if (!modelo) return;
      const template = valoresTags['{{CONTEUDO_PRINCIPAL}}'] || modelo.conteudo_template;
      let rendered = template;
      Object.keys(valoresTags).forEach(tagKey => {
          const regex = new RegExp(tagKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          rendered = rendered.replace(regex, valoresTags[tagKey] || '');
      });
      setConteudoPreview(rendered);
      setPreviewTitle(tituloDocumento || modelo.titulo);
      setPreviewOpen(true);
  };

  const handleSalvarDocumento = async (status: DocumentoStatus) => {
    const values = getValues();
    if (!modelo || !values.cliente_id || !values.titulo_documento) {
        showError('Preencha os campos obrigatórios.');
        return;
    }
    
    setIsSubmitting(true);
    try {
        const template = values.valores_tags?.['{{CONTEUDO_PRINCIPAL}}'] || modelo.conteudo_template;
        let rendered = template;
        Object.keys(values.valores_tags || {}).forEach(tagKey => {
            const regex = new RegExp(tagKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            rendered = rendered.replace(regex, (values.valores_tags as any)[tagKey] || '');
        });

        const payload = {
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
            conteudo_renderizado: rendered,
            data_registro: format(new Date(), 'yyyy-MM-dd'),
        };
        
        if (isEditing && documentoInicial) {
            const { error } = await supabase.from('documentos_societarios_gerados').update(payload).eq('id', documentoInicial.id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('documentos_societarios_gerados').insert(payload);
            if (error) throw error;
        }
        showSuccess('Documento salvo!');
        navigate('/documentos-societarios');
    } catch (error: any) {
        showError('Falha ao salvar: ' + error.message);
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const tagsParaPreenchimentoManual = useMemo(() => {
    return allAvailableTags
        .filter(tag => !tag.nome_tag.startsWith('{{CLIENTE_') && !tag.nome_tag.startsWith('{{EMPRESA_') && !['{{CONTEUDO_PRINCIPAL}}'].includes(tag.nome_tag))
        .map(t => t.nome_tag);
  }, [allAvailableTags]);

  if (carregandoSessao || carregandoDados) return <LayoutPrincipal><div className="flex justify-center p-20"><Loader2 className="animate-spin" /></div></LayoutPrincipal>;
  if (!modelo) return <LayoutPrincipal><Card><CardContent>Modelo não encontrado.</CardContent></Card></LayoutPrincipal>;

  return (
    <LayoutPrincipal>
       <div className="flex items-center mb-6 w-full">
        <Button onClick={() => navigate('/documentos-societarios')} variant="link" className="text-muted-foreground p-0 h-auto mr-4">
            <ChevronLeft className="w-5 h-5" /> Voltar
        </Button>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileSignature className="w-6 h-6 mr-2" /> {isEditing ? 'Editar' : 'Gerar'} Documento: {modelo.titulo}
        </h1>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <Button onClick={handlePreview} variant="outline" className="flex-1 h-12" disabled={!clienteSelecionadoId}><Eye className="mr-2 h-4 w-4" /> Pré-visualizar</Button>
          <Button onClick={() => handleSalvarDocumento('finalizado')} className="flex-1 h-12" disabled={isSubmitting || !clienteSelecionadoId}>{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} {isEditing ? 'Salvar Alterações' : 'Gerar Documento'}</Button>
      </div>
      
      <FormProvider {...form}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(() => handleSalvarDocumento('finalizado'))} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-1 h-fit">
                  <CardHeader><CardTitle className="text-xl">Dados e Tags</CardTitle></CardHeader>
                  <CardContent className="space-y-6">
                      {isAdmin && (
                          <div className="space-y-2"><Label>Empresa Proprietária</Label>
                              <Select value={proprietarioDocumentoId} onValueChange={v => setValue('proprietario_documento_id', v)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{empresasContrato.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select>
                          </div>
                      )}
                      <div className="space-y-2"><Label>Título</Label><Input value={tituloDocumento} onChange={e => setValue('titulo_documento', e.target.value)} /></div>
                      <div className="space-y-2"><Label>Cliente</Label>
                          <Select value={clienteSelecionadoId} onValueChange={v => setValue('cliente_id', v)} disabled={!proprietarioDocumentoId}><SelectTrigger><SelectValue placeholder="Selecione o Cliente" /></SelectTrigger><SelectContent>{clientesCR.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select>
                      </div>
                      <Separator />
                      <div className="space-y-4">
                          <h3 className="font-semibold text-lg">Tags Manuais</h3>
                          {tagsParaPreenchimentoManual.map(tag => (
                              <div key={tag} className="space-y-1"><Label className="text-xs font-semibold">{tag}</Label><Input value={valoresTags[tag] || ''} onChange={e => handleTagChange(tag, e.target.value)} /></div>
                          ))}
                      </div>
                  </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-xl">Conteúdo</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                      <Textarea value={valoresTags['{{CONTEUDO_PRINCIPAL}}'] || ''} onChange={e => handleTagChange('{{CONTEUDO_PRINCIPAL}}', e.target.value)} rows={15} className="font-mono text-sm" />
                      <Separator />
                      <div className="space-y-2"><Label>Prévia Renderizada</Label>
                          <div className="border rounded-md p-4 bg-background max-h-[400px] overflow-y-auto" dangerouslySetInnerHTML={{ __html: conteudoPreview || 'Selecione os dados para ver a prévia.' }} />
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