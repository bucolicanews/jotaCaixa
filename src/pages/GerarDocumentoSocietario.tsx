import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileSignature, ChevronLeft, Save, Eye, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ModeloSocietario, BlocoSocietario } from '@/types/documentos-societarios';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile, AdminProfile } from '@/types/usuario';
import { ContratoTag } from '@/types/contratos';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import ContratoPreviewDialog from '@/components/contratos/ContratoPreviewDialog';
import BlocoSocietarioCard from '@/components/modelos-societarios/BlocoSocietarioCard';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

interface EmpresaContrato {
    id: string;
    nome: string;
}

// NOVO TIPO: Cliente CR com todos os campos de tag
interface ClienteCRCompleto {
    id: string;
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
  const { modeloId } = useParams<{ modeloId: string }>();
  const navigate = useNavigate();
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  
  const [modelo, setModelo] = useState<ModeloSocietario | null>(null);
  const [blocos, setBlocos] = useState<BlocoSocietario[]>([]);
  const [clientesCR, setClientesCR] = useState<ClienteCRCompleto[]>([]); // Alterado para clientesCR
  
  const [valoresTags, setValoresTags] = useState<Record<string, string>>({});
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [previewOpen, setPreviewOpen] = useState(false);
  const [conteudoPreview, setConteudoPreview] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string>('');
  const [tituloDocumento, setTituloDocumento] = useState('');
  
