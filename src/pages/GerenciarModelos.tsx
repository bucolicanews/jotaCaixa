import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, FileTextIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormContratoModelo from '@/components/FormContratoModelo';
import { ContratoModelo } from '@/types/contratos';
import { ClienteProfile } from '@/types/usuario';

const GerenciarModelos = () => {
  const { role, perfil, carregando: carregandoSessao } = useSessao();
  const [modelos, setModelos] = useState<ContratoModelo[]>([]);
  const [carregandoModelos, setCarregandoModelos] = useState(true);
  const [modeloSelecionado, setModeloSelecionado] = useState<ContratoModelo | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  
  const getEmpresaId = () => {
    if (isCliente) return (perfil as ClienteProfile)?.id;
    return null; 
  };
  
  const empresaId = getEmpresaId();

  const buscarModelos = useCallback(async () => {
    if (!role) return;
    setCarregandoModelos(true);
    
    let query = supabase
      .from('contrato_modelos')
      .select('*')
      .order('titulo', { ascending: true });
      
    if (isCliente && empresaId) {
        // Clientes só veem seus modelos
        query = query.eq('empresa_id', empresaId);
    } else if (isCliente && !empresaId) {
        // Cliente não aprovado ou sem ID
        setModelos([]);
        setCarregandoModelos(false);
        return;
    } else if (isAdmin) {
        // Admin vê todos os modelos (globais e de clientes)
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar modelos: ' + error.message);
      setModelos([]);
    } else {
      setModelos(data as ContratoModelo[]);
    }
    setCarregandoModelos(false);
  }, [role, isCliente, isAdmin, empresaId]);

  useEffect(() => {
    if (!carregandoSessao && role) {
      buscarModelos();
    }
  }, [carregandoSessao, role, buscarModelos]);

  const handleSaveComplete = () => {
    setDialogAberto(false);
    setModeloSelecionado(null);
    buscarModelos();
  };

  const handleEdit = (modelo: ContratoModelo) => {
    setModeloSelecionado(modelo);
    setDialogAberto(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este modelo de contrato?')) return;

    const { error } = await supabase
      .from('contrato_modelos')
      .delete()
      .eq('id', id);

    if (error) {
      showError('Erro ao excluir modelo: ' + error.message);
    } else {
      showSuccess('Modelo excluído com sucesso.');
      buscarModelos();
    }
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
  
  if (!isAdmin && !isCliente) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Apenas administradores e clientes podem gerenciar modelos de contrato.</p></CardContent></Card></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileTextIcon className="w-6 h-6 mr-2" /> Gerenciar Modelos de Contrato
        </h1>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setModeloSelecionado(null)} className="w-full sm:w-auto">
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Modelo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{modeloSelecionado ? 'Editar Modelo' : 'Novo Modelo de Contrato'}</DialogTitle>
            </DialogHeader>
            <FormContratoModelo 
              modeloInicial={modeloSelecionado}
              onSaveComplete={handleSaveComplete}
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
                  <TableHead>Título</TableHead>
                  <TableHead className="w-[150px] hidden md:table-cell">Criado Em</TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modelos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                      Nenhum modelo cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  modelos.map((modelo) => (
                    <TableRow key={modelo.id}>
                      <TableCell className="font-medium">{modelo.titulo}</TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{new Date(modelo.criado_em).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(modelo)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(modelo.id)}>
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

export default GerenciarModelos;