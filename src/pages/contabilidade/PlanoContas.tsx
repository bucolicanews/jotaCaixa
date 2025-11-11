import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Loader2,
  Edit,
  Trash2,
  PlusCircle,
  Filter,
  Search,
  ArrowUp,
  ArrowRight,
  BookOpen,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { PlanoContas } from '@/types/plano-contas';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormPlanoContas from '@/components/formularios/FormPlanoContas';
import ImportarPlanoContas from '@/components/contabilidade/ImportarPlanoContas';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import EditableCell from '@/components/contabilidade/EditableCell';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import EditableSelectCell from '@/components/contabilidade/EditableSelectCell'; // NOVO IMPORT

// Tipo para inicializar o formulário de nova conta
interface NovaContaInicial {
    Conta: string;
    Analitica: 'Sim' | 'Não';
}

// Mapeamento de cores para os níveis hierárquicos
const NIVEL_COLORS: Record<number, string> = {
    1: 'bg-blue-500/10 hover:bg-blue-500/20',
    2: 'bg-green-500/10 hover:bg-green-500/20',
    3: 'bg-yellow-500/10 hover:bg-yellow-500/20',
    4: 'bg-red-500/10 hover:bg-red-500/20',
    5: 'bg-purple-500/10 hover:bg-purple-500/20',
};

// Componentes utilitários de Tabela (Baseados em shadcn/ui)
const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  function TableRow({ className, children, ...props }, ref) {
    return (
      <tr
        ref={ref}
        className={cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className)}
        {...props}
      >
        {children}
      </tr>
    );
  }
);

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  function TableHead({ className, children, ...props }, ref) {
    return (
      <th
        ref={ref}
        className={cn("h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", className)}
        {...props}
      >
        {children}
      </th>
    );
  }
);

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  function TableCell({ className, children, ...props }, ref) {
    return (
      <td
        ref={ref}
        className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
        {...props}
      >
        {children}
      </td>
    );
  }
);


