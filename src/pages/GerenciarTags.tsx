import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormContratoTag from '@/components/FormContratoTag';
import { ContratoTag } from '@/types/contratos';

const GerenciarTags = () => {
  const { role, carregando: carregandoSessao } = useSessao();
  const [tags, setTags] = useState<ContratoTag[]>([]);
  const [carregandoTags, setCarregandoTags] = useState(true);
  const [tagSelecionada, setTagSelecionada] = useState<ContratoTag | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);

  const isAdmin = role === 'Admin';

  const buscarTags = useCallback(async () => {
    if (!isAdmin) return;
    setCarregandoTags(true);
    
    const { data, error } = await supabase
      .from('contrato_tags')
      .select('*')
      .order('nome_tag', { ascending: true });

    if (error) {
      showError('Erro ao carregar tags: ' + error.message);
      setTags([]);
    } else {
      setTags(data as ContratoTag[]);
    }
    setCarregandoTags(false);
  }, [isAdmin]);

  useEffect(() => {
    if (!carregandoSessao && isAdmin) {
      buscarTags();
    }
  }, [carregandoSessao, isAdmin, buscarTags]);

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

  if (carregandoSessao || carregandoTags) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!isAdmin) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Apenas administradores podem gerenciar tags de contrato.</p></CardContent></Card></LayoutPrincipal>;
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Tag</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[200px] hidden md:table-cell">Origem do Dado</TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tags.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                      Nenhuma tag cadastrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  tags.map((tag) => (
                    <TableRow key={tag.id}>
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

export default GerenciarTags;