import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FileText, PlusCircle, Edit, Trash2, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { DocumentoSocietarioGerado } from '@/types/documentos-societarios';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';

// Extensão local para DocumentoSocietarioGerado
type DocumentoStatus = 'rascunho' | 'finalizado' | 'arquivado' | 'ativo';

interface ExtendedDocumentoSocietarioGerado extends DocumentoSocietarioGerado {
    titulo: string;
    modelo_titulo: string;
    status: DocumentoStatus;
}

type DocumentoComCliente = ExtendedDocumentoSocietarioGerado & { clientes: { nome: string } | null };

const DocumentosSocietarios: React.FC = () => {
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  const [documentos, setDocumentos] = useState<DocumentoComCliente[]>([]);
  const [carregando, setCarregando] = useState(true);

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  
  const getOwnerId = () => {
    if (isAdmin) return usuario?.id || null;
    if (isCliente) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.proprietario_id;
    return null;
  };
  
  const ownerId = getOwnerId();

  const buscarDocumentos = useCallback(async () => {
    if (!ownerId && !isAdmin) {
        setDocumentos([]);
        setCarregando(false);
        return;
    }
    
    setCarregando(true);
    
    let query = supabase
      .from('documentos_societarios_gerados')
      .select('*, clientes(nome)')
      .order('criado_em', { ascending: false });
      
    // Se for Cliente/Usuário, filtra apenas pelos seus documentos
    if (!isAdmin && ownerId) {
        query = query.eq('proprietario_id', ownerId);
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar documentos: ' + error.message);
      setDocumentos([]);
    } else {
      setDocumentos(data as DocumentoComCliente[]);
    }
    setCarregando(false);
  }, [ownerId, isAdmin]);

  useEffect(() => {
    if (!carregandoSessao && (isAdmin || ownerId)) {
      buscarDocumentos();
    }
  }, [carregandoSessao, isAdmin, ownerId, buscarDocumentos]);
  
  const handleDelete = async (documentoId: string) => {
      if (!window.confirm('Tem certeza que deseja excluir este documento societário? Esta ação é irreversível.')) {
          return;
      }
      
      const { error } = await supabase
          .from('documentos_societarios_gerados')
          .delete()
          .eq('id', documentoId);
          
      if (error) {
          showError('Falha ao excluir documento: ' + error.message);
      } else {
          showSuccess('Documento excluído com sucesso!');
          buscarDocumentos();
      }
  };

  if (carregandoSessao || carregando) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!ownerId && !isAdmin) {
      return (
          <LayoutPrincipal>
              <Card><CardContent className="p-6">Você não tem permissão para visualizar documentos societários.</CardContent></Card>
          </LayoutPrincipal>
      );
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileText className="w-6 h-6 mr-2" /> Documentos Societários Gerados
        </h1>
        <Link to="/documentos-societarios/novo">
            <Button className="w-full sm:w-auto">
                <PlusCircle className="w-4 h-4 mr-2" />
                Novo Documento
            </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Documentos ({documentos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Modelo Base</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[120px]">Criado em</TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                      Nenhum documento societário gerado.
                    </TableCell>
                  </TableRow>
                ) : (
                  documentos.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">{doc.titulo}</TableCell>
                      <TableCell>{doc.clientes?.nome || 'N/A'}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{doc.modelo_titulo}</TableCell>
                      <TableCell>
                          <Badge variant={doc.status === 'ativo' ? 'default' : 'secondary'}>
                              {doc.status}
                          </Badge>
                      </TableCell>
                      <TableCell>{format(new Date(doc.criado_em), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                            <Link to={`/documentos-societarios/visualizar/${doc.id}`}>
                                <Button variant="ghost" size="icon" title="Visualizar">
                                    <Eye className="w-4 h-4" />
                                </Button>
                            </Link>
                            <Link to={`/documentos-societarios/editar/${doc.id}`}>
                                <Button variant="ghost" size="icon" title="Editar">
                                    <Edit className="w-4 h-4" />
                                </Button>
                            </Link>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(doc.id)} title="Excluir">
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
    </LayoutPrincipal>
  );
};

export default DocumentosSocietarios;