  const [proprietarioContratoId, setProprietarioContratoId] = useState<string | null>(null); 
  const [empresasContrato, setEmpresasContrato] = useState<EmpresaContrato[]>([]);

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  
  const getOwnerIdLogado = () => {
    if (isAdmin) return usuario?.id || null;
    if (isCliente) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerIdLogado = getOwnerIdLogado();
  
  // Dados da Empresa Logada (para preenchimento de tags {{EMPRESA_*}})
  const empresaLogada = useMemo(() => {
    if (!perfil) return null;
    const profile = perfil as AdminProfile | ClienteProfile;
    
    return {
        nome: profile.nome, email: profile.email, documento: (profile as AdminProfile).cnpj || (profile as AdminProfile).cpf || (profile as ClienteProfile).documento || (profile as ClienteProfile).cpf,
        cpf: (profile as AdminProfile).cpf || (profile as ClienteProfile).cpf, 
        cnpj: (profile as AdminProfile).cnpj, 
        rg: profile.rg, telefone: profile.telefone,
        cep: profile.cep, endereco: profile.endereco, numero: profile.numero, complemento: profile.complemento,
        bairro: profile.bairro, cidade: profile.cidade, estado: profile.estado,
    };
  }, [perfil, isAdmin, isCliente]);
  
  // Cliente selecionado (para preenchimento de tags)
  const clienteSelecionado = useMemo(() => {
      return clientesCR.find(c => c.id === clienteSelecionadoId);
  }, [clientesCR, clienteSelecionadoId]);


  // --- FUNÇÃO DE BUSCA DE CLIENTES E TAGS DEPENDENTE DO PROPRIETÁRIO ---
  const fetchDependentData = useCallback(async (targetEmpresaId: string) => {
    if (!targetEmpresaId) return;
    
    // 1. Buscar Blocos Reutilizáveis
    const { data: blocosData } = await supabase
        .from('blocos_societarios')
        .select('*')
        .eq('proprietario_id', targetEmpresaId)
        .order('titulo');
    setBlocos(blocosData as BlocoSocietario[] || []);
    
    // 2. Buscar Clientes (Contratados) - AGORA BUSCA NA TABELA 'clientes' (CR)
    const { data: clientesCRData, error: errorCR } = await supabase
        .from('clientes')
        .select('*')
        .eq('proprietario_id', targetEmpresaId)
        .order('nome');
        
    if (errorCR) {
        showError('Erro ao carregar clientes: ' + errorCR.message);
        setClientesCR([]);
    } else {
        setClientesCR(clientesCRData as ClienteCRCompleto[]);
        
        // Se o cliente selecionado não estiver mais na lista, limpa a seleção
        if (clienteSelecionadoId && !clientesCRData.some(c => c.id === clienteSelecionadoId)) {
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
        .from('modelos_societarios')
        .select('*')
        .eq('proprietario_id', ownerIdLogado)
        .eq('id', modeloId)
        .single();
        
    if (modeloError) {
        showError('Modelo não encontrado ou acesso negado.');
        navigate('/documentos-societarios', { replace: true });
        return;
    }
    setModelo(modeloData as ModeloSocietario);
    setTituloDocumento(modeloData.titulo);
    
    // 2. Configurar Empresas Contratantes (Apenas Admin)
    let initialProprietarioContratoId = ownerIdLogado;
    if (isAdmin) {
        // Busca todos os clientes do sistema para o dropdown de proprietário
        const { data: clientesData } = await supabase
            .from('tbl_clientes')
            .select('id, nome')
            .eq('aprovado', true)
            .order('nome');
            
        const adminOption: EmpresaContrato = { id: ownerIdLogado, nome: 'Meus Documentos (Admin)' };
        const allClients = [adminOption, ...(clientesData as EmpresaContrato[])];
        setEmpresasContrato(allClients);
        initialProprietarioContratoId = allClients[0].id;
    }
    
    setProprietarioContratoId(initialProprietarioContratoId);
    
    setCarregandoDados(false);
  }, [modeloId, ownerIdLogado, navigate, isAdmin]);
  
  // Efeito para monitorar a mudança do proprietário do contrato (proprietarioContratoId)
  useEffect(() => {
      if (proprietarioContratoId) {
          fetchDependentData(proprietarioContratoId);
      }
  }, [proprietarioContratoId, fetchDependentData]);


  useEffect(() => {
    if (!carregandoSessao && ownerIdLogado) {
      buscarDados();
    } else if (!carregandoSessao && !isAdmin && !isCliente) {
        navigate('/painel', { replace: true });
    }
  }, [carregandoSessao, ownerIdLogado, buscarDados, navigate, isAdmin, isCliente]);

  // --- Lógica de Preenchimento de Tags ---
  const updateTags = useCallback(() => {
    const newTags: Record<string, string> = {};
    
    // Combina tags padrão (apenas as de Cliente/Usuário/Empresa) e tags de blocos
    const allAvailableTags = TAGS_PADRAO.filter(t => 
        !t.origem_dado?.startsWith('contas_receber')
    );
    
    const blocoTags = blocos.map(b => ({
        id: b.id,
        nome_tag: `{{BLOCO_${b.id}}}`,
        descricao: `Bloco: ${b.titulo}`,
        origem_dado: 'blocos_societarios',
    } as ContratoTag));
    
    const allTags = [...allAvailableTags, ...blocoTags];

    allTags.forEach(tag => {
        const tagKey = tag.nome_tag;
        let tagValue: string | null = null;
        
        // 1. Tenta preencher tags de sistema (EMPRESA_NOME, CLIENTE_NOME, etc.)
        if (tag.origem_dado) {
            const [sourceTable, sourceField] = tag.origem_dado.split('.');
            
            // Mapeamento de dados da Empresa Logada (Contratada) - tbl_clientes / tbl_admins
            if ((sourceTable === 'tbl_clientes' || sourceTable === 'tbl_admins') && empresaLogada) {
                const empresaData = empresaLogada as any;
                if (empresaData && empresaData[sourceField]) {
                    tagValue = String(empresaData[sourceField]);
                }
            } 
            
            // Mapeamento de dados do Cliente Selecionado (Contratado) - clientes
            else if (sourceTable === 'clientes' && clienteSelecionado) {
                const clienteData = clienteSelecionado as any;
                
                // Busca o valor diretamente no objeto clienteSelecionado (que agora é ClienteCRCompleto)
                if (clienteData && clienteData[sourceField]) {
                    tagValue = String(clienteData[sourceField]);
                }
            } 
            
            // Mapeamento de Blocos
            else if (sourceTable === 'blocos_societarios' && tagKey.startsWith('{{BLOCO_')) {
                const blocoId = tagKey.replace('{{BLOCO_', '').replace('}}', '');
                const bloco = blocos.find(b => b.id === blocoId);
                tagValue = bloco?.conteudo || `[BLOCO ${blocoId} NÃO ENCONTRADO]`;
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
  }, [clienteSelecionado, blocos, empresaLogada, valoresTags]);

  useEffect(() => {
    updateTags();
  }, [updateTags]);

  const handleTagChange = (tag: string, value: string) => {
    setValoresTags(prev => ({ ...prev, [tag]: value }));
  };
  
  const renderizarConteudo = (template: string, tags: Record<string, string>): string => {
    let conteudoRenderizado = template;
    
    // 1. Substituição de Blocos (Primeira Passagem)
    const blocoTags = Object.keys(tags).filter(tag => tag.startsWith('{{BLOCO_'));
    
    blocoTags.forEach(blocoTag => {
        const regex = new RegExp(blocoTag, 'g');
        // O valor da tag de bloco já contém o conteúdo do bloco (que pode ter tags de dados)
        conteudoRenderizado = conteudoRenderizado.replace(regex, tags[blocoTag]);
    });
    
    // 2. Substituição de Tags de Dados (Segunda Passagem)
    const dataTags = Object.keys(tags).filter(tag => !tag.startsWith('{{BLOCO_'));
    
    dataTags.forEach(dataTag => {
        const regex = new RegExp(dataTag, 'g');
        // Substitui a tag de dados pelo seu valor
        conteudoRenderizado = conteudoRenderizado.replace(regex, tags[dataTag]);
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

  const handleSalvarDocumento = async () => {
    if (!modelo || !clienteSelecionadoId || !ownerIdLogado || !tituloDocumento || !proprietarioContratoId) {
        showError('Preencha Título, Cliente e Proprietário.');
        return;
    }
    
    setIsSubmitting(true);
    
    try {
        // 0. GARANTIR QUE O CLIENTE EXISTA NA TABELA 'clientes' (para FK)
        if (clienteSelecionado) {
            const clienteDataParaUpsert = {
                id: clienteSelecionado.id,
                proprietario_id: proprietarioContratoId,
                nome: clienteSelecionado.nome,
                razao_social: clienteSelecionado.razao_social || clienteSelecionado.nome,
                nome_fantasia: clienteSelecionado.nome_fantasia || clienteSelecionado.nome,
                documento: clienteSelecionado.documento || clienteSelecionado.cpf || clienteSelecionado.rg,
                email: clienteSelecionado.email,
                telefone: clienteSelecionado.telefone,
                telefone_fixo: clienteSelecionado.telefone_fixo,
                cep: clienteSelecionado.cep,
                endereco: clienteSelecionado.endereco,
                numero: clienteSelecionado.numero,
                complemento: clienteSelecionado.complemento,
                bairro: clienteSelecionado.bairro,
                cidade: clienteSelecionado.cidade,
                estado: clienteSelecionado.estado,
            };
            
            // Nota: A tabela 'clientes' tem FKs para tbl_clientes, mas a tabela 'documentos_societarios_gerados'
            // tem FK para 'clientes'. Precisamos garantir que o cliente exista em 'clientes'.
            const { error: upsertError } = await supabase
                .from('clientes')
                .upsert(clienteDataParaUpsert, { onConflict: 'id' });
                
            if (upsertError) {
                throw new Error('Falha ao garantir a existência do cliente na tabela CR: ' + upsertError.message);
            }
        }
        
        const conteudoRenderizado = renderizarConteudo(modelo.conteudo_template, valoresTags);
        
        const documentoData = {
            modelo_id: modelo.id,
            cliente_id: clienteSelecionadoId,
            proprietario_id: proprietarioContratoId, // Usando o proprietário selecionado
            status: 'finalizado',
            valores_tags_preenchidos: { ...valoresTags, titulo: tituloDocumento },
            conteudo_renderizado: conteudoRenderizado,
            data_registro: format(new Date(), 'yyyy-MM-dd'),
        };
        
        const { error } = await supabase
            .from('documentos_societarios_gerados')
            .insert(documentoData);
            
        if (error) throw error;

        showSuccess(`Documento '${tituloDocumento}' gerado e salvo com sucesso!`);
        navigate('/documentos-societarios');
        
    } catch (error: any) {
        console.error('Erro ao salvar documento:', error);
        showError('Falha ao salvar documento: ' + error.message);
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
      return <LayoutPrincipal><Card><CardHeader><CardTitle>Erro</CardTitle></CardHeader><CardContent><p>Modelo de documento não encontrado.</p></CardContent></Card></LayoutPrincipal>;
  }
  
  // Filtra tags que já foram preenchidas automaticamente (para não pedir valor manual)
  const tagsParaPreenchimentoManual = Object.keys(valoresTags).filter(tagKey => {
      // Exclui tags de bloco (que são preenchidas com o conteúdo do bloco)
      if (tagKey.startsWith('{{BLOCO_')) return false;
      
      // Exclui tags de sistema (EMPRESA_*) que foram preenchidas
      if (tagKey.startsWith('{{EMPRESA_') && valoresTags[tagKey]) return false;
      
      // Inclui tags que não têm valor preenchido
      return !valoresTags[tagKey];
  });

  return (
    <LayoutPrincipal>
      <div className="flex items-center mb-6">
        <Button 
            onClick={() => { navigate('/documentos-societarios/modelos'); }} 
            variant="link" 
            type="button"
            className="text-muted-foreground hover:text-primary flex items-center mr-4 p-0 h-auto"
        >
            <ChevronLeft className="w-5 h-5" />
            Voltar
        </Button>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileSignature className="w-6 h-6 mr-2" /> Gerar Documento: {modelo.titulo}
        </h1>
      </div>
      
      {/* DUPLICATE BUTTONS FOR TOP NAVIGATION */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <Button 
              onClick={handlePreview} 
              variant="outline"
              className="flex-1 h-12"
              disabled={!modelo || !clienteSelecionadoId || !tituloDocumento}
          >
              <Eye className="mr-2 h-4 w-4" />
              Pré-visualizar Documento
          </Button>
          <Button 
              onClick={handleSalvarDocumento} 
              className="flex-1 h-12"
              disabled={isSubmitting || !clienteSelecionadoId || !tituloDocumento}
          >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar Documento Finalizado
          </Button>
      </div>
      {/* END DUPLICATE BUTTONS */}
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <Card className="lg:col-span-1 h-fit">
            <CardHeader><CardTitle className="text-xl">Dados do Documento</CardTitle></CardHeader>
            <CardContent className="space-y-6">
                
                {isAdmin && (
                    <div className="space-y-2">
                        <Label htmlFor="empresa-contrato">Empresa Proprietária do Documento</Label>
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
                    <Label htmlFor="titulo-documento">Título do Documento Gerado</Label>
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
        
        <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-xl">Blocos Reutilizáveis</CardTitle></CardHeader>
            <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {blocos.length === 0 ? (
                            <p className="text-muted-foreground col-span-2">Nenhum bloco reutilizável encontrado. Crie em <Link to="/documentos-societarios/blocos" className="text-primary underline">Gerenciar Blocos</Link>.</p>
                        ) : (
                            blocos.map(bloco => (
                                <BlocoSocietarioCard key={bloco.id} bloco={bloco} />
                            ))
                        )}
                    </div>
                </ScrollArea>
                <p className="text-sm text-muted-foreground mt-4">
                    Para usar um bloco, copie o conteúdo e cole no template, ou use a tag {'{{BLOCO_ID_DO_BLOCO}}'} no template.
                </p>
            </CardContent>
        </Card>
        
      </div>
      
      <ContratoPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        conteudoHtml={conteudoPreview}
        titulo={previewTitle}
        isHtml={true} 
      />
    </LayoutPrincipal>
  );
};

export default GerarDocumentoSocietario;