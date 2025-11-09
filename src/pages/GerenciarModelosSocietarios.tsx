import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, PlusCircle, FileText, Edit, Trash2, Eye, Copy, Tag, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { ModeloSocietario, BlocoSocietario } from '@/types/documentos-societarios';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { UsuarioProfile } from '@/types/usuario';
import { useNavigate } from 'react-router-dom';
import ModeloPreviewDialog from '@/components/ModeloPreviewDialog';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import { ScrollArea } from '@/components/ui/scroll-area';

// Componente de Formulário Simples para Bloco
interface FormModeloSocietarioProps {
    modeloInicial?: ModeloSocietario | null;
    proprietarioId: string;
    onSaveComplete: () => void;
    blocosDisponiveis: BlocoSocietario[]; // NOVO PROP
}

const FormModeloSocietario: React.FC<FormModeloSocietarioProps> = ({ modeloInicial, proprietarioId, onSaveComplete, blocosDisponiveis }) => {
    const [titulo, setTitulo] = useState(modeloInicial?.titulo || '');
    const [conteudoTemplate, setConteudoTemplate] = useState(modeloInicial?.conteudo_template || '');
    const [tipoDocumento, setTipoDocumento] = useState(modeloInicial?.tipo_documento || 'Ata');
    const [loading, setLoading] = useState(false);
    const isEditing = !!modeloInicial;
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!titulo.trim() || !conteudoTemplate.trim()) {
            showError('Título e conteúdo são obrigatórios.');
            return;
        }
        setLoading(true);

        const dataToSave = {
            titulo: titulo.trim(),
            conteudo_template: conteudoTemplate.trim(),
            tipo_documento: tipoDocumento,
            proprietario_id: proprietarioId,
        };

        let error = null;

        if (isEditing) {
            const result = await supabase.from('modelos_societarios').update(dataToSave).eq('id', modeloInicial.id);
            error = result.error;
        } else {
            const result = await supabase.from('modelos_societarios').insert(dataToSave);
            error = result.error;
        }

        if (error) {
            showError(`Falha ao salvar modelo: ${error.message}`);
        } else {
            showSuccess(`Modelo salvo com sucesso!`);
            onSaveComplete();
        }
        setLoading(false);
    };
    
    const handleCopyTag = (tag: string) => {
        navigator.clipboard.writeText(tag);
        showSuccess(`Tag ${tag} copiada!`);
    };
    
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, tag: string) => {
        e.dataTransfer.setData('text/plain', tag);
    };
    
    const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
        e.preventDefault();
        const tag = e.dataTransfer.getData('text/plain');
        
        if (tag && textareaRef.current) {
            const textarea = textareaRef.current;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const currentValue = conteudoTemplate;
            
            const newValue = currentValue.substring(0, start) + tag + currentValue.substring(end);
            setConteudoTemplate(newValue);
            
            setTimeout(() => {
                textarea.focus();
                textarea.selectionStart = start + tag.length;
                textarea.selectionEnd = start + tag.length;
            }, 0);
        }
    };
    
    const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
        e.preventDefault();
    };
    
    const handleClearTemplate = () => {
        if (window.confirm('Tem certeza que deseja limpar todo o conteúdo do template?')) {
            setConteudoTemplate('');
            showSuccess('Template limpo.');
        }
    };
    
    // Filtra tags de sistema (excluindo as financeiras)
    const tagsDisponiveis = useMemo(() => {
        return TAGS_PADRAO.filter(t => 
            !t.origem_dado?.startsWith('contas_receber')
        ).sort((a, b) => a.nome_tag.localeCompare(b.nome_tag));
    }, []);
    
    // Mapeia blocos para tags arrastáveis
    const blocosTags = useMemo(() => {
        return blocosDisponiveis.map(b => ({
            id: b.id,
            nome_tag: `{{BLOCO_${b.id}}}`,
            descricao: `Bloco: ${b.titulo}`,
            conteudo: b.conteudo,
        }));
    }, [blocosDisponiveis]);


    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                
                {/* Coluna 1 & 2: Formulário e Conteúdo */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="titulo">Título do Documento</Label>
                        <Input id="titulo" placeholder="Ex: Contrato Social Padrão" value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={loading} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="tipo">Tipo de Documento</Label>
                        <Input id="tipo" placeholder="Ex: Ata, Estatuto, Contrato Social" value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)} disabled={loading} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="conteudo">Conteúdo do Template (Use tags como {'{{CLIENTE_NOME}}'} e blocos como {'{{BLOCO_ID}}'})</Label>
                        <Textarea 
                            ref={textareaRef}
                            id="conteudo" 
                            rows={15} 
                            placeholder="Insira o template completo aqui..." 
                            value={conteudoTemplate} 
                            onChange={(e) => setConteudoTemplate(e.target.value)} 
                            disabled={loading}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                        />
                    </div>
                </div>
                
                {/* Coluna 3: Tags e Blocos Disponíveis */}
                <Card className="lg:col-span-1">
                    <CardHeader className="p-3 border-b">
                        <CardTitle className="text-sm">Referências (Arraste ou Copie)</CardTitle>
                        <Button type="button" variant="destructive" size="sm" onClick={handleClearTemplate} className="w-full">
                            <X className="w-3 h-3 mr-1" /> Limpar Template
                        </Button>
                    </CardHeader>
                    <ScrollArea className="h-[500px]">
                        <CardContent className="p-3 space-y-3">
                            
                            {/* Tags de Cliente/Empresa */}
                            <div className="space-y-3">
                                <h4 className="font-semibold text-sm border-b pb-1">Tags de Cliente/Empresa</h4>
                                {tagsDisponiveis.map((tag) => (
                                    <div 
                                        key={tag.id} 
                                        className="flex flex-col space-y-1 border-b pb-2 last:border-b-0 cursor-grab active:cursor-grabbing"
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, tag.nome_tag)}
                                    >
                                        <div className="flex justify-between items-start">
                                            <span className="font-mono text-xs font-semibold text-primary break-all pr-2">{tag.nome_tag}</span>
                                            <Button 
                                                type="button" 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-6 w-6 flex-shrink-0"
                                                onClick={() => handleCopyTag(tag.nome_tag)}
                                            >
                                                <Copy className="w-3 h-3" />
                                            </Button>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            <Tag className="w-3 h-3 mr-1 text-muted-foreground inline-block align-text-bottom" />
                                            {tag.descricao}
                                        </p>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Blocos Reutilizáveis */}
                            <div className="space-y-3 pt-3 border-t">
                                <h4 className="font-semibold text-sm border-b pb-1">Blocos Reutilizáveis</h4>
                                {blocosTags.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Nenhum bloco cadastrado.</p>
                                ) : (
                                    blocosTags.map((bloco) => (
                                        <div 
                                            key={bloco.id} 
                                            className="flex flex-col space-y-1 border-b pb-2 last:border-b-0 cursor-grab active:cursor-grabbing"
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, bloco.nome_tag)}
                                        >
                                            <div className="flex justify-between items-start">
                                                <span className="font-mono text-xs font-semibold text-blue-500 break-all pr-2">{bloco.nome_tag}</span>
                                                <Button 
                                                    type="button" 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-6 w-6 flex-shrink-0"
                                                    onClick={() => handleCopyTag(bloco.nome_tag)}
                                                >
                                                    <Copy className="w-3 h-3" />
                                                </Button>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {bloco.descricao}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </ScrollArea>
                </Card>
            </div>
            
            <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isEditing ? 'Salvar Alterações' : 'Criar Modelo')}
            </Button>
        </form>
    );
};


