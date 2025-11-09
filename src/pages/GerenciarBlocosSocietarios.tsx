import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, PlusCircle, FileText, Edit, Trash2, Copy, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { BlocoSocietario } from '@/types/documentos-societarios';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { UsuarioProfile } from '@/types/usuario';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import { ScrollArea } from '@/components/ui/scroll-area';

// Componente de Formulário Simples para Bloco
interface FormBlocoSocietarioProps {
    blocoInicial?: BlocoSocietario | null;
    proprietarioId: string;
    onSaveComplete: () => void;
}

const FormBlocoSocietario: React.FC<FormBlocoSocietarioProps> = ({ blocoInicial, proprietarioId, onSaveComplete }) => {
    const [titulo, setTitulo] = useState(blocoInicial?.titulo || '');
    const [conteudo, setConteudo] = useState(blocoInicial?.conteudo || '');
    const [tipoBloco, setTipoBloco] = useState(blocoInicial?.tipo_bloco || 'Paragrafo');
    const [loading, setLoading] = useState(false);
    const isEditing = !!blocoInicial;
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!titulo.trim() || !conteudo.trim()) {
            showError('Título e conteúdo são obrigatórios.');
            return;
        }
        setLoading(true);

        const dataToSave = {
            titulo: titulo.trim(),
            conteudo: conteudo.trim(),
            tipo_bloco: tipoBloco,
            proprietario_id: proprietarioId,
        };

        let error = null;

        if (isEditing) {
            const result = await supabase.from('blocos_societarios').update(dataToSave).eq('id', blocoInicial.id);
            error = result.error;
        } else {
            const result = await supabase.from('blocos_societarios').insert(dataToSave);
            error = result.error;
        }

        if (error) {
            showError(`Falha ao salvar bloco: ${error.message}`);
        } else {
            showSuccess(`Bloco salvo com sucesso!`);
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
            const currentValue = conteudo;
            
            const newValue = currentValue.substring(0, start) + tag + currentValue.substring(end);
            setConteudo(newValue);
            
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
    
    // Filtra apenas as tags de Cliente/Usuário/Empresa (excluindo as financeiras)
    const tagsDisponiveis = useMemo(() => {
        return TAGS_PADRAO.filter(t => 
            !t.origem_dado?.startsWith('contas_receber')
        ).sort((a, b) => a.nome_tag.localeCompare(b.nome_tag));
    }, []);


    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                
                {/* Coluna 1 & 2: Formulário e Conteúdo */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="titulo">Título</Label>
                        <Input id="titulo" placeholder="Ex: Cláusula de Rescisão" value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={loading} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="tipo">Tipo de Bloco</Label>
                        <Input id="tipo" placeholder="Ex: Paragrafo, Inciso, Cláusula" value={tipoBloco} onChange={(e) => setTipoBloco(e.target.value)} disabled={loading} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="conteudo">Conteúdo (Use tags como {'{{CLIENTE_NOME}}'})</Label>
                        <Textarea 
                            ref={textareaRef}
                            id="conteudo" 
                            rows={8} 
                            placeholder="Insira o texto completo do bloco aqui..." 
                            value={conteudo} 
                            onChange={(e) => setConteudo(e.target.value)} 
                            disabled={loading}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                        />
                    </div>
                </div>
                
                {/* Coluna 3: Tags Disponíveis */}
                <Card className="lg:col-span-1 max-h-[500px] overflow-y-auto">
                    <CardHeader className="p-3 border-b">
                        <CardTitle className="text-sm">Tags de Cliente/Empresa</CardTitle>
                        <Button type="button" variant="outline" size="sm" onClick={() => handleCopyTag(tagsDisponiveis.map(t => t.nome_tag).join(' '))} disabled={tagsDisponiveis.length === 0} className="w-full">
                            <Copy className="w-3 h-3 mr-1" /> Copiar Todas
                        </Button>
                    </CardHeader>
                    <ScrollArea className="h-[400px]">
                        <CardContent className="p-3 space-y-2">
                            {tagsDisponiveis.map((tag) => (
                                <div 
                                    key={tag.id} 
                                    className="flex flex-col space-y-1 border-b pb-2 last:border-b-0 cursor-grab active:cursor-grabbing"
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, tag.nome_tag)}
                                >
                                    <div className="flex justify-between items-center">
                                        <span className="font-mono text-xs font-semibold text-primary">{tag.nome_tag}</span>
                                        <Button 
                                            type="button" 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-6 w-6"
                                            onClick={() => handleCopyTag(tag.nome_tag)}
                                        >
                                            <Copy className="w-3 h-3" />
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                        <Tag className="w-3 h-3 mr-1 text-muted-foreground" />
                                        {tag.descricao}
                                    </p>
                                </div>
                            ))}
                        </CardContent>
                    </ScrollArea>
                </Card>
            </div>
            
            <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isEditing ? 'Salvar Alterações' : 'Criar Bloco')}
            </Button>
        </form>
    );
};


