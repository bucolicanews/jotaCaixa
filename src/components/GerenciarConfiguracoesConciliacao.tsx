import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, Banknote } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfiguracaoConciliacao } from '@/types/conciliacao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import FormConfiguracaoConciliacao from './FormConfiguracaoConciliacao';

// Tipo que inclui o nome da conta de saldo para exibição
interface ConfiguracaoComConta extends ConfiguracaoConciliacao {
    saldo_contas: {
        nome: string;
    } | null;
}

const GerenciarConfiguracoesConciliacao: React.FC = () => {
  const { perfil, role, usuario, carregando: carregandoSessao } = useSessao();
  const [configs, setConfigs] = useState<ConfiguracaoComConta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [configSelecionada, setConfigSelecionada] = useState<ConfiguracaoConciliacao | null>(null);

  const getProprietarioId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
    return null;
  };
  
  const proprietarioId = getProprietarioId();

  const buscarConfiguracoes = useCallback(async () => {
    if (!proprietarioId) {
        setCarregando(false);
        return;
    }
    
    setCarregando(true);
    
    const { data, error } = await supabase
      .from('configuracao_conciliacao')
      .select('*, saldo_contas ( nome )') // Buscar o nome da conta de saldo
      .eq('proprietario_id', proprietarioId)
      .order('nome_configuracao', { ascending: true });

    if (error) {
      showError('Erro ao carregar configurações de conciliação: ' + error.message);
      setConfigs([]);
    } else {
      setConfigs(data as ConfiguracaoComConta[]);
    }
    setCarregando(false);
  }, [proprietarioId]);

  useEffect(() => {
    if (!carregandoSessao && proprietarioId) {
      buscarConfiguracoes();
    }
  }, [carregandoSessao, proprietarioId, buscarConfiguracoes]);

  const handleSaveComplete = () => {
    setDialogOpen(false);
    setConfigSelecionada(null);
    buscarConfiguracoes();
  };

  const handleEdit = (config: ConfiguracaoConciliacao) => {
    // Passamos apenas os campos da ConfiguracaoConciliacao para o formulário de edição
    setConfigSelecionada(config);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta configuração de conciliação?')) return;

    const { error } = await supabase
      .from('configuracao_conciliacao')
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
  
  if (!proprietarioId) {
      return <p className="text-red-500">Você não está vinculado a uma empresa para gerenciar configurações de conciliação.</p>;
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
              <DialogTitle>{configSelecionada ? 'Editar Configuração' : 'Nova Configuração de Conciliação'}</DialogTitle>
            </DialogHeader>
            <FormConfiguracaoConciliacao 
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
              <TableHead className="w-[200px]">Configuração</TableHead>
              <TableHead className="w-[200px]">Conta de Saldo Interna</TableHead>
              <TableHead>Mapeamento (Data, Valor, Tipo)</TableHead>
              <TableHead className="w-[100px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                  Nenhuma configuração de conciliação cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              configs.map((config) => (
                <TableRow key={config.id}>
                  <TableCell className="font-medium flex items-center">
                    <Banknote className="w-4 h-4 mr-2" /> {config.nome_configuracao}
                  </TableCell>
                  <TableCell className="font-medium">
                    {config.saldo_contas?.nome || 'Conta Não Encontrada'}
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

export default GerenciarConfiguracoesConciliacao;