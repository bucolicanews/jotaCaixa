import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileText, Eye, Trash2, Building2, Edit, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { DocumentoSocietarioGerado } from '@/types/documentos-societarios';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import ContratoPreviewDialog from '@/components/contratos/ContratoPreviewDialog';
import { cn } from '@/lib/utils';

interface DocumentoComCliente extends DocumentoSocietarioGerado {
  cliente_nome: string | null;
  modelos_societarios: { titulo: string, tipo_conteudo: 'html' | 'texto' } | null;
}

const DocumentosSocietarios: React.FC = () => {
  const { role, perfil, carregando: carregandoSessao } = useSessao();
  const navigate = useNavigate();
  const [documentos, setDocumentos] = useState<DocumentoComCliente[]>([]);
  const [carregandoDocumentos, setCarregandoDocumentos] = useState(true);
  
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [isPreviewHtml, setIsPreviewHtml] = useState(true);
  
  const [clienteNomeMap, setClienteNomeMap] = useState<Record<string, string>>({});

  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') {
      const user = perfil as UsuarioProfile | AdminUsuarioProfile;
      if ('admin_id' in user && user.admin_id) return user.admin_id;
      if ('cliente_id' in user && user.cliente_id) return user.cliente_id;
    }
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
        modelos_societarios ( titulo, tipo_conteudo )
      `)
      .eq('proprietario_id', ownerId)
      .order('data_registro', { ascending: false });

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar documentos: ' + error.message);
      setDocumentos([]);
    } else {
      const fetchedDocs = data as DocumentoComCliente[];
      const clienteIds = Array.from(new Set(fetchedDocs.map(d => d.cliente_id).filter((id): id is string => !!id)));
      
      const { data: clientesData } = await supabase
          .from('tbl_clientes')
          .select('id, nome')
          .in('id', clienteIds);
          
      const nomeMap = (clientesData || []).reduce((acc, c) => {
          acc[c.id] = c.nome;
          return acc;
      }, {} as Record<string, string>);
      setClienteNomeMap(nomeMap);
      
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
  
  const handleEdit = (doc: DocumentoComCliente) => {
      if (!doc.modelo_id) {
          showError('Modelo base não encontrado para edição.');
          return;
      }
      navigate(`/documentos-societarios/gerar/${doc.modelo_id}?documentoId=${doc.id}`);
  };
  
  const handleView = (doc: DocumentoComCliente) => {
      setPreviewContent(doc.conteudo_renderizado || 'Conteúdo não renderizado.');
      setPreviewTitle(doc.valores_tags_preenchidos?.titulo || doc.modelos_societarios?.titulo || 'Documento');
      const isHtml = doc.valores_tags_preenchidos?.tipo_conteudo === 'html' || doc.modelos_societarios?.tipo_conteudo === 'html';
      setIsPreviewHtml(isHtml);
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
    return (
      <LayoutPrincipal>
        <Card className="mt-8">
          <CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader>
          <CardContent><p>Você não tem permissão para gerenciar documentos.</p></CardContent>
        </Card>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      {/* HEADER RESPONSIVO */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center">
            <FileText className="w-8 h-8 mr-3 text-primary" /> Documentos Societários
          </h1>
          <p className="text-muted-foreground mt-1">Gerencie os documentos gerados para seus clientes.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <Link to="/documentos-societarios/modelos" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full">
                    <Building2 className="w-4 h-4 mr-2" />
                    Modelos
                </Button>
            </Link>
            <Link to="/documentos-societarios/blocos" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full">
                    <FileText className="w-4 h-4 mr-2" />
                    Blocos
                </Button>
            </Link>
            <Link to="/documentos-societarios/modelos" className="w-full sm:w-auto">
                <Button variant="default" className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Documento
                </Button>
            </Link>
        </div>
      </div>

      <Card className="overflow-hidden border-none shadow-md">
        <CardHeader className="bg-muted/30 border-b">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Documentos Gerados</span>
            <Badge variant="outline" className="ml-2">{documentos.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto no-scrollbar">
            <Table>
              <TableHeader className="bg-muted/10">
                <TableRow>
                  <TableHead className="min-w-[200px]">Título</TableHead>
                  <TableHead className="min-w-[150px]">Cliente</TableHead>
                  <TableHead className="min-w-[120px]">Data</TableHead>
                  <TableHead className="min-w-[100px]">Status</TableHead>
                  <TableHead className="text-right pr-6">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground italic">
                      Nenhum documento gerado até o momento.
                    </TableCell>
                  </TableRow>
                ) : (
                  documentos.map((doc) => (
                    <TableRow key={doc.id} className="hover:bg-muted/5 transition-colors">
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold text-sm md:text-base">
                            {doc.valores_tags_preenchidos?.titulo || doc.modelos_societarios?.titulo || 'Documento Sem Título'}
                          </span>
                          <span className="text-xs text-muted-foreground sm:hidden">
                             Modelo: {doc.modelos_societarios?.titulo || 'N/A'}
                          </span>
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                             Base: {doc.modelos_societarios?.titulo || 'N/A'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">{doc.cliente_nome}</span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(parseISO(doc.data_registro), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className="capitalize"
                          variant={doc.status === 'finalizado' ? 'default' : 'secondary'}
                        >
                            {doc.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex justify-end items-center gap-1 sm:gap-2">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              onClick={() => handleEdit(doc)} 
                              title="Editar"
                            >
                                <Edit className="w-4 h-4" />
                            </Button>
                            
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 text-slate-600 hover:text-slate-900"
                              onClick={() => handleView(doc)} 
                              title="Visualizar"
                            >
                                <Eye className="w-4 h-4" />
                            </Button>
                            
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDelete(doc.id)}
                              title="Excluir"
                            >
                                <Trash2 className="w-4 h-4" />
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
        isHtml={isPreviewHtml} 
      />
    </LayoutPrincipal>
  );
};

export default DocumentosSocietarios;