import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileText, Eye, Trash2, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { DocumentoSocietarioGerado } from '@/types/documentos-societarios';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UsuarioProfile } from '@/types/usuario';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import ContratoPreviewDialog from '@/components/contratos/ContratoPreviewDialog';
import { useSessao } from '@/hooks/use-sessao';

interface DocumentoComCliente extends DocumentoSocietarioGerado {
    tbl_clientes: { nome: string } | null; // CORRIGIDO: Usando tbl_clientes
    modelos_societarios: { titulo: string } | null;
}

const DocumentosSocietarios: React.FC = () => {
  const { role, perfil, carregando: carregandoSessao } = useSessao();
  const [documentos, setDocumentos] = useState<DocumentoComCliente[]>([]);
  const [carregandoDocumentos, setCarregandoDocumentos] = useState(true);
  
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');

  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId();

  const buscarDocumentos = useCallback(async () => {
    if (!ownerId) {
        setCarregandoDocumentos(false);
        return;
    }
    setCarregandoDocumentos(true);
    
    let query = supabase
      .from('documentos_societarios_gerados')
      .select(`
        *,
        tbl_clientes ( nome ),
        modelos_societarios ( titulo )
      `)
      .eq('proprietario_id', ownerId)
      .order('data_registro', { ascending: false });

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar documentos: ' + error.message);
      setDocumentos([]);
    } else {
      setDocumentos(data as DocumentoComCliente[]);
    }
    setCarregandoDocumentos(false);
  }, [ownerId]);

  useEffect(() => {
    if (!carregandoSessao && ownerId) {
      buscarDocumentos();
    }
  }, [carregandoSessao, ownerId, buscarDocumentos]);
  
  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este documento gerado?')) return;

    const { error } = await supabase
      .from('documentos_societarios_gerados')
      .delete()
      .eq('id', id);

    if (error) {
      showError('Erro ao excluir documento: ' + error.message);
    } else {
      showSuccess('Documento excluído com sucesso.');
      buscarDocumentos();
    }
  };
  
  const handleView = (doc: DocumentoComCliente) => {
      setPreviewContent(doc.conteudo_renderizado || 'Conteúdo não renderizado.');
      setPreviewTitle(doc.valores_tags_preenchidos?.titulo || doc.modelos_societarios?.titulo || 'Documento');
      setPreviewOpen(true);
  };

  if (carregandoSessao || carregandoDocumentos) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!ownerId) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para gerenciar documentos.</p></CardContent></Card></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileText className="w-6 h-6 mr-2" /> Documentos Societários
        </h1>
        <div className="flex space-x-2 w-full sm:w-auto">
            <Link to="/documentos-societarios/modelos">
                <Button variant="secondary" className="w-full sm:w-auto">
                    <Building2 className="w-4 h-4 mr-2" />
                    Gerenciar Modelos
                </Button>
            </Link>
            <Link to="/documentos-societarios/blocos">
                <Button variant="secondary" className="w-full sm:w-auto">
                    <FileText className="w-4 h-4 mr-2" />
                    Gerenciar Blocos
                </Button>
            </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Documentos Gerados ({documentos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Título</TableHead>
                  <TableHead className="w-[150px]">Modelo Base</TableHead>
                  <TableHead className="w-[150px]">Cliente</TableHead>
                  <TableHead className="w-[100px]">Data Registro</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[150px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                      Nenhum documento gerado.
                    </TableCell>
                  </TableRow>
                ) : (
                  documentos.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">{doc.valores_tags_preenchidos?.titulo || doc.modelos_societarios?.titulo || 'Documento Sem Título'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{doc.modelos_societarios?.titulo || 'N/A'}</TableCell>
                      <TableCell className="text-sm">{doc.tbl_clientes?.nome || 'N/A'}</TableCell>
                      <TableCell className="text-sm">{format(parseISO(doc.data_registro), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>
                        <Badge variant={doc.status === 'finalizado' ? 'default' : 'secondary'}>
                            {doc.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                            <Button variant="outline" size="icon" onClick={() => handleView(doc)} title="Visualizar">
                                <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(doc.id)}>
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
      
      <ContratoPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        conteudoHtml={previewContent}
        titulo={previewTitle}
        isHtml={true} 
      />
    </LayoutPrincipal>
  );
};

export default DocumentosSocietarios;