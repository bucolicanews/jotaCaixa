import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, Search, History, FileDown, FileUp, Printer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import { Historico, HistoricoCSV } from '@/types/historico';
import { UsuarioProfile } from '@/types/usuario';
import { parseFile } from '@/utils/file-parser';
import Papa from 'papaparse';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import { format } from 'date-fns'; // Adicionando importação de format

// Componente de Formulário Simples (Inline)
interface FormHistoricoProps {
    historicoInicial?: Historico | null;
    proprietarioId: string;
    onSaveComplete: () => void;
}

const FormHistorico: React.FC<FormHistoricoProps> = ({ historicoInicial, proprietarioId, onSaveComplete }) => {
    const [descricao, setDescricao] = useState(historicoInicial?.descricao || '');
    const [loading, setLoading] = useState(false);
    const isEditing = !!historicoInicial;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!descricao.trim()) {
            showError('A descrição é obrigatória.');
            return;
        }
        setLoading(true);

        const dataToSave = {
            descricao: descricao.trim(),
            proprietario_id: proprietarioId,
        };

        let error = null;

        if (isEditing) {
            const result = await supabase.from('historicos').update(dataToSave).eq('id', historicoInicial.id);
            error = result.error;
        } else {
            const result = await supabase.from('historicos').insert(dataToSave);
            error = result.error;
        }

        if (error) {
            showError(`Falha ao salvar histórico: ${error.message}`);
        } else {
            showSuccess(`Histórico salvo com sucesso!`);
            onSaveComplete();
        }
        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input
                placeholder="Ex: Pagamento de Salário, Recebimento de Mensalidade"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                disabled={loading}
            />
            <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isEditing ? 'Salvar Alterações' : 'Criar Histórico')}
            </Button>
        </form>
    );
};


