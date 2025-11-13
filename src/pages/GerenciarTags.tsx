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
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';

const GerenciarTags = () => {
  const { role, perfil, carregando: carregandoSessao } = useSessao();
  const [tags, setTags] = useState<ContratoTag[]>([]);
  const [carregandoTags, setCarregandoTags] = useState(true);
  const [tagSelecionada, setTagSelecionada] = useState<ContratoTag | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  
  // NOVO ESTADO: Seleção em massa
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [filtroTexto, setFiltroTexto] = useState('');
  const filtroTextoDebounced = useDebounce(filtroTexto, 500);

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  const isUsuario = role === 'Usuario';
  
  const getEmpresaId = () => {
    if (isCliente) return (perfil as ClienteProfile)?.id;
    if (isUsuario) return (perfil as UsuarioProfile)?.proprietario_id;
    // Se for Admin, o proprietário da tag é o próprio Admin logado.
    if (isAdmin) return (perfil as any)?.id;
    return null;
  };
  
  const ownerId = getEmpresaId();

  const buscarTags = useCallback(async () => {
    if (!role) return;
    setCarregandoTags(true);
    
    let query = supabase
      .from('contrato_tags')
      .select('*')
      .order('nome_tag', { ascending: true });
      
    if (isCliente || isUsuario) {
        // Clientes e Usuários veem apenas tags da sua empresa
        query = query.eq('empresa_id', ownerId);
    } else if (isAdmin) {
        // Admin vê todas (RLS garante)
    }
    
    if (filtroTextoDebounced) {
        const termo = `%${filtroTextoDebounced}%`;
        query = query.or(`nome_tag.ilike.${termo},descricao.ilike.${termo}`);
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar tags: ' + error.message);
      setTags([]);
    } else {
      setTags(data as ContratoTag[]);
    }
    setCarregandoTags(false);
  }, [role, isCliente, isUsuario, isAdmin, ownerId, filtroTextoDebounced]);

  useEffect(() => {
    if (!carregandoSessao && (isAdmin || isCliente || (isUsuario && ownerId))) {
      buscarTags();
    } else if (!carregandoSessao) {
        setCarregandoTags(false);
    }
  }, [carregandoSessao, isAdmin, isCliente, isUsuario, ownerId, buscarTags]);
  
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
    setTagSelecionada(tag);
    setDialogAberto(true);
  };

  const handleDelete = async (id: string) => {
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
      setSelectedIds(prev => 
          checked ? [...prev, id] : prev.filter(prevId => prevId !== id)
      );
  };
  
  const handleSelectAll = (checked: boolean) => {
      if (checked) {
          setSelectedIds(tags.map(h => h.id));
      } else {
          setSelectedIds([]);
      }
  };
  
  const handleDeleteSelected = async () => {
      if (selectedIds.length === 0) {
          showError('Nenhuma tag selecionada.');
          return;
      }
      
      // O ownerId é crucial para a RLS. Se não estiver definido, não podemos prosseguir.
      if (!ownerId) {
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
              .in('id', selectedIds)
              .eq('empresa_id', ownerId); 
              
          if (error) throw error;
          
          showSuccess(`${selectedIds.length} tags excluídas com sucesso.`);
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

  if (carregandoSessao || carregandoTags) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!ownerId && !isAdmin) {
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
                    return (
                      <TableRow key={tag.id} className={isSelected ? 'bg-secondary/50' : ''}>
                        <TableCell className="text-center">
                            <Checkbox 
                                checked={isSelected}
                                onCheckedChange={(checked) => handleToggleSelect(tag.id, !!checked)}
                            />
                        </TableCell>
                        <TableCell className="font-mono text-sm font-semibold text-primary">{tag.nome_tag}</TableCell>
                        <TableCell>{tag.descricao}</TableCell>
                        <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{tag.origem_dado || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end space-x-2">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(tag)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(tag.id)}>
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