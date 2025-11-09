import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileSignature, ChevronLeft, Save, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ModeloSocietario, BlocoSocietario } from '@/types/documentos-societarios';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Cliente } from '@/types/cliente';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import ContratoPreviewDialog from '@/components/contratos/ContratoPreviewDialog';
import BlocoSocietarioCard from '@/components/modelos-societarios/BlocoSocietarioCard';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

const GerarDocumentoSocietario: React.FC = () => {
  const { modeloId } = useParams<{ modeloId: string }>();
  const navigate = useNavigate();
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  
  const [modelo, setModelo] = useState<ModeloSocietario | null>(null);
  const [blocos, setBlocos] = useState<BlocoSocietario[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  
  const [valoresTags, setValoresTags] = useState<Record<string, string>>({});
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [previewOpen, setPreviewOpen] = useState(false);
  const [conteudoPreview, setConteudoPreview] = useState('');
  
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string>('');
  const [tituloDocumento, setTituloDocumento] = useState('');

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  
  const getOwnerIdLogado = () => {
    if (isAdmin) return usuario?.id || null;
    if (isCliente) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerIdLogado = getOwnerIdLogado();

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
        .eq('id', modeloId)
        .single();
        
    if (modeloError) {
        showError('Modelo não encontrado ou acesso negado.');
        navigate('/documentos-societarios', { replace: true });
        return;
    }
    setModelo(modeloData as ModeloSocietario);
    setTituloDocumento(modeloData.titulo);
    
    // 2. Buscar Blocos Reutilizáveis
    const { data: blocosData } = await supabase
        .from('blocos_societarios')
        .select('*')
        .eq('proprietario_id', ownerIdLogado)
        .order('titulo');
    setBlocos(blocosData as BlocoSocietario[] || []);
    
    // 3. Buscar Clientes (Contratados)
    const { data: clientesData } = await supabase
        .from('clientes')
        .select('*')
        .eq('proprietario_id', ownerIdLogado)
        .order('nome');
    setClientes(clientesData as Cliente[] || []);
    
    setCarregandoDados(false);
  }, [modeloId, ownerIdLogado, navigate]);
  
  useEffect(() => {
    if (!carregandoSessao && ownerIdLogado) {
      buscarDados();
    }
  }, [carregandoSessao, ownerIdLogado, buscarDados]);

  // --- Lógica de Preenchimento de Tags ---
  const updateTags = useCallback(() => {
    const newTags: Record<string, string> = {};
    const cliente = clientes.find(c => c.id === clienteSelecionadoId);
    
    // Combina tags padrão (apenas as de Cliente/Usuário/Empresa) e tags customizadas
    const allActiveTags = [...TAGS_PADRAO, ...blocos.map(b => ({ nome_tag: `{{BLOCO_${b.id}}}`, descricao: `Bloco: ${b.titulo}`, origem_dado: 'blocos_societarios', criado_em: '' } as any))];

    allActiveTags.forEach(tag => {
        const tagKey = tag.nome_tag;
        let tagValue: string | null = null;
        
        // 1. Tenta preencher tags de sistema (EMPRESA_NOME, CLIENTE_NOME, etc.)
        if (tag.origem_dado) {
            const [sourceTable, sourceField] = tag.origem_dado.split('.');
            
            // Mapeamento de dados da Empresa Logada (Contratante) - tbl_clientes / tbl_admins
            if (sourceTable === 'tbl_clientes' || sourceTable === 'tbl_admins') {
                const empresaData = perfil as any;
                if (empresaData && empresaData[sourceField]) {
                    tagValue = String(empresaData[sourceField]);
                }
            } 
            
            // Mapeamento de dados do Cliente Selecionado (Contratado) - clientes
            else if (sourceTable === 'clientes' && cliente) {
                const clienteData = cliente as any;
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
        if (tagValue !== null) {
            newTags[tagKey] = tagValue;
        } else {
            // 3. Caso contrário, usa o valor salvo anteriormente ou o valor digitado.
            newTags[tagKey] = valoresTags[tagKey] || '';
        }
    });
    
    setValoresTags(newTags);
  }, [clienteSelecionadoId, clientes, blocos, perfil, valoresTags]);

  useEffect(() => {
    updateTags();
  }, [updateTags]);

  const handleTagChange = (tag: string, value: string) => {
    setValoresTags(prev => ({ ...prev, [tag]: value }));
  };
  
  const renderizarConteudo = (template: string, tags: Record<string, string>): string => {
    let conteudoRenderizado = template;
    for (const tag in tags) {
        const regex = new RegExp(tag, 'g');
        conteudoRenderizado = conteudoRenderizado.replace(regex, tags[tag]);
    }
    
    return conteudoRenderizado;
  };
  
  const handlePreview = () => {
      if (!modelo) return;
      const conteudoRenderizado = renderizarConteudo(modelo.conteudo_template, valoresTags);
      setConteudoPreview(conteudoRenderizado);
      setPreviewOpen(true);
  };

  const handleSalvarDocumento = async () => {
    if (!modelo || !clienteSelecionadoId || !ownerIdLogado || !tituloDocumento) {
        showError('Preencha Título, Cliente e Proprietário.');
        return;
    }
    
    setIsSubmitting(true);
    
    try {
        const conteudoRenderizado = renderizarConteudo(modelo.conteudo_template, valoresTags);
        
        const documentoData = {
            modelo_id: modelo.id,
            cliente_id: clienteSelecionadoId,
            proprietario_id: ownerIdLogado,
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
      // Se o valor for vazio E a tag não for um bloco (blocos são preenchidos com [BLOCO ID])
      return !tagKey.startsWith('{{BLOCO_') && !valoresTags[tagKey];
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
                    <Select value={clienteSelecionadoId} onValueChange={setClienteSelecionadoId}>
                        <SelectTrigger id="cliente">
                            <SelectValue placeholder="Selecione o Cliente" />
                        </SelectTrigger>
                        <SelectContent>
                            {clientes.map(c => (
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
        
        {/* REMOVIDO: Botões duplicados no final da página */}
        
      </div>
      
      <ContratoPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        conteudoHtml={conteudoPreview}
        titulo={tituloDocumento || modelo?.titulo || 'Prévia'}
        isHtml={true} 
      />
    </LayoutPrincipal>
  );
};

export default GerarDocumentoSocietario;