import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, Tag, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormContratoTag from '@/components/formularios/FormContratoTag';
import { ContratoTag } from '@/types/contratos';
import { AdminUsuarioProfile, ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import { useOwner } from '@/hooks/use-owner'; // NOVO IMPORT
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao'; // NOVO IMPORT
import { cn } from '@/lib/utils'; // NOVO IMPORT

const GerenciarTags = () => {
  const { role, perfil,usuario, carregando: carregandoSessao } = useSessao();
  const { ownerId } = useOwner(); // USANDO useOwner
  const [tags, setTags] = useState<ContratoTag[]>([]);
  const [carregandoTags, setCarregandoTags] = useState(true);
  const [tagSelecionada, setTagSelecionada] = useState<ContratoTag | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  
  // Tags de sistema que não podem ser editadas/excluídas
  const tagsSistema = TAGS_PADRAO;
  
  // NOVO ESTADO: Seleção em massa
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [filtroTexto, setFiltroTexto] = useState('');
  const filtroTextoDebounced = useDebounce(filtroTexto, 500);

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  const isUsuario = role === 'Usuario';
  
  const proprietarioId = ownerId; // USANDO ownerId

  const buscarTags = useCallback(async () => {
    if (!proprietarioId) return;
    setCarregandoTags(true);
    
    let query = supabase
      .from('contrato_tags')
      .select('*')
      .order('nome_tag', { ascending: true });
      
    const isUsuarioCliente = role === 'Usuario' && !!(perfil as any)?.cliente_id;
      
    if (isCliente || isUsuarioCliente) {
        // Clientes e Usuários de Clientes veem apenas tags da sua empresa
        query = query.eq('empresa_id', proprietarioId);
    } else if (isAdmin) {
        // Admin e Usuários de Admin veem o que a RLS permitir
    }
    
    if (filtroTextoDebounced) {
        query = query.or(`nome_tag.ilike.%${filtroTextoDebounced}%,descricao.ilike.%${filtroTextoDebounced}%`);
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar tags: ' + error.message);
      setTags([]);
    } else {
      // Combina tags do banco de dados com tags de sistema
      const tagsDoBanco = data as ContratoTag[];
      const tagsCombinadas = [...tagsSistema, ...tagsDoBanco];
      
      // Filtra as tags combinadas pelo texto de busca (já que a busca no banco só pega as do banco)
      const tagsFiltradas = tagsCombinadas.filter(tag => 
          tag.nome_tag.toLowerCase().includes(filtroTextoDebounced.toLowerCase()) ||
          tag.descricao.toLowerCase().includes(filtroTextoDebounced.toLowerCase())
      );
      
      // Remove duplicatas (se houver sobreposição de IDs)
      const uniqueTags = Array.from(new Map(tagsFiltradas.map(item => [item.nome_tag, item])).values());
      
      setTags(uniqueTags);
    }
    setCarregandoTags(false);
  }, [role, isCliente, isAdmin, proprietarioId, filtroTextoDebounced, perfil, tagsSistema]);

  useEffect(() => {
    if (!carregandoSessao && (isAdmin || isCliente || (isUsuario && proprietarioId))) {
      buscarTags();
    } else if (!carregandoSessao) {
        setCarregandoTags(false);
    }
  }, [carregandoSessao, isAdmin, isCliente, isUsuario, proprietarioId, buscarTags]);
  
  // Limpa a seleção ao recarregar os dados
  useEffect(() => {
      setSelectedIds([]);
  }, [tags]);

  const handleSaveComplete = () => {
    setDialogAberto(false);
    setTagSelecionada(null);
    buscarTags();
  };

  const handleEdit = (tag: ContratoTag) => {
    // Tags de sistema não podem ser editadas
    if (tagsSistema.some(t => t.nome_tag === tag.nome_tag)) {
        showError('Tags de sistema não podem ser editadas.');
        return;
    }
    setTagSelecionada(tag);
    setDialogAberto(true);
  };

  const handleDelete = async (id: string) => {
    const tagToDelete = tags.find(t => t.id === id);
    if (!tagToDelete) return;
    
    // Tags de sistema não podem ser excluídas
    if (tagsSistema.some(t => t.nome_tag === tagToDelete.nome_tag)) {
        showError('Tags de sistema não podem ser excluídas.');
        return;
    }
    
    if (!window.confirm('Tem certeza que deseja excluir esta tag? Isso pode quebrar modelos de contrato existentes.')) return;

    const { error } = await supabase
      .from('contrato_tags')
      .delete()
      .eq('id', id);

    if (error) {
      showError('Erro ao excluir tag: ' + error.message);
    } else {
      showSuccess('Tag excluída com sucesso.');
      buscarTags();
    }
  };
  
  // --- Lógica de Seleção em Massa ---
  const handleToggleSelect = (id: string, checked: boolean) => {
      const tag = tags.find(t => t.id === id);
      // Não permite selecionar tags de sistema
      if (tag && tagsSistema.some(t => t.nome_tag === tag.nome_tag)) return;
      
      setSelectedIds(prev => 
          checked ? [...prev, id] : prev.filter(prevId => prevId !== id)
      );
  };
  
  const handleSelectAll = (checked: boolean) => {
      if (checked) {
          // Seleciona apenas tags que não são de sistema
          const nonSystemTags = tags.filter(tag => !tagsSistema.some(t => t.nome_tag === tag.nome_tag));
          setSelectedIds(nonSystemTags.map(h => h.id));
      } else {
          setSelectedIds([]);
      }
  };
  
  const handleDeleteSelected = async () => {
      const tagsParaExcluir = selectedIds.filter(id => {
          const tag = tags.find(t => t.id === id);
          return tag && !tagsSistema.some(t => t.nome_tag === tag.nome_tag);
      });
      
      if (tagsParaExcluir.length === 0) {
          showError('Nenhuma tag de usuário selecionada para exclusão.');
          return;
      }
      
      // O proprietarioId é crucial para a RLS. Se não estiver definido, não podemos prosseguir.
      if (!proprietarioId) {
          showError('ID do proprietário não encontrado. Não é possível excluir.');
          return;
      }
      
      setIsDeletingBulk(true);
      
      try {
          // A exclusão deve ser feita com base nos IDs selecionados E no ID do proprietário
          // para garantir que a RLS seja respeitada.
          const { error } = await supabase
              .from('contrato_tags')
              .delete()
              .in('id', tagsParaExcluir)
              .eq('empresa_id', proprietarioId); 
              
          if (error) throw error;
          
          showSuccess(`${tagsParaExcluir.length} tags excluídas com sucesso.`);
          setSelectedIds([]);
          buscarTags();
      } catch (error: any) {
          console.error('Erro ao excluir tags em massa:', error);
          showError('Falha ao excluir tags: ' + error.message);
      } finally {
          setIsDeletingBulk(false);
      }
  };
  // -----------------------------------

  if (carregandoSessao || carregandoTags || !proprietarioId) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!proprietarioId && !isAdmin) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para gerenciar tags de contrato.</p></CardContent></Card></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <Tag className="w-6 h-6 mr-2" /> Gerenciar Tags Dinâmicas
        </h1>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setTagSelecionada(null)} className="w-full sm:w-auto">
              <PlusCircle className="w-4 h-4 mr-2" />
              Nova Tag
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{tagSelecionada ? 'Editar Tag' : 'Nova Tag Dinâmica'}</DialogTitle>
            </DialogHeader>
            <FormContratoTag 
              tagInicial={tagSelecionada}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Tags Cadastradas ({tags.length})</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <div className="relative w-full sm:w-auto flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por tag ou descrição..."
                        value={filtroTexto}
                        onChange={(e) => setFiltroTexto(e.target.value)}
                        className="pl-10 max-w-sm"
                    />
                </div>
                
                {selectedIds.length > 0 && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button 
                                variant="destructive" 
                                size="sm" 
                                disabled={isDeletingBulk}
                                className="w-full sm:w-auto"
                            >
                                {isDeletingBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                Excluir Selecionadas ({selectedIds.length})
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar Exclusão em Massa</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Você tem certeza que deseja excluir {selectedIds.length} tags? Esta ação não pode ser desfeita e pode quebrar modelos de contrato existentes.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={isDeletingBulk}>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteSelected} disabled={isDeletingBulk}>
                                    {isDeletingBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Excluir'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </div>
            
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                    <TableHead className="w-[40px] text-center">
                        <Checkbox 
                            checked={selectedIds.length === tags.length && tags.length > 0}
                            onCheckedChange={(checked) => handleSelectAll(!!checked)}
                            disabled={tags.length === 0}
                        />
                    </TableHead>
                  <TableHead className="w-[200px]">Tag</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[200px] hidden md:table-cell">Origem do Dado</TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                      Nenhuma tag cadastrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  tags.map((tag) => {
                    const isSelected = selectedIds.includes(tag.id);
                    const isSystemTag = tagsSistema.some(t => t.nome_tag === tag.nome_tag);
                    
                    return (
                      <TableRow key={tag.id} className={cn(isSelected ? 'bg-secondary/50' : '', isSystemTag ? 'bg-gray-50/50 text-muted-foreground' : '')}>
                        <TableCell className="text-center">
                            <Checkbox 
                                checked={isSelected}
                                onCheckedChange={(checked) => handleToggleSelect(tag.id, !!checked)}
                                disabled={isSystemTag}
                            />
                        </TableCell>
                        <TableCell className="font-mono text-sm font-semibold text-primary">{tag.nome_tag}</TableCell>
                        <TableCell>{tag.descricao}</TableCell>
                        <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{tag.origem_dado || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end space-x-2">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(tag)} disabled={isSystemTag}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(tag.id)} disabled={isSystemTag}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default GerenciarTags;