const GerenciarHistoricos: React.FC = () => {
  const { perfil, role, carregando: carregandoSessao } = useSessao(); // Removido 'usuario'
  const { printContent } = usePrint();
  
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [carregandoHistoricos, setCarregandoHistoricos] = useState(true);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [historicoSelecionado, setHistoricoSelecionado] = useState<Historico | null>(null);
  const [filtroTexto, setFiltroTexto] = useState('');
  const filtroTextoDebounced = useDebounce(filtroTexto, 500);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId();

  const buscarHistoricos = useCallback(async () => {
    if (!ownerId) {
        setCarregandoHistoricos(false);
        return;
    }
    setCarregandoHistoricos(true);
    
    let query = supabase
      .from('historicos')
      .select('*')
      .eq('proprietario_id', ownerId)
      .order('descricao', { ascending: true });
      
    if (filtroTextoDebounced) {
        query = query.ilike('descricao', `%${filtroTextoDebounced}%`);
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar históricos: ' + error.message);
      setHistoricos([]);
    } else {
      setHistoricos(data as Historico[]);
    }
    setCarregandoHistoricos(false);
  }, [ownerId, filtroTextoDebounced]);

  useEffect(() => {
    if (!carregandoSessao && ownerId) {
      buscarHistoricos();
    }
  }, [carregandoSessao, ownerId, buscarHistoricos]);

  const handleSaveComplete = () => {
    setDialogAberto(false);
    setHistoricoSelecionado(null);
    buscarHistoricos();
  };

  const handleEdit = (historico: Historico) => {
    setHistoricoSelecionado(historico);
    setDialogAberto(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este histórico?')) return;

    const { error } = await supabase
      .from('historicos')
      .delete()
      .eq('id', id);

    if (error) {
      showError('Erro ao excluir histórico: ' + error.message);
    } else {
      showSuccess('Histórico excluído com sucesso.');
      buscarHistoricos();
    }
  };
  
  // --- Importação ---
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setImportFile(event.target.files[0]);
    } else {
      setImportFile(null);
    }
  };
  
  const handleImport = async () => {
    if (!importFile || !ownerId) {
      showError('Selecione um arquivo e garanta que o proprietário esteja definido.');
      return;
    }
    setImportLoading(true);

    try {
      const parsedData: (HistoricoCSV)[] = await parseFile(importFile);

      if (parsedData.length === 0) {
        showError('O arquivo está vazio ou o formato está incorreto. Use a coluna "Descrição".');
        setImportLoading(false);
        return;
      }

      const historicosParaInserir = parsedData.map(h => ({
        proprietario_id: ownerId,
        descricao: h.Descrição.trim(),
      })).filter(h => h.descricao.length > 0);
      
      if (historicosParaInserir.length === 0) {
          showError('Nenhum histórico válido encontrado para inserção.');
          setImportLoading(false);
          return;
      }

      // Inserir novos dados (o RLS garante que apenas o proprietário insira)
      const { error: insertError } = await supabase
        .from('historicos')
        .insert(historicosParaInserir);

      if (insertError) {
        throw new Error('Erro ao inserir históricos: ' + insertError.message);
      }

      showSuccess(`${historicosParaInserir.length} históricos importados com sucesso!`);
      setImportFile(null);
      buscarHistoricos();

    } catch (error) {
      console.error('Erro durante a importação:', error);
      showError('Falha na importação: ' + (error as Error).message);
    } finally {
      setImportLoading(false);
    }
  };
  
  // --- Exportação ---
  const handleExportCSV = () => {
    if (historicos.length === 0) {
        showError('Nenhum histórico para exportar.');
        return;
    }
    
    const dataToExport = historicos.map(h => ({
        Descrição: h.descricao,
    }));

    const csv = Papa.unparse(dataToExport, {
        header: true,
        delimiter: ';',
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `historicos_${format(new Date(), 'yyyyMMdd')}.csv`);
    link.click();
    
    showSuccess('Exportação CSV concluída!');
  };
  
  // --- Impressão ---
  const handlePrint = () => {
    if (historicos.length === 0) {
        showError('Nenhum histórico para imprimir.');
        return;
    }
    
    const printComponent = (
        <div style={{ padding: '20px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold' }}>Relatório de Históricos Cadastrados</h1>
            <p style={{ fontSize: '14px' }}>Proprietário ID: {ownerId}</p>
            <table className="print-table" style={{ marginTop: '20px' }}>
                <thead>
                    <tr>
                        <th style={{ width: '80%' }}>Descrição</th>
                        <th style={{ width: '20%' }}>Criado em</th>
                    </tr>
                </thead>
                <tbody>
                    {historicos.map((h) => (
                        <tr key={h.id}>
                            <td>{h.descricao}</td>
                            <td>{new Date(h.criado_em).toLocaleDateString('pt-BR')}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
    printContent(htmlContent, `Historicos - ${format(new Date(), 'yyyyMMdd')}`);
  };


  if (carregandoSessao || carregandoHistoricos) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!ownerId) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para gerenciar históricos.</p></CardContent></Card></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <History className="w-6 h-6 mr-2" /> Gerenciar Históricos
        </h1>
        <div className="flex space-x-2 w-full sm:w-auto">
            <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
              <DialogTrigger asChild>
                <Button onClick={() => setHistoricoSelecionado(null)} className="w-full sm:w-auto">
                  <PlusCircle className="w-4 h-4 mr-2" />
                  Novo Histórico
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>{historicoSelecionado ? 'Editar Histórico' : 'Novo Histórico'}</DialogTitle>
                </DialogHeader>
                <FormHistorico 
                  historicoInicial={historicoSelecionado}
                  proprietarioId={ownerId}
                  onSaveComplete={handleSaveComplete}
                />
              </DialogContent>
            </Dialog>
        </div>
      </div>
      
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-lg">Importação e Exportação</CardTitle></CardHeader>
        <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 space-y-2">
                    <Input 
                        id="import-file" 
                        type="file" 
                        accept=".csv,.json" 
                        onChange={handleFileChange} 
                        className="w-full"
                        disabled={importLoading}
                    />
                    <Button 
                        onClick={handleImport} 
                        disabled={!importFile || importLoading}
                        className="w-full"
                    >
                        {importLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                        Importar Históricos (CSV/JSON)
                    </Button>
                    <p className="text-xs text-muted-foreground">Formato CSV esperado: Coluna "Descrição".</p>
                </div>
                <div className="flex-1 space-y-2">
                    <Button onClick={handleExportCSV} variant="secondary" className="w-full h-10" disabled={historicos.length === 0}>
                        <FileDown className="w-4 h-4 mr-2" /> Exportar Históricos (CSV)
                    </Button>
                    <Button onClick={handlePrint} variant="outline" className="w-full h-10" disabled={historicos.length === 0}>
                        <Printer className="w-4 h-4 mr-2" /> Imprimir Relatório
                    </Button>
                </div>
            </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle className="text-xl">Históricos Cadastrados ({historicos.length})</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por descrição..."
                    value={filtroTexto}
                    onChange={(e) => setFiltroTexto(e.target.value)}
                    className="pl-10 max-w-sm"
                />
            </div>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Descrição</TableHead>
                            <TableHead className="w-[150px] hidden sm:table-cell">Criado em</TableHead>
                            <TableHead className="w-[100px] text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {historicos.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                                    Nenhum histórico cadastrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            historicos.map((h) => (
                                <TableRow key={h.id}>
                                    <TableCell className="font-medium">{h.descricao}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{new Date(h.criado_em).toLocaleDateString('pt-BR')}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end space-x-2">
                                            <Button variant="ghost" size="sm" onClick={() => handleEdit(h)}>
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => handleDelete(h.id)}>
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

export default GerenciarHistoricos;