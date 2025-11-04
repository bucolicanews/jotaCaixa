import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, Banknote } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfiguracaoBanco } from '@/types/conciliacao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import FormConfiguracaoBanco from './FormConfiguracaoBanco';

const GerenciarConfiguracoesBanco: React.FC = () => {
  const { perfil, role, usuario, carregando: carregandoSessao } = useSessao();
  const [configs, setConfigs] = useState<ConfiguracaoBanco[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [configSelecionada, setConfigSelecionada] = useState<ConfiguracaoBanco | null>(null);

  const getEmpresaId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
    return null;
  };
  
  const empresaId = getEmpresaId();

  const buscarConfiguracoes = useCallback(async () => {
    if (!empresaId) {
        setCarregando(false);
        return;
    }
    
    setCarregando(true);
    
    const { data, error } = await supabase
      .from('configuracoes_banco')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nome_banco', { ascending: true });

    if (error) {
      showError('Erro ao carregar configurações de banco: ' + error.message);
      setConfigs([]);
    } else {
      setConfigs(data as ConfiguracaoBanco[]);
    }
    setCarregando(false);
  }, [empresaId]);

  useEffect(() => {
    if (!carregandoSessao && empresaId) {
      buscarConfiguracoes();
    }
  }, [carregandoSessao, empresaId, buscarConfiguracoes]);

  const handleSaveComplete = () => {
    setDialogOpen(false);
    setConfigSelecionada(null);
    buscarConfiguracoes();
  };

  const handleEdit = (config: ConfiguracaoBanco) => {
    setConfigSelecionada(config);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta configuração de banco?')) return;

    const { error } = await supabase
      .from('configuracoes_banco')
      .delete()
      .eq('id', id);

    if (error) {
      showError('Erro ao excluir configuração: ' + error.message);
    } else {
      showSuccess('Configuração excluída com sucesso.');
      buscarConfiguracoes();
    }
  };

  if (carregandoSessao || carregando) {
    return <div className="flex justify-center items-center h-32"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  
  if (!empresaId) {
      return <p className="text-red-500">Você não está vinculado a uma empresa para gerenciar configurações de banco.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setConfigSelecionada(null)} size="sm">
              <PlusCircle className="w-4 h-4 mr-2" />
              Nova Configuração
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{configSelecionada ? 'Editar Configuração' : 'Nova Configuração de Banco'}</DialogTitle>
            </DialogHeader>
            <FormConfiguracaoBanco 
              configInicial={configSelecionada}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Banco</TableHead>
              <TableHead>Mapeamento (Data, Valor, Tipo)</TableHead>
              <TableHead className="w-[100px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                  Nenhuma configuração de banco cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              configs.map((config) => (
                <TableRow key={config.id}>
                  <TableCell className="font-medium flex items-center">
                    <Banknote className="w-4 h-4 mr-2" /> {config.nome_banco}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    Data: {config.mapeamento['Data']} | Valor: {config.mapeamento['Valor']} | Tipo Coluna: {config.coluna_tipo_transacao || 'N/A'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(config)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(config.id)}>
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
    </div>
  );
};

export default GerenciarConfiguracoesBanco;