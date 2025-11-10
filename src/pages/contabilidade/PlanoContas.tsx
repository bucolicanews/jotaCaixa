import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// IMPORTAÇÕES DE TABELA REMOVIDAS/AJUSTADAS
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

// Tipo para os dados que o FormPlanoContas realmente precisa para inicializar
type FormInitialData = PlanoContas | (NovaContaInicial & {
    codigo_reduzido: string;
    Descricao: string;
    is_conta_caixa_banco: boolean; // RENOMEADO
    is_conta_patrimonial: boolean; // NOVO CAMPO
    is_conta_resultado: boolean;
});

// Mapeamento de cores para os níveis hierárquicos
const NIVEL_COLORS: Record<number, string> = {
    1: 'bg-blue-500/10 hover:bg-blue-500/20',
    2: 'bg-green-500/10 hover:bg-green-500/20',
    3: 'bg-yellow-500/10 hover:bg-yellow-500/20',
    4: 'bg-red-500/10 hover:bg-red-500/20',
    5: 'bg-purple-500/10 hover:bg-purple-500/20',
};

// Definindo classes utilitárias para TableHead/TableRow/TableCell (baseado em shadcn)
const TableRow = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr className={cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className)} {...props} />
);
const TableHead = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th className={cn("h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", className)} {...props} />
);
const TableCell = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
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
        .single();
        
    if (error && error.code !== 'PGRST116') {
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
      
      // 1. Determinar a máscara de padding
      const maskParts = mascaraAtiva?.split('.') || [];
      
      if (nivel === 'abaixo') {
          // Nível Abaixo: Adiciona um novo segmento
          
          // O novo segmento é o próximo nível (nivelAtual + 1)
          const proximoNivel = nivelAtual; 
          
          // Se a máscara não tiver um segmento para o próximo nível, usamos '0001' como fallback
          const paddingLength = maskParts[proximoNivel]?.length || 4; 
          const novoSegmento = String(1).padStart(paddingLength, '0');
          
          novoCodigo = contaClicada.Conta + '.' + novoSegmento;
          novaAnalitica = 'Sim'; // Sugere analítica para o próximo nível
          
      } else {
          // Nível Acima: Incrementa o último segmento do código do pai
          
          // 1. Encontra o código do pai (se houver)
          const codigoPai = parts.slice(0, nivelAtual - 1).join('.');
          
          // 2. Encontra o segmento a ser incrementado
          const segmentoAtual = parts[nivelAtual - 1];
          const paddingLength = segmentoAtual.length;
          
          // 3. Encontra a conta de mesmo nível com o maior código
          const contasNoMesmoNivel = contas.filter(c => {
              const cParts = c.Conta.split('.').filter(p => p.length > 0);
              // Verifica se tem o mesmo número de segmentos E o mesmo prefixo do pai
              return cParts.length === nivelAtual && c.Conta.startsWith(codigoPai);
          });
          
          const maxSegmento = contasNoMesmoNivel.reduce((max, c) => {
              const cParts = c.Conta.split('.').filter(p => p.length > 0);
              return Math.max(max, parseInt(cParts[nivelAtual - 1], 10));
          }, parseInt(segmentoAtual, 10));
          
          const novoSegmentoNumerico = maxSegmento + 1;
          
          // 4. Aplica o padding
          const novoSegmentoFormatado = String(novoSegmentoNumerico).padStart(paddingLength, '0');
          
          if (nivelAtual === 1) {
              novoCodigo = novoSegmentoFormatado;
          } else {
              novoCodigo = `${codigoPai}.${novoSegmentoFormatado}`;
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
  const initialFormValues: PlanoContas | FormInitialData | null = contaSelecionada 
    ? contaSelecionada 
    : (novaContaInicial 
        ? { 
            Conta: novaContaInicial.Conta, 
            Analitica: novaContaInicial.Analitica,
            codigo_reduzido: '', 
            Descricao: '', 
            is_conta_caixa_banco: false, // RENOMEADO
            is_conta_patrimonial: false, // NOVO CAMPO
            is_conta_resultado: false 
        } as FormInitialData
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
                contaInicial={initialFormValues as PlanoContas | null}
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
            {/* Usando div nativo para controlar a rolagem e garantir o sticky header */}
            <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&amp;_tr]:border-b sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[150px]">Conta</TableHead>
                    <TableHead className="w-[100px]">Cód. Reduzido</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-[100px] text-center">Analítica</TableHead>
                    <TableHead className="w-[100px] text-center">Conta Caixa/Banco</TableHead>
                    <TableHead className="w-[100px] text-center">Conta Patrimonial</TableHead>
                    <TableHead className="w-[100px] text-center">Conta de Resultado</TableHead>
                    <TableHead className="w-[100px] text-right">Ações</TableHead>
                  </TableRow>
                </thead>
                <tbody className="[&amp;_tr:last-child]:border-0">
                  {carregandoContas ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : contas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
                        Nenhuma conta encontrada com os filtros aplicados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    contas.map((conta) => {
                        // Calcula o nível da conta (número de segmentos)
                        const nivel = conta.Conta.split('.').filter(p => p.length > 0).length;
                        const nivelClass = NIVEL_COLORS[nivel] || 'hover:bg-secondary/50';
                        
                        // Aplica indentação
                        const paddingLeft = (nivel - 1) * 10;
                        
                        // Define a cor de fundo da linha
                        const rowClassName = cn(
                            nivelClass,
                            contaClicada?.id === conta.id && popoverOpen && "bg-secondary/50"
                        );

                        return (
                            <Popover open={contaClicada?.id === conta.id && popoverOpen} onOpenChange={setPopoverOpen} key={conta.id}>
                                <PopoverTrigger asChild>
                                    <TableRow 
                                        onClick={() => handleRowClick(conta)}
                                        className={cn("cursor-pointer", rowClassName)}
                                    >
                                        <TableCell className="font-mono text-sm" style={{ paddingLeft: `${paddingLeft + 16}px` }}>
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
                                                    initialValue={conta.is_conta_caixa_banco}
                                                    fieldName="is_conta_caixa_banco"
                                                    onSaveSuccess={handleInlineSaveSuccess}
                                                    isEditable={true}
                                                />
                                            ) : (
                                                '-'
                                            )}
                                        </TableCell>
                                        
                                        {/* NOVA COLUNA: CONTA PATRIMONIAL */}
                                        <TableCell className="text-center">
                                            {conta.Analitica === 'Sim' ? (
                                                <EditableCell
                                                    id={conta.id}
                                                    initialValue={conta.is_conta_patrimonial}
                                                    fieldName="is_conta_patrimonial"
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
                        );
                    })
                  )}
                </tbody>
              </table>
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