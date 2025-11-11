import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import MapeamentoPlanoContasDialog from '@/components/contabilidade/MapeamentoPlanoContasDialog';
import MapeamentoManualPlanoContasDialog from '@/components/contabilidade/MapeamentoManualPlanoContasDialog';

// Tipo para inicializar o formulário de nova conta
interface NovaContaInicial {
    Conta: string;
    Analitica: 'Sim' | 'Não';
}

// Tipo para os dados que o FormPlanoContas realmente precisa para inicializar
type FormInitialData = PlanoContas | (NovaContaInicial & {
    codigo_reduzido: string;
    Descricao: string;
    is_conta_caixa_banco: boolean;
    is_conta_patrimonial: boolean;
    is_conta_resultado: boolean;
});

// Tipo para a conta antiga em uso (para o modal)
interface ContaAntigaEmUsoSimples {
    id: string;
    Conta: string;
    Descricao: string;
    dependencies: number;
}

// Mapeamento de cores para os níveis hierárquicos
const NIVEL_COLORS: Record<number, string> = {
    1: 'bg-blue-500/10 hover:bg-blue-500/20',
    2: 'bg-green-500/10 hover:bg-green-500/20',
    3: 'bg-yellow-500/10 hover:bg-yellow-500/20',
    4: 'bg-red-500/10 hover:bg-red-500/20',
    5: 'bg-purple-500/10 hover:bg-purple-500/20',
};