const PlanoContasPage = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [contas, setContas] = useState<PlanoContas[]>([]);
  const [carregandoContas, setCarregandoContas] = useState(true);
  const [proprietarioId, setProprietarioId] = useState<string | null>(null);
  
  // Estado para edição (conta existente)
  const [contaSelecionada, setContaSelecionada] = useState<PlanoContas | null>(null);
  // Estado para criação (nova conta hierárquica)
  const [novaContaInicial, setNovaContaInicial] = useState<NovaContaInicial | null>(null);
  
  const [dialogAberto, setDialogAberto] = useState(false);
  
  // NOVO ESTADO: Conta clicada para navegação hierárquica
  const [contaClicada, setContaClicada] = useState<PlanoContas | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [mascaraAtiva, setMascaraAtiva] = useState<string | null>(null); // NOVO ESTADO PARA MÁSCARA

  // Estados dos filtros
  const [filtroTexto, setFiltroTexto] = useState('');
  const filtroTextoDebounced = useDebounce(filtroTexto, 500);
  const [filtroTipoConta, setFiltroTipoConta] = useState('todos');
  const [filtroAnalitica, setFiltroAnalitica] = useState('todos');

  const fetchMascara = useCallback(async (id: string) => {
    const { data, error } = await supabase
        .from('configuracao_plano_contas')
        .select('mascara_codigo')
        .eq('proprietario_id', id)
        .limit(1)
        .maybeSingle();
        
    if (error) {
        console.error('Erro ao buscar máscara:', error);
    }
    setMascaraAtiva(data?.mascara_codigo || null);
  }, []);

  const buscarPlanoContas = useCallback(async (id: string) => {
    setCarregandoContas(true);
    let query = supabase
      .from('plano_contas')
      .select('*')
      .eq('proprietario_id', id);

    // Aplicar filtro de texto
    if (filtroTextoDebounced) {
      const searchTerm = `%${filtroTextoDebounced}%`;
      query = query.or(
        `Conta.ilike.${searchTerm},codigo_reduzido.ilike.${searchTerm},Descricao.ilike.${searchTerm}`
      );
    }

    // Aplicar filtro de tipo de conta
    if (filtroTipoConta !== 'todos') {
      let prefix = '';
      if (filtroTipoConta === 'ativo') prefix = '1';
      if (filtroTipoConta === 'passivo') prefix = '2';
      if (filtroTipoConta === 'receita') prefix = '3';
      if (filtroTipoConta === 'despesa') prefix = '4';
      query = query.like('Conta', `${prefix}.%`);
    }

    // Aplicar filtro de analítica
    if (filtroAnalitica !== 'todos') {
      query = query.eq('Analitica', filtroAnalitica);
    }

    query = query.order('Conta', { ascending: true });

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar Plano de Contas: ' + error.message);
      setContas([]);
    } else {
      setContas(data as PlanoContas[]);
    }
    setCarregandoContas(false);
  }, [filtroTextoDebounced, filtroTipoConta, filtroAnalitica]);

  useEffect(() => {
    if (!carregandoSessao && usuario) {
      let ownerId: string | null = null;

      if (role === 'Admin') {
          ownerId = usuario.id;
      } else if (role === 'Cliente') {
          ownerId = (perfil as ClienteProfile)?.id || null;
      } else if (role === 'Usuario') {
          ownerId = (perfil as UsuarioProfile)?.cliente_id || null;
      }
      
      if (ownerId) {
          setProprietarioId(ownerId);
          fetchMascara(ownerId); // Busca a máscara ao definir o proprietário
      } else {
          setCarregandoContas(false);
      }
    } else if (!carregandoSessao && !usuario) {
        setCarregandoContas(false);
    }
  }, [carregandoSessao, usuario, perfil, role, fetchMascara]);

  useEffect(() => {
    if (proprietarioId) {
      buscarPlanoContas(proprietarioId);
    }
  }, [proprietarioId, buscarPlanoContas]);

  const handleImportComplete = () => {
    if (proprietarioId) {
      buscarPlanoContas(proprietarioId);
    }
  };

  const handleSaveComplete = () => {
    setDialogAberto(false);
    setContaSelecionada(null);
    setNovaContaInicial(null); // Limpa o estado de nova conta
    if (proprietarioId) {
      buscarPlanoContas(proprietarioId);
    }
  };
  
  // Função de sucesso para o EditableCell
  const handleInlineSaveSuccess = () => {
      if (proprietarioId) {
          buscarPlanoContas(proprietarioId);
      }
  };

  const handleEdit = (conta: PlanoContas) => {
    setContaSelecionada(conta);
    setNovaContaInicial(null); // Garante que não estamos no modo de nova conta hierárquica
    setDialogAberto(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta conta?')) return;

    try {
        // 1. Anular referências em tabelas dependentes
        await supabase.from('saldo_contas').update({ conta_contabil_id: null }).eq('conta_contabil_id', id);
        await supabase.from('lancamentos').update({ conta_contabil_id: null }).eq('conta_contabil_id', id);
        await supabase.from('configuracao_contas_receber').update({ conta_contabil_id: null }).eq('conta_contabil_id', id);
        await supabase.from('configuracao_contas_pagar').update({ conta_contabil_id: null }).eq('conta_contabil_id', id);
        
        // 2. Deletar a conta
        const { error: deleteError } = await supabase
            .from('plano_contas')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        showSuccess('Conta excluída com sucesso.');
        if (proprietarioId) {
            buscarPlanoContas(proprietarioId);
        }
    } catch (error: any) {
        console.error('Erro ao excluir conta:', error);
        showError('Falha ao excluir conta: ' + error.message);
    }
  };

  // Função para lidar com o clique na conta (para navegação hierárquica)
  const handleContaClick = (conta: PlanoContas) => {
    if (conta.Analitica === 'Não') {
        setContaClicada(conta);
        setPopoverOpen(true);
    } else {
        // Se for analítica, não faz nada ou abre edição
        handleEdit(conta);
    }
  };
  
  // Função para criar nova conta abaixo (filha)
  const handleNovaContaAbaixo = (contaPai: PlanoContas) => {
      setNovaContaInicial({
          Conta: contaPai.Conta + '.', 
          Analitica: 'Sim', 
      });
      setContaSelecionada(null);
      setDialogAberto(true);
      setPopoverOpen(false);
  };
  
  // Função para criar nova conta no mesmo nível (irmã)
  const handleNovaContaNivel = (contaIrma: PlanoContas) => {
      const partes = contaIrma.Conta.split('.');
      partes.pop(); 
      const prefixo = partes.join('.');
      
      setNovaContaInicial({
          Conta: prefixo + '.', 
          Analitica: contaIrma.Analitica, 
      });
      setContaSelecionada(null);
      setDialogAberto(true);
      setPopoverOpen(false);
  };

  // Renderização da Tabela
  const renderTabela = () => {
    if (carregandoContas) {
      return (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (contas.length === 0) {
      return (
        <p className="text-center text-gray-500 mt-8">
          Nenhuma conta encontrada. Comece importando ou cadastrando uma nova.
        </p>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <TableRow className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
              <TableHead className="w-[150px]">Conta</TableHead>
              <TableHead className="w-[100px] text-center">Reduzido</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-[100px] text-center">Analítica</TableHead>
              <TableHead className="w-[100px] text-center">Ações</TableHead>
            </TableRow>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {contas.map((conta) => {
              const nivel = conta.Conta.split('.').length;
              const isContaPai = conta.Analitica === 'Não';
              
              return (
                <TableRow 
                  key={conta.id} 
                  className={cn(
                    NIVEL_COLORS[nivel] || 'hover:bg-gray-50/50',
                    isContaPai && 'font-semibold'
                  )}
                >
                  <TableCell 
                    className={cn(
                        "font-mono cursor-pointer",
                        isContaPai && "text-primary hover:underline"
                    )}
                    onClick={() => handleContaClick(conta)}
                  >
                    {conta.Conta}
                  </TableCell>
                  
                  <TableCell className="text-center">
                    <EditableCell
                      id={conta.id}
                      initialValue={conta.codigo_reduzido}
                      fieldName="codigo_reduzido"
                      onSaveSuccess={handleInlineSaveSuccess}
                      isEditable={true} 
                    />
                  </TableCell>
                  
                  <TableCell>
                    <EditableCell
                      id={conta.id}
                      initialValue={conta.Descricao}
                      fieldName="Descricao"
                      onSaveSuccess={handleInlineSaveSuccess}
                      isEditable={true} 
                    />
                  </TableCell>
                  
                  {/* AQUI: USANDO O NOVO COMPONENTE PARA EDIÇÃO INLINE DE SELEÇÃO */}
                  <TableCell className="text-center">
                    <EditableSelectCell
                      id={conta.id}
                      initialValue={conta.Analitica as 'Sim' | 'Não'}
                      fieldName="Analitica"
                      onSaveSuccess={handleInlineSaveSuccess}
                      isEditable={true} 
                    />
                  </TableCell>
                  
                  <TableCell className="text-center">
                    <div className="flex justify-center space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(conta)}
                        title="Editar Conta"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(conta.id)}
                        title="Excluir Conta"
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <BookOpen className="w-6 h-6 mr-2" /> Plano de Contas
      </h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xl font-medium">
            Contas Contábeis ({contas.length})
          </CardTitle>
          <div className="flex space-x-2">
            <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
              <DialogTrigger asChild>
                <Button 
                  size="sm" 
                  className="h-8 gap-1"
                  onClick={() => {
                    setContaSelecionada(null);
                    setNovaContaInicial(null);
                  }}
                >
                  <PlusCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Nova Conta</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>{contaSelecionada ? 'Editar Conta' : 'Cadastrar Nova Conta'}</DialogTitle>
                </DialogHeader>
                {proprietarioId && (
                  <FormPlanoContas 
                    proprietarioId={proprietarioId}
                    initialData={contaSelecionada || novaContaInicial}
                    onSaveSuccess={handleSaveComplete}
                    mascaraAtiva={mascaraAtiva}
                  />
                )}
              </DialogContent>
            </Dialog>
            
            {proprietarioId && (
              <ImportarPlanoContas 
                proprietarioId={proprietarioId} 
                onImportComplete={handleImportComplete} 
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por Conta, Código ou Descrição..."
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-4">
              <Select value={filtroTipoConta} onValueChange={setFiltroTipoConta}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filtrar por Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Tipos</SelectItem>
                  <SelectItem value="ativo">Ativo (1)</SelectItem>
                  <SelectItem value="passivo">Passivo (2)</SelectItem>
                  <SelectItem value="receita">Receita (3)</SelectItem>
                  <SelectItem value="despesa">Despesa (4)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtroAnalitica} onValueChange={setFiltroAnalitica}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filtrar Analítica" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  <SelectItem value="Sim">Analítica (Sim)</SelectItem>
                  <SelectItem value="Não">Sintética (Não)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {renderTabela()}
          
          {/* Popover para Ações Hierárquicas */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
                {/* Trigger invisível, ativado via estado */}
                <Button variant="ghost" className="hidden" />
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start" side="right">
                <p className="text-sm font-semibold mb-2">Ações para {contaClicada?.Conta}</p>
                <div className="flex flex-col space-y-1">
                    <Button 
                        variant="ghost" 
                        className="justify-start"
                        onClick={() => contaClicada && handleNovaContaAbaixo(contaClicada)}
                    >
                        <ArrowRight className="h-4 w-4 mr-2" /> Adicionar Conta Abaixo
                    </Button>
                    <Button 
                        variant="ghost" 
                        className="justify-start"
                        onClick={() => contaClicada && handleNovaContaNivel(contaClicada)}
                    >
                        <ArrowUp className="h-4 w-4 mr-2" /> Adicionar Conta no Mesmo Nível
                    </Button>
                </div>
            </PopoverContent>
          </Popover>
          
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default PlanoContasPage;