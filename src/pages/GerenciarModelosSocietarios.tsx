import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, PlusCircle, FileText, Edit, Trash2, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { ModeloSocietario } from '@/types/documentos-societarios';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { UsuarioProfile } from '@/types/usuario';
import { useNavigate } from 'react-router-dom';
import ModeloPreviewDialog from '@/components/ModeloPreviewDialog';

// Componente de Formulário Simples para Modelo
interface FormModeloSocietarioProps {
    modeloInicial?: ModeloSocietario | null;
    proprietarioId: string;
    onSaveComplete: () => void;
}

const FormModeloSocietario: React.FC<FormModeloSocietarioProps> = ({ modeloInicial, proprietarioId, onSaveComplete }) => {
    const [titulo, setTitulo] = useState(modeloInicial?.titulo || '');
    const [conteudoTemplate, setConteudoTemplate] = useState(modeloInicial?.conteudo_template || '');
    const [tipoDocumento, setTipoDocumento] = useState(modeloInicial?.tipo_documento || 'Ata');
    const [loading, setLoading] = useState(false);
    const isEditing = !!modeloInicial;

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

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
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
                <Textarea id="conteudo" rows={10} placeholder="Insira o template completo aqui..." value={conteudoTemplate} onChange={(e) => setConteudoTemplate(e.target.value)} disabled={loading} />
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

  const buscarModelos = useCallback(async () => {
    if (!ownerId) {
        setCarregandoModelos(false);
        return;
    }
    setCarregandoModelos(true);
    
    let query = supabase
      .from('modelos_societarios')
      .select('*')
      .eq('proprietario_id', ownerId)
      .order('titulo', { ascending: true });

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar modelos: ' + error.message);
      setModelos([]);
    } else {
      setModelos(data as ModeloSocietario[]);
    }
    setCarregandoModelos(false);
  }, [ownerId]);

  useEffect(() => {
    if (!carregandoSessao && ownerId) {
      buscarModelos();
    }
  }, [carregandoSessao, ownerId, buscarModelos]);
  
  const handleSaveComplete = () => {
    setDialogAberto(false);
    setModeloSocietarioSelecionado(null);
    buscarModelos();
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
      buscarModelos();
    }
  };
  
  const handlePreview = (modelo: ModeloSocietario) => {
      setPreviewContent(modelo.conteudo_template);
      setPreviewOpen(true);
  };
  
  const handleGenerate = (modelo: ModeloSocietario) => {
      // Redireciona para a página de geração (que será criada em breve)
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
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{modeloSelecionado ? 'Editar Modelo' : 'Novo Modelo'}</DialogTitle>
            </DialogHeader>
            <FormModeloSocietario 
              modeloInicial={modeloSelecionado}
              proprietarioId={ownerId}
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