// Definindo classes utilitárias para TableHead/TableRow/TableCell (baseado em shadcn)
const TableRowComponent = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr className={cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className)} {...props} />
);
const TableHeadComponent = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th className={cn("h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", className)} {...props} />
);
const TableCellComponent = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
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
  
  // NOVO ESTADO: Mapeamento de Importação
  const [mapeamentoDialogOpen, setMapeamentoDialogOpen] = useState(false);
  const [contasParaInserir, setContasParaInserir] = useState<Partial<PlanoContas>[]>([]);
  const [contasAntigasEmUso, setContasAntigasEmUso] = useState<ContaAntigaEmUsoSimples[]>([]);
  
  // NOVO ESTADO: Conta clicada para navegação hierárquica
  const [contaClicada, setContaClicada] = useState<PlanoContas | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [mascaraAtiva, setMascaraAtiva] = useState<string | null>(null); // NOVO ESTADO PARA MÁSCARA

  // Estados dos filtros
  const [filtroTexto, setFiltroTexto] = useState('');
  const filtroTextoDebounced = useDebounce(filtroTexto, 500);
  const [filtroTipoConta, setFiltroTipoConta] = useState('todos');
  const [filtroAnalitica, setFiltroAnalitica] = useState('todos');
  
  // ESTADOS PARA MAPEAMENTO MANUAL DE DELEÇÃO
  const [contaParaDeletar, setContaParaDeletar] = useState<PlanoContas | null>(null);
  const [mapeamentoManualDialogOpen, setMapeamentoManualDialogOpen] = useState(false);
  const [contasDisponiveisParaMapeamento, setContasDisponiveisParaMapeamento] = useState<PlanoContas[]>([]);
  const [isSubmittingManualMapping, setIsSubmittingManualMapping] = useState(false);


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
    
    // 1. VERIFICAR DEPENDÊNCIAS
    const checks = await Promise.all([
        supabase.from('saldo_contas').select('id', { count: 'exact', head: true }).eq('conta_contabil_id', id),
        supabase.from('lancamentos').select('id', { count: 'exact', head: true }).eq('conta_contabil_id', id),
        supabase.from('configuracao_contas_receber').select('id', { count: 'exact', head: true }).eq('conta_contabil_id', id),
        supabase.from('configuracao_contas_pagar').select('id', { count: 'exact', head: true }).eq('conta_contabil_id', id),
        supabase.from('configuracoes_stripe').select('id', { count: 'exact', head: true }).or(`conta_sintetica_id.eq.${id},conta_receber_id.eq.${id}`),
    ]);
    
    const totalDependencies = checks.reduce((sum, res) => sum + (res.count || 0), 0);
    
    if (totalDependencies > 0) {
        // SE HOUVER DEPENDÊNCIAS, ABRE O MODAL DE MAPEAMENTO MANUAL
        const conta = contas.find(c => c.id === id);
        if (!conta) return;
        
        setContaParaDeletar(conta);
        
        // Filtra contas disponíveis para mapeamento (todas exceto a que será deletada)
        const availableContas = contas.filter(c => c.id !== id);
        setContasDisponiveisParaMapeamento(availableContas);
        
        setMapeamentoManualDialogOpen(true);
        return;
    }

    // 2. EXCLUIR (Se não houver dependências)
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
  
  // NEW HANDLER for manual mapping submission
  const handleManualMappingSubmit = async (newContaId: string | null) => {
      if (!contaParaDeletar || !proprietarioId) return;
      
      setIsSubmittingManualMapping(true);
      
      try {
          const oldId = contaParaDeletar.id;
          
          // 1. Atualizar todas as referências para a nova conta (ou NULL)
          
          // a) saldo_contas
          await supabase.from('saldo_contas')
              .update({ conta_contabil_id: newContaId })
              .eq('proprietario_id', proprietarioId)
              .eq('conta_contabil_id', oldId);
              
          // b) lancamentos
          await supabase.from('lancamentos')
              .update({ conta_contabil_id: newContaId })
              .eq('proprietario_id', proprietarioId)
              .eq('conta_contabil_id', oldId);
              
          // c) configuracao_contas_receber
          await supabase.from('configuracao_contas_receber')
              .update({ conta_contabil_id: newContaId })
              .eq('proprietario_id', proprietarioId)
              .eq('conta_contabil_id', oldId);
              
          // d) configuracao_contas_pagar
          await supabase.from('configuracao_contas_pagar')
              .update({ conta_contabil_id: newContaId })
              .eq('proprietario_id', proprietarioId)
              .eq('conta_contabil_id', oldId);
              
          // e) configuracoes_stripe (conta_sintetica_id e conta_receber_id)
          await supabase.from('configuracoes_stripe')
              .update({ conta_sintetica_id: newContaId })
              .eq('proprietario_id', proprietarioId)
              .eq('conta_sintetica_id', oldId);
              
          await supabase.from('configuracoes_stripe')
              .update({ conta_receber_id: newContaId })
              .eq('proprietario_id', proprietarioId)
              .eq('conta_receber_id', oldId);
              
          // 2. Deletar a conta antiga
          const { error: deleteError } = await supabase
              .from('plano_contas')
              .delete()
              .eq('id', oldId);
              
          if (deleteError) throw deleteError;
          
          showSuccess(`Conta ${contaParaDeletar.Conta} deletada e referências atualizadas.`);
          setMapeamentoManualDialogOpen(false);
          setContaParaDeletar(null);
          handleImportComplete(); // Recarrega a lista
          
      } catch (error: any) {
          showError('Falha ao mapear e deletar conta: ' + error.message);
      } finally {
          setIsSubmittingManualMapping(false);
      }
  };
  
  // --- Lógica de Criação Hierárquica ---
  
  const handleRowClick = (conta: PlanoContas) => {
      setContaClicada(conta);
      setPopoverOpen(true);
  };
  
  const handleOpenNewConta = (nivel: 'acima' | 'abaixo') => {
      if (!contaClicada) return;
      
      // Fecha o popover
      setPopoverOpen(false);
      
      // CORREÇÃO: Usando split('.') e filter(Boolean) para obter os segmentos
      const parts = contaClicada.Conta.split('.').filter(Boolean);
      const nivelAtual = parts.length;
      let novoCodigo = '';
      let novaAnalitica: 'Sim' | 'Não' = 'Não';
      
      // 1. Determinar a máscara de padding
      const maskParts = mascaraAtiva?.split('.') || [];
      
      if (nivel === 'abaixo') {
          // Nível Abaixo: Adiciona um novo segmento
          
          // O novo segmento é o próximo nível (nivelAtual)
          const proximoNivelIndex = nivelAtual; 
          
          // Se a máscara não tiver um segmento para o próximo nível, usamos '0001' como fallback
          const paddingLength = maskParts[proximoNivelIndex]?.length || 4; 
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
              const cParts = c.Conta.split('.').filter(Boolean);
              // Verifica se tem o mesmo número de segmentos E o mesmo prefixo do pai
              return cParts.length === nivelAtual && c.Conta.startsWith(codigoPai);
          });
          
          const maxSegmento = contasNoMesmoNivel.reduce((max, c) => {
              const cParts = c.Conta.split('.').filter(Boolean);
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
  };
  
  // --- FIM Lógica de Criação Hierárquica ---
  
  // --- Handler para abrir o modal de mapeamento ---
  const handleOpenMapeamento = (contasParaInserir: Partial<PlanoContas>[], contasAntigasEmUso: ContaAntigaEmUsoSimples[]) => {
      setContasParaInserir(contasParaInserir);
      setContasAntigasEmUso(contasAntigasEmUso);
      setMapeamentoDialogOpen(true);
  };
  
  // --- Handler para finalizar o mapeamento ---
  const handleMapeamentoCompleto = () => {
      setMapeamentoDialogOpen(false);
      handleImportComplete(); // Recarrega a lista principal
  };

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
            is_conta_caixa_banco: false,
            is_conta_patrimonial: false,
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
            <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
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
        <ImportarPlanoContas 
            onImportComplete={handleImportComplete} 
            onOpenMapeamento={handleOpenMapeamento}
        />

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
                  <TableRowComponent>
                    <TableHeadComponent className="w-[150px]">Conta</TableHeadComponent>
                    <TableHeadComponent className="w-[100px]">Cód. Reduzido</TableHeadComponent>
                    <TableHeadComponent>Descrição</TableHeadComponent>
                    <TableHeadComponent className="w-[100px] text-center">Analítica</TableHeadComponent>
                    <TableHeadComponent className="w-[100px] text-center">Caixa/Banco</TableHeadComponent>
                    <TableHeadComponent className="w-[100px] text-center">Patrimonial</TableHeadComponent>
                    <TableHeadComponent className="w-[100px] text-center">Resultado</TableHeadComponent>
                    <TableHeadComponent className="w-[100px] text-right">Ações</TableHeadComponent>
                  </TableRowComponent>
                </thead>
                <tbody className="[&amp;_tr:last-child]:border-0">
                  {carregandoContas ? (
                    <TableRowComponent>
                      <TableCellComponent colSpan={8} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                      </TableCellComponent>
                    </TableRowComponent>
                  ) : contas.length === 0 ? (
                    <TableRowComponent>
                      <TableCellComponent colSpan={8} className="text-center py-4 text-muted-foreground">
                        Nenhuma conta encontrada com os filtros aplicados.
                      </TableCellComponent>
                    </TableRowComponent>
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
                                    <TableRowComponent 
                                        onClick={() => handleRowClick(conta)}
                                        className={cn("cursor-pointer", rowClassName)}
                                    >
                                        <TableCellComponent className="font-mono text-sm" style={{ paddingLeft: `${paddingLeft + 16}px` }}>
                                            <EditableCell
                                                id={conta.id}
                                                initialValue={conta.Conta}
                                                fieldName="Conta"
                                                onSaveSuccess={handleInlineSaveSuccess}
                                                isEditable={true}
                                                className="font-mono text-sm"
                                            />
                                        </TableCellComponent>
                                        <TableCellComponent className="text-sm">
                                            <EditableCell
                                                id={conta.id}
                                                initialValue={conta.codigo_reduzido}
                                                fieldName="codigo_reduzido"
                                                onSaveSuccess={handleInlineSaveSuccess}
                                                isEditable={true}
                                                className="text-sm"
                                            />
                                        </TableCellComponent>
                                        <TableCellComponent>
                                            <EditableCell
                                                id={conta.id}
                                                initialValue={conta.Descricao}
                                                fieldName="Descricao"
                                                onSaveSuccess={handleInlineSaveSuccess}
                                                isEditable={true}
                                            />
                                        </TableCellComponent>
                                        <TableCellComponent className="text-center">
                                            {conta.Analitica}
                                        </TableCellComponent>
                                        
                                        <TableCellComponent className="text-center">
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
                                        </TableCellComponent>
                                        
                                        {/* NOVA COLUNA: CONTA PATRIMONIAL */}
                                        <TableCellComponent className="text-center">
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
                                        </TableCellComponent>
                                        
                                        <TableCellComponent className="text-center">
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
                                        </TableCellComponent>
                                        
                                        <TableCellComponent className="text-right">
                                            <div className="flex justify-end space-x-2">
                                                <Button variant="ghost" size="sm" onClick={() => handleEdit(conta)}>
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => handleDelete(conta.id)}>
                                                    <Trash2 className="w-4 h-4 text-red-500" />
                                                </Button>
                                            </div>
                                        </TableCellComponent>
                                    </TableRowComponent>
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
        <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
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
      
      {/* MODAL DE MAPEAMENTO DE IMPORTAÇÃO */}
      {proprietarioId && (
          <MapeamentoPlanoContasDialog
              open={mapeamentoDialogOpen}
              onOpenChange={setMapeamentoDialogOpen}
              proprietarioId={proprietarioId}
              contasParaInserir={contasParaInserir}
              contasAntigasEmUso={contasAntigasEmUso}
              onMapeamentoCompleto={handleMapeamentoCompleto}
          />
      )}
      
      {/* NOVO MODAL DE MAPEAMENTO MANUAL DE DELEÇÃO */}
      {proprietarioId && contaParaDeletar && (
          <MapeamentoManualPlanoContasDialog
              open={mapeamentoManualDialogOpen}
              onOpenChange={setMapeamentoManualDialogOpen}
              contaParaDeletar={contaParaDeletar}
              contasDisponiveis={contasDisponiveisParaMapeamento}
              onSubmit={handleManualMappingSubmit}
              isSubmitting={isSubmittingManualMapping}
          />
      )}
    </LayoutPrincipal>
  );
};

export default PlanoContasPage;