import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, Filter, Search, ArrowUp, ArrowDown } from 'lucide-react';
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

// Tipo para inicializar o formulário de nova conta
interface NovaContaInicial {
    Conta: string;
    Analitica: 'Sim' | 'Não';
}

// Tipo unificado para os valores iniciais do formulário (inclui PlanoContas completo ou apenas os campos de criação)
type FormInitialValues = Partial<PlanoContas> & {
    Conta: string;
    Descricao: string;
    Analitica: 'Sim' | 'Não';
    codigo_reduzido: string;
    is_conta_saldo: boolean;
    is_conta_resultado: boolean;
};

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

  // Estados dos filtros
  const [filtroTexto, setFiltroTexto] = useState('');
  const filtroTextoDebounced = useDebounce(filtroTexto, 500);
  const [filtroTipoConta, setFiltroTipoConta] = useState('todos');
  const [filtroAnalitica, setFiltroAnalitica] = useState('todos');

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
      } else {
          setCarregandoContas(false);
      }
    } else if (!carregandoSessao && !usuario) {
        setCarregandoContas(false);
    }
  }, [carregandoSessao, usuario, perfil, role]);

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

    const { error } = await supabase
      .from('plano_contas')
      .delete()
      .eq('id', id);

    if (error) {
      showError('Erro ao excluir conta: ' + error.message);
    } else {
      showSuccess('Conta excluída com sucesso.');
      handleImportComplete();
    }
  };
  
  // --- Lógica de Criação Hierárquica ---
  
  const handleRowClick = (conta: PlanoContas) => {
      setContaClicada(conta);
      setPopoverOpen(true);
  };
  
  const handleOpenNewConta = (nivel: 'acima' | 'abaixo') => {
      if (!contaClicada) return;
      
      const parts = contaClicada.Conta.split('.').filter(p => p.length > 0);
      const nivelAtual = parts.length;
      let novoCodigo = '';
      let novaAnalitica: 'Sim' | 'Não' = 'Não';
      
      if (nivel === 'abaixo') {
          // Nível Abaixo: Adiciona .01 ao código atual
          novoCodigo = contaClicada.Conta + '.01';
          novaAnalitica = 'Sim'; // Sugere analítica para o próximo nível
      } else {
          // Nível Acima: Incrementa o último segmento do código do pai
          if (nivelAtual === 1) {
              // Se for nível 1 (ex: 1), incrementa para 2
              const primeiroDigito = parseInt(parts[0], 10);
              novoCodigo = `${primeiroDigito + 1}`;
          } else {
              // Se for nível > 1 (ex: 1.1.1), pega o pai (1.1), incrementa o último segmento (1.1.2)
              const codigoPai = parts.slice(0, nivelAtual - 1).join('.');
              const ultimoSegmento = parseInt(parts[nivelAtual - 1], 10);
              
              // Encontra a conta de mesmo nível com o maior código
              const contasNoMesmoNivel = contas.filter(c => {
                  const cParts = c.Conta.split('.').filter(p => p.length > 0);
                  return cParts.length === nivelAtual && c.Conta.startsWith(codigoPai);
              });
              
              const maxSegmento = contasNoMesmoNivel.reduce((max, c) => {
                  const cParts = c.Conta.split('.').filter(p => p.length > 0);
                  return Math.max(max, parseInt(cParts[nivelAtual - 1], 10));
              }, ultimoSegmento);
              
              const novoSegmento = maxSegmento + 1;
              
              // Garante que o novo segmento tenha o mesmo preenchimento de zero que o segmento anterior
              const paddingLength = parts[nivelAtual - 1].length;
              novoCodigo = `${codigoPai}.${String(novoSegmento).padStart(paddingLength, '0')}`;
          }
          novaAnalitica = 'Não'; // Sugere sintética para o mesmo nível
      }
      
      setContaSelecionada(null); // Garante que é uma nova conta
      setNovaContaInicial({ Conta: novoCodigo, Analitica: novaAnalitica }); // Define os valores iniciais
      setDialogAberto(true);
      setPopoverOpen(false);
  };
  
  // --- FIM Lógica de Criação Hierárquica ---

  if (carregandoSessao) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }

  if (!proprietarioId) {
    return (
      <LayoutPrincipal>
        <Card>
          <CardHeader>
            <CardTitle>Plano de Contas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">Não foi possível carregar o ID da empresa/proprietário. Verifique se o usuário está vinculado.</p>
          </CardContent>
        </Card>
      </LayoutPrincipal>
    );
  }
  
  // Determina os valores iniciais do formulário de diálogo
  const initialFormValues: PlanoContas | FormInitialValues | null = contaSelecionada 
    ? contaSelecionada 
    : (novaContaInicial 
        ? { 
            Conta: novaContaInicial.Conta, 
            Analitica: novaContaInicial.Analitica,
            codigo_reduzido: '', 
            Descricao: '', 
            is_conta_saldo: false, 
            is_conta_resultado: false 
        } as FormInitialValues
        : null);

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">Plano de Contas</h1>
        <div className="space-x-2 w-full sm:w-auto">
          <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
            <DialogTrigger asChild>
              <Button onClick={() => { setContaSelecionada(null); setNovaContaInicial(null); }} className="w-full sm:w-auto">
                <PlusCircle className="w-4 h-4 mr-2" />
                Nova Conta
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{(initialFormValues as PlanoContas)?.id ? 'Editar Conta' : 'Nova Conta'}</DialogTitle>
              </DialogHeader>
              <FormPlanoContas 
                proprietarioId={proprietarioId}
                contaInicial={initialFormValues as PlanoContas | null} // Passa o objeto de inicialização
                onSaveComplete={handleSaveComplete}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-6">
        <ImportarPlanoContas onImportComplete={handleImportComplete} />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4">
            <div className="relative w-full sm:w-[300px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por conta, código ou descrição..."
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filtroTipoConta} onValueChange={setFiltroTipoConta}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="ativo">Ativo (Inicia com 1)</SelectItem>
                <SelectItem value="passivo">Passivo (Inicia com 2)</SelectItem>
                <SelectItem value="receita">Receita (Inicia com 3)</SelectItem>
                <SelectItem value="despesa">Despesa (Inicia com 4)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroAnalitica} onValueChange={setFiltroAnalitica}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por Analítica" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas (Analítica)</SelectItem>
                <SelectItem value="Sim">Sim</SelectItem>
                <SelectItem value="Não">Não</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Contas Cadastradas ({contas.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Conta</TableHead>
                    <TableHead className="w-[100px]">Cód. Reduzido</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-[100px] text-center">Analítica</TableHead>
                    <TableHead className="w-[100px] text-center">Conta de Saldo</TableHead>
                    <TableHead className="w-[100px] text-center">Conta de Resultado</TableHead>
                    <TableHead className="w-[100px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carregandoContas ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : contas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                        Nenhuma conta encontrada com os filtros aplicados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    contas.map((conta) => (
                      <Popover open={contaClicada?.id === conta.id && popoverOpen} onOpenChange={setPopoverOpen} key={conta.id}>
                        <PopoverTrigger asChild>
                            <TableRow 
                                onClick={() => handleRowClick(conta)}
                                className={cn("cursor-pointer", contaClicada?.id === conta.id && popoverOpen && "bg-secondary/50")}
                            >
                                <TableCell className="font-mono text-sm">
                                    <EditableCell
                                        id={conta.id}
                                        initialValue={conta.Conta}
                                        fieldName="Conta"
                                        onSaveSuccess={handleInlineSaveSuccess}
                                        isEditable={true}
                                        className="font-mono text-sm"
                                    />
                                </TableCell>
                                <TableCell className="text-sm">
                                    <EditableCell
                                        id={conta.id}
                                        initialValue={conta.codigo_reduzido}
                                        fieldName="codigo_reduzido"
                                        onSaveSuccess={handleInlineSaveSuccess}
                                        isEditable={true}
                                        className="text-sm"
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
                                <TableCell className="text-center">
                                    {conta.Analitica}
                                </TableCell>
                                
                                <TableCell className="text-center">
                                    {conta.Analitica === 'Sim' ? (
                                        <EditableCell
                                            id={conta.id}
                                            initialValue={conta.is_conta_saldo}
                                            fieldName="is_conta_saldo"
                                            onSaveSuccess={handleInlineSaveSuccess}
                                            isEditable={true}
                                        />
                                    ) : (
                                        '-'
                                    )}
                                </TableCell>
                                
                                <TableCell className="text-center">
                                    {conta.Analitica === 'Sim' ? (
                                        <EditableCell
                                            id={conta.id}
                                            initialValue={conta.is_conta_resultado}
                                            fieldName="is_conta_resultado"
                                            onSaveSuccess={handleInlineSaveSuccess}
                                            isEditable={true}
                                        />
                                    ) : (
                                        '-'
                                    )}
                                </TableCell>
                                
                                <TableCell className="text-right">
                                    <div className="flex justify-end space-x-2">
                                        <Button variant="ghost" size="sm" onClick={() => handleEdit(conta)}>
                                            <Edit className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleDelete(conta.id)}>
                                            <Trash2 className="w-4 h-4 text-red-500" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2 flex flex-col space-y-1" align="end">
                            <Button variant="ghost" size="sm" onClick={() => handleOpenNewConta('abaixo')}>
                                <ArrowDown className="w-4 h-4 mr-2" /> Criar Conta Nível Abaixo
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleOpenNewConta('acima')}>
                                <ArrowUp className="w-4 h-4 mr-2" /> Criar Conta Nível Acima
                            </Button>
                        </PopoverContent>
                      </Popover>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Diálogo de Criação/Edição (usando o FormPlanoContas) */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{(initialFormValues as PlanoContas)?.id ? 'Editar Conta' : 'Nova Conta'}</DialogTitle>
          </DialogHeader>
          <FormPlanoContas 
            proprietarioId={proprietarioId}
            contaInicial={initialFormValues as PlanoContas | null}
            onSaveComplete={handleSaveComplete}
          />
        </DialogContent>
      </Dialog>
    </LayoutPrincipal>
  );
};

export default PlanoContasPage;