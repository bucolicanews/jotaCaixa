import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileText, Eye, Trash2, Building2, Edit } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { DocumentoSocietarioGerado } from '@/types/documentos-societarios';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UsuarioProfile, ClienteProfile } from '@/types/usuario';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import ContratoPreviewDialog from '@/components/contratos/ContratoPreviewDialog';

interface DocumentoComCliente extends DocumentoSocietarioGerado {
    cliente_nome: string | null; // NOVO CAMPO
    modelos_societarios: { titulo: string } | null; // tipo_conteudo removido
}

const DocumentosSocietarios: React.FC = () => {
  const { role, perfil, carregando: carregandoSessao } = useSessao();
  const navigate = useNavigate(); // Inicializando useNavigate
  const [documentos, setDocumentos] = useState<DocumentoComCliente[]>([]);
  const [carregandoDocumentos, setCarregandoDocumentos] = useState(true);
  
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  // const [isPreviewHtml, setIsPreviewHtml] = useState(true); // Removido
  
  const [clienteNomeMap, setClienteNomeMap] = useState<Record<string, string>>({}); // NOVO ESTADO

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
        id,
        modelo_id,
        cliente_id,
        proprietario_id,
        status,
        valores_tags_preenchidos,
        conteudo_renderizado,
        data_registro,
        criado_em,
        modelos_societarios ( titulo )
      `) // tipo_conteudo removido da seleção
      .eq('proprietario_id', ownerId)
      .order('data_registro', { ascending: false });

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar documentos: ' + error.message);
      setDocumentos([]);
    } else {
      const fetchedDocs = data as DocumentoComCliente[];
      
      // 1. Coletar IDs de clientes
      const clienteIds = Array.from(new Set(fetchedDocs.map(d => d.cliente_id).filter((id): id is string => !!id)));
      
      // 2. Buscar nomes dos clientes (usando tbl_clientes, que é a fonte de dados para clientes do sistema)
      const { data: clientesData } = await supabase
          .from('tbl_clientes')
          .select('id, nome')
          .in('id', clienteIds);
          
      const nomeMap = (clientesData || []).reduce((acc, c) => {
          acc[c.id] = c.nome;
          return acc;
      }, {} as Record<string, string>);
      setClienteNomeMap(nomeMap);
      
      // 3. Mapear o nome do cliente no frontend
      const documentosComNome = fetchedDocs.map(doc => ({
          ...doc,
          cliente_nome: doc.cliente_id ? nomeMap[doc.cliente_id] || 'N/A' : 'N/A',
      }));
      
      setDocumentos(documentosComNome);
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
  
  // NOVO HANDLER: Edição
  const handleEdit = (doc: DocumentoComCliente) => {
      if (!doc.modelo_id) {
          showError('Modelo base não encontrado para edição.');
          return;
      }
      // Redireciona para a página de geração, passando o ID do documento para edição
      navigate(`/documentos-societarios/gerar/${doc.modelo_id}?documentoId=${doc.id}`);
  };
  
  const handleView = (doc: DocumentoComCliente) => {
      setPreviewContent(doc.conteudo_renderizado || 'Conteúdo não renderizado.');
      setPreviewTitle(doc.valores_tags_preenchidos?.titulo || doc.modelos_societarios?.titulo || 'Documento');
      // Assume-se que o conteúdo é HTML
      // setIsPreviewHtml(true); 
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
                      <TableCell className="text-sm">{doc.cliente_nome}</TableCell>
                      <TableCell className="text-sm">{format(parseISO(doc.data_registro), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>
                        <Badge variant={doc.status === 'finalizado' ? 'default' : 'secondary'}>
                            {doc.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(doc)} title="Editar Documento">
                                <Edit className="w-4 h-4" />
                            </Button>
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
      />
    </LayoutPrincipal>
  );
};

export default DocumentosSocietarios;