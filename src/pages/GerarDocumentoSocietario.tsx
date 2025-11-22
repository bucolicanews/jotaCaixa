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

type TipoConteudo = 'html' | 'texto';

// FIX 224, 234, 47: Define status type locally
type DocumentoStatus = 'rascunho' | 'finalizado' | 'arquivado' | 'ativo';

interface ExtendedDocumentoSocietarioGerado extends DocumentoSocietarioGerado {
    titulo: string;
    status: DocumentoStatus;
}

interface ExtendedBlocoSocietario extends BlocoSocietario {
    conteudo_template: string;
}

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

// Cliente CR com todos os campos de tag
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
  
  const [valoresTags, setValoresTags] = useState<Record<string, string>>({});
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [previewOpen, setPreviewOpen] = useState(false);
  const [conteudoPreview, setConteudoPreview] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string>('');
  const [tituloDocumento, setTituloDocumento] = useState('');
  
  const [proprietarioDocumentoId, setProprietarioDocumentoId] = useState<string | null>(null); 
  const [empresasContrato, setEmpresasContrato] = useState<EmpresaContrato[]>([]);
  const [empresaLogada, setEmpresaLogada] = useState<EmpresaLogada | null>(null);
  const [tipoConteudo, setTipoConteudo] = useState<TipoConteudo>('html'); 
  
  // FIX 39, 40, 41, 42, 43, 44, 45, 46, 47: Definindo estado local para clientesCR
  const [clientesCR, setClientesCR] = useState<ClienteCRCompleto[]>([]);
  
  // NOVO: Referência para o Textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const isEditing = !!documentoId;
  const modeloId = modeloIdParam || documentoInicial?.modelo_id;

  const isAdmin = role === 'Admin';
  const isClient = role === 'Cliente';
  
  const getOwnerIdLogado = () => {
    if (isAdmin) return usuario?.id || null;
    if (isClient) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id; // FIX: proprietario_id -> cliente_id
    return null;
  };
  
  const ownerIdLogado = getOwnerIdLogado();

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
        .from('clientes') // CORREÇÃO: Usando a tabela 'clientes'
        .select('*') // Seleciona todos os campos para preenchimento de tags
        .eq('proprietario_id', targetEmpresaId)
        .order('nome');
        
    const { data: clientesCRData, error: errorCR } = await queryClients;
        
    if (errorCR) {
        showError('Erro ao carregar clientes CR: ' + errorCR.message);
        setClientesCR([]);
    } else {
        const mappedClients = (clientesCRData as ClienteCRCompleto[]).filter((c: ClienteCRCompleto) => c.id !== targetEmpresaId); // Filtra o próprio proprietário
        setClientesCR(mappedClients);
        
        // Se o cliente selecionado não estiver mais na lista, limpa a seleção
        if (clienteSelecionadoId && !mappedClients.some((c: ClienteCRCompleto) => c.id === clienteSelecionadoId)) {
            setClienteSelecionadoId('');
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
    
  }, [clienteSelecionadoId]);


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
        
        setClienteSelecionadoId(doc.cliente_id || '');
        initialValoresTags = doc.valores_tags_preenchidos || {};
        setTituloDocumento(doc.titulo);
        setTipoConteudo(doc.valores_tags_preenchidos?.tipo_conteudo || 'html');
        
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
        setTituloDocumento(modeloData.titulo);
        setTipoConteudo(modeloData.tipo_conteudo || 'html');
        
        // NOVO: Inicializa o campo {{CONTEUDO_PRINCIPAL}} com o template do modelo
        initialValoresTags['{{CONTEUDO_PRINCIPAL}}'] = modeloData.conteudo_template;
    }
    
    setModelo(currentModelo);
    
    // 3. Configurar Empresa Logada (Contratante)
    setEmpresaLogada(empresaLogadaMemo);
    
    // 4. Configurar Empresas Contratantes (Apenas Admin)
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
    
    setProprietarioDocumentoId(initialProprietarioDocumentoId);
    setValoresTags(initialValoresTags); // Define o estado de tags
    
    setCarregandoDados(false);
  }, [modeloId, documentoId, ownerIdLogado, navigate, isAdmin, empresaLogadaMemo]);
  
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
      // Combina tags padrão (sistema + financeiras) com as tags customizadas do usuário
      const customTagsMap = tagsCustomizadas.reduce((acc, tag) => {
          acc[tag.nome_tag] = tag;
          return acc;
      }, {} as Record<string, ContratoTag>);
      
      // Filtra tags financeiras (não são usadas em documentos societários)
      const tagsNaoFinanceiras = TAGS_PADRAO.filter(t => !t.origem_dado?.startsWith('contas_receber'));
      
      const combined = [...tagsNaoFinanceiras, ...tagsCustomizadas];
      
      // Remove duplicatas e ordena
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
        }
        
        // 2. Se o valor foi preenchido automaticamente, usa-o.
        if (tagValue !== null && tagValue !== undefined && tagValue !== 'N/A') {
            newTags[tagKey] = tagValue;
        } else {
            // 3. Caso contrário, usa o valor salvo anteriormente ou o valor digitado.
            // CRÍTICO: Se for a tag {{CONTEUDO_PRINCIPAL}}, mantemos o valor atual do estado
            if (tagKey === '{{CONTEUDO_PRINCIPAL}}') {
                newTags[tagKey] = valoresTags[tagKey] || modelo?.conteudo_template || '';
            } else {
                newTags[tagKey] = valoresTags[tagKey] || '';
            }
        }
    });
    
    setValoresTags(newTags);
  }, [clienteSelecionado, empresaLogada, valoresTags, allAvailableTags, modelo?.conteudo_template]);

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
      
      // O conteúdo principal é o valor da tag {{CONTEUDO_PRINCIPAL}} ou o template original
      const templateToRender = valoresTags['{{CONTEUDO_PRINCIPAL}}'] || modelo.conteudo_template;
      
      const conteudoRenderizado = renderizarConteudo(templateToRender, valoresTags);
      setConteudoPreview(conteudoRenderizado);
      setPreviewTitle(tituloDocumento || modelo.titulo);
      setPreviewOpen(true);
  };

  const handleSalvarDocumento = async (status: DocumentoStatus) => {
    if (!modelo || !clienteSelecionadoId || !ownerIdLogado || !tituloDocumento || !proprietarioDocumentoId) {
        showError('Preencha Título, Cliente e Proprietário.');
        return;
    }
    
    setIsSubmitting(true);
    
    try {
        // 0. GARANTIR QUE O CLIENTE EXISTA NA TABELA 'clientes' (para FK)
        const clienteSelecionado = clientesCR.find((c: ClienteCRCompleto) => c.id === clienteSelecionadoId);
        if (!clienteSelecionado) throw new Error('Cliente selecionado não encontrado.');
        
        // 1. Renderizar Conteúdo Final
        const templateToRender = valoresTags['{{CONTEUDO_PRINCIPAL}}'] || modelo.conteudo_template;
        const conteudoRenderizado = renderizarConteudo(templateToRender, valoresTags);
        
        // 2. Preparar dados do Documento Gerado
        const documentoPayload = {
            modelo_id: modelo.id,
            cliente_id: clienteSelecionadoId,
            proprietario_id: proprietarioDocumentoId,
            status: status,
            titulo: tituloDocumento,
            valores_tags_preenchidos: { ...valoresTags, titulo: tituloDocumento, tipo_conteudo: tipoConteudo },
            conteudo_renderizado: conteudoRenderizado,
        };
        
        if (isEditing && documentoInicial) {
            // Atualizar Documento Existente
            const { error } = await supabase
                .from('documentos_societarios_gerados')
                .update(documentoPayload)
                .eq('id', documentoInicial.id);
            if (error) throw error;
            
        } else {
            // Inserir Novo Documento
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
      const currentValue = valoresTags['{{CONTEUDO_PRINCIPAL}}'] || modelo?.conteudo_template || '';
      
      // Insere o texto na posição do cursor
      const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);
      
      handleTagChange('{{CONTEUDO_PRINCIPAL}}', newValue);
      
      // Força o foco e a posição do cursor após a atualização do valor
      setTimeout(() => {
          textarea.focus();
          textarea.selectionStart = start + text.length;
          textarea.selectionEnd = start + text.length;
      }, 0);
  };
  
  const handleInsertBloco = (bloco: BlocoSocietario) => {
      handleInsertText(`\n\n${bloco.conteudo}\n\n`);
      showSuccess(`Bloco '${bloco.titulo}' inserido no conteúdo.`);
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault(); // Permite que o drop ocorra
  };
  
  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      const tag = e.dataTransfer.getData("text/plain");
      
      if (!tag) return;
      
      handleInsertText(tag);
      showSuccess(`Tag ${tag} inserida.`);
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
      // Exclui tags de sistema (EMPRESA_*) que foram preenchidas
      if (tag.nome_tag.startsWith('{{EMPRESA_') && valoresTags[tag.nome_tag]) return false;
      
      // Exclui tags de cliente (CLIENTE_*) que foram preenchidas
      if (tag.nome_tag.startsWith('{{CLIENTE_') && valoresTags[tag.nome_tag]) return false;
      
      // Inclui tags que não têm valor preenchido
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
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Coluna 1: Dados e Tags */}
        <Card className="lg:col-span-1 h-fit">
            <CardHeader><CardTitle className="text-xl">Dados e Tags</CardTitle></CardHeader>
            <CardContent className="space-y-6">
                
                {isAdmin && (
                    <div className="space-y-2">
                        <Label htmlFor="empresa-documento">Empresa Proprietária</Label>
                        <Select 
                            value={proprietarioDocumentoId || ''} 
                            onValueChange={setProprietarioDocumentoId}
                        >
                            <SelectTrigger id="empresa-documento">
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
                    <Label htmlFor="titulo-documento">Título do Documento</Label>
                    <Input 
                        id="titulo-documento"
                        value={tituloDocumento}
                        onChange={(e) => setTituloDocumento(e.target.value)}
                        placeholder={modelo.titulo}
                    />
                </div>
                
                <div className="space-y-2">
                    <Label htmlFor="cliente">Cliente (Contratado)</Label>
                    <Select value={clienteSelecionadoId} onValueChange={setClienteSelecionadoId} disabled={!proprietarioDocumentoId}>
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
                
                <Separator />
                
                <div className="space-y-4">
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
        
        {/* Coluna 2: Template e Blocos */}
        <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl">Conteúdo do Documento</CardTitle>
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
                        onClick={() => handleSalvarDocumento('rascunho')} 
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
                
                {/* Campo de Conteúdo Principal (Editável) */}
                <div className="space-y-2">
                    <Label htmlFor="conteudo-principal">Conteúdo Principal (Editável)</Label>
                    <Textarea
                        id="conteudo-principal"
                        ref={textareaRef} // Adicionando a referência
                        value={valoresTags['{{CONTEUDO_PRINCIPAL}}'] || modelo.conteudo_template}
                        onChange={(e) => handleTagChange('{{CONTEUDO_PRINCIPAL}}', e.target.value)}
                        rows={15}
                        className={cn("font-mono text-sm", tipoConteudo === 'html' ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : '')}
                        onDragOver={handleDragOver} // Manipulador de Drag Over
                        onDrop={handleDrop} // Manipulador de Drop
                    />
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
                                    className="p-2 border rounded-md cursor-grab hover:bg-accent/50 transition-colors"
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
                        <p className="text-sm text-muted-foreground">Clique para adicionar um bloco pré-definido.</p>
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