const GerenciarBlocosSocietarios: React.FC = () => {
  const { perfil, role, carregando: carregandoSessao } = useSessao();
  const [blocos, setBlocos] = useState<BlocoSocietario[]>([]);
  const [carregandoBlocos, setCarregandoBlocos] = useState(true);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [blocoSelecionado, setBlocoSelecionado] = useState<BlocoSocietario | null>(null);

  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId();

  const buscarBlocos = useCallback(async () => {
    if (!ownerId) {
        setCarregandoBlocos(false);
        return;
    }
    setCarregandoBlocos(true);
    
    let query = supabase
      .from('blocos_societarios')
      .select('*')
      .eq('proprietario_id', ownerId)
      .order('titulo', { ascending: true });

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar blocos: ' + error.message);
      setBlocos([]);
    } else {
      setBlocos(data as BlocoSocietario[]);
    }
    setCarregandoBlocos(false);
  }, [ownerId]);

  useEffect(() => {
    if (!carregandoSessao && ownerId) {
      buscarBlocos();
    }
  }, [carregandoSessao, ownerId, buscarBlocos]);
  
  const handleSaveComplete = () => {
    setDialogAberto(false);
    setBlocoSelecionado(null);
    buscarBlocos();
  };

  const handleEdit = (bloco: BlocoSocietario) => {
    setBlocoSelecionado(bloco);
    setDialogAberto(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este bloco?')) return;

    const { error } = await supabase
      .from('blocos_societarios')
      .delete()
      .eq('id', id);

    if (error) {
      showError('Erro ao excluir bloco: ' + error.message);
    } else {
      showSuccess('Bloco excluído com sucesso.');
      buscarBlocos();
    }
  };
  
  const handleCopyContent = (content: string) => {
    navigator.clipboard.writeText(content);
    showSuccess('Conteúdo copiado para a área de transferência!');
  };

  if (carregandoSessao || carregandoBlocos) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!ownerId) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para gerenciar blocos.</p></CardContent></Card></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileText className="w-6 h-6 mr-2" /> Gerenciar Blocos Societários
        </h1>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setBlocoSelecionado(null)} className="w-full sm:w-auto">
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Bloco
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{blocoSelecionado ? 'Editar Bloco' : 'Novo Bloco'}</DialogTitle>
            </DialogHeader>
            <FormBlocoSocietario 
              blocoInicial={blocoSelecionado}
              proprietarioId={ownerId}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Blocos Cadastrados ({blocos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Título</TableHead>
                  <TableHead className="w-[150px]">Tipo</TableHead>
                  <TableHead>Conteúdo (Prévia)</TableHead>
                  <TableHead className="w-[150px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blocos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                      Nenhum bloco cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  blocos.map((bloco) => (
                    <TableRow key={bloco.id}>
                      <TableCell className="font-medium">{bloco.titulo}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{bloco.tipo_bloco}</TableCell>
                      <TableCell className="text-sm truncate max-w-xs">{bloco.conteudo}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                            <Button variant="ghost" size="icon" onClick={() => handleCopyContent(bloco.conteudo)} title="Copiar Conteúdo">
                                <Copy className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(bloco)}>
                                <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(bloco.id)}>
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
    </LayoutPrincipal>
  );
};

export default GerenciarBlocosSocietarios;