const GerenciarModelosSocietarios: React.FC = () => {
  const { perfil, role, carregando: carregandoSessao } = useSessao();
  const navigate = useNavigate();
  const [modelos, setModelos] = useState<ModeloSocietario[]>([]);
  const [blocos, setBlocos] = useState<BlocoSocietario[]>([]); // NOVO ESTADO
  const [carregandoModelos, setCarregandoModelos] = useState(true);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [modeloSelecionado, setModeloSocietarioSelecionado] = useState<ModeloSocietario | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState('');

  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId();

  const buscarDados = useCallback(async () => {
    if (!ownerId) {
        setCarregandoModelos(false);
        return;
    }
    setCarregandoModelos(true);
    
    // 1. Buscar Modelos
    const { data: modelosData, error: modelosError } = await supabase
      .from('modelos_societarios')
      .select('*')
      .eq('proprietario_id', ownerId)
      .order('titulo', { ascending: true });

    if (modelosError) {
      showError('Erro ao carregar modelos: ' + modelosError.message);
      setModelos([]);
    } else {
      setModelos(modelosData as ModeloSocietario[]);
    }
    
    // 2. Buscar Blocos
    const { data: blocosData } = await supabase
        .from('blocos_societarios')
        .select('*')
        .eq('proprietario_id', ownerId)
        .order('titulo');
    setBlocos(blocosData as BlocoSocietario[] || []);
    
    setCarregandoModelos(false);
  }, [ownerId]);

  useEffect(() => {
    if (!carregandoSessao && ownerId) {
      buscarDados();
    }
  }, [carregandoSessao, ownerId, buscarDados]);
  
  const handleSaveComplete = () => {
    setDialogAberto(false);
    setModeloSocietarioSelecionado(null);
    buscarDados();
  };

  const handleEdit = (modelo: ModeloSocietario) => {
    setModeloSocietarioSelecionado(modelo);
    setDialogAberto(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este modelo?')) return;

    const { error } = await supabase
      .from('modelos_societarios')
      .delete()
      .eq('id', id);

    if (error) {
      showError('Erro ao excluir modelo: ' + error.message);
    } else {
      showSuccess('Modelo excluído com sucesso.');
      buscarDados();
    }
  };
  
  const handlePreview = (modelo: ModeloSocietario) => {
      setPreviewContent(modelo.conteudo_template);
      setPreviewOpen(true);
  };
  
  const handleGenerate = (modelo: ModeloSocietario) => {
      navigate(`/documentos-societarios/gerar/${modelo.id}`);
  };

  if (carregandoSessao || carregandoModelos) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!ownerId) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para gerenciar modelos.</p></CardContent></Card></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileText className="w-6 h-6 mr-2" /> Gerenciar Modelos Societários
        </h1>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setModeloSocietarioSelecionado(null)} className="w-full sm:w-auto">
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Modelo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-7xl max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{modeloSelecionado ? 'Editar Modelo' : 'Novo Modelo'}</DialogTitle>
            </DialogHeader>
            <FormModeloSocietario 
              modeloInicial={modeloSelecionado}
              proprietarioId={ownerId}
              onSaveComplete={handleSaveComplete}
              blocosDisponiveis={blocos}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Modelos Cadastrados ({modelos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Título</TableHead>
                  <TableHead className="w-[150px]">Tipo</TableHead>
                  <TableHead>Conteúdo (Prévia)</TableHead>
                  <TableHead className="w-[200px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modelos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                      Nenhum modelo cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  modelos.map((modelo) => (
                    <TableRow key={modelo.id}>
                      <TableCell className="font-medium">{modelo.titulo}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{modelo.tipo_documento}</TableCell>
                      <TableCell className="text-sm truncate max-w-xs">{modelo.conteudo_template.substring(0, 100)}...</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                            <Button variant="secondary" size="sm" onClick={() => handleGenerate(modelo)} title="Gerar Documento">
                                Gerar
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handlePreview(modelo)} title="Pré-visualizar">
                                <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(modelo)}>
                                <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(modelo.id)}>
                                <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <ModeloPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        conteudoTemplate={previewContent}
        titulo={modeloSelecionado?.titulo || 'Prévia'}
        isHtml={true} // Assumindo HTML para documentos societários
      />
    </LayoutPrincipal>
  );
};

export default GerenciarModelosSocietarios;