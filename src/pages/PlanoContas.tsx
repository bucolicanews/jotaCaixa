import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Loader2,
  Edit,
  Trash2,
  PlusCircle,
  Filter,
  Search,
  ArrowUp,
  ArrowRight,
  FileDown,
  FileUp,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { PlanoContas } from '@/types/plano-contas';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormPlanoContas from '@/components/formularios/FormPlanoContas';
import FormPlanoContasDialog from '@/components/formularios/FormPlanoContasDialog'; // IMPORTADO
import ImportarPlanoContas from '@/components/contabilidade/ImportarPlanoContas';
import ExportarPlanoContasButton from '@/components/contabilidade/ExportarPlanoContasButton';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import EditableCell from '@/components/contabilidade/EditableCell';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useSessao } from '@/hooks/use-sessao';
import { SETUP_STEPS_META } from '@/utils/setup-status';

// Tipo para inicializar o formulário de nova conta
interface NovaContaInicial {
    Conta: string;
    Analitica: 'Sim' | 'Não';
    Descricao: string; // Adicionado para preenchimento inicial
}

// Tipo para os dados que o FormPlanoContas realmente precisa para inicializar
type FormInitialData = PlanoContas | (NovaContaInicial & {
    codigo_reduzido: string;
    is_conta_caixa_banco: boolean;
    is_conta_patrimonial: boolean;
    is_conta_resultado: boolean;
    is_caixa: boolean;
    is_banco: boolean;
    is_a_receber: boolean;
    is_a_pagar: boolean;
});

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
  const { usuario, perfil, role, carregando: carregandoSessao, refetch: refetchSessao, setupStatus } = useSessao();
  const [contas, setContas] = useState<PlanoContas[]>([]);
  const [carregandoContas, setCarregandoContas] = useState(true);
  const [proprietarioId, setProprietarioId] = useState<string | null>(null);
  
  // Estado para edição (conta existente)
  const [contaSelecionada, setContaSelecionada] = useState<PlanoContas | null>(null);
  // Estado para criação (nova conta hierárquica)
  const [novaContaInicial, setNovaContaInicial] = useState<NovaContaInicial | null>(null);
  
  const [dialogAberto, setDialogAberto] = useState(false);
  const [guiaAberta, setGuiaAberta] = useState(false);
  
  // NOVO ESTADO: Conta clicada para navegação hierárquica
  const [contaClicada, setContaClicada] = useState<PlanoContas | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [mascaraAtiva, setMascaraAtiva] = useState<string | null>(null);

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
      if (filtroTipoConta === 'receita') prefix = '4'; // CORREÇÃO: Receita é 4
      if (filtroTipoConta === 'despesa') prefix = '5'; // CORREÇÃO: Despesa é 5/6
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
          const user = perfil as any;
          if (user?.admin_id) {
            ownerId = user.admin_id;
          } else if (user?.cliente_id) {
            ownerId = user.cliente_id;
          }
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
    refetchSessao();
  };

  const handleSaveComplete = () => {
    setDialogAberto(false);
    setContaSelecionada(null);
    setNovaContaInicial(null); // Limpa o estado de nova conta
    if (proprietarioId) {
      buscarPlanoContas(proprietarioId);
    }
    refetchSessao();
  };
  
  // Função de sucesso para o EditableCell
  const handleInlineSaveSuccess = () => {
      if (proprietarioId) {
          buscarPlanoContas(proprietarioId);
      }
      refetchSessao(); // CRÍTICO: Refetch da sessão para atualizar o setupStatus
  };

  const handleEdit = (conta: PlanoContas) => {
    setContaSelecionada(conta);
    setNovaContaInicial(null); // Garante que não estamos no modo de nova conta hierárquica
    setDialogAberto(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta conta?')) return;

    // CRÍTICO: Antes de deletar, setar as FKs para NULL
    try {
        // 1. Anular referências em tabelas dependentes
        await supabase.from('saldo_contas').update({ conta_contabil_id: null }).eq('conta_contabil_id', id);
        await supabase.from('lancamentos').update({ conta_contabil_id: null }).eq('conta_contabil_id', id);
        await supabase.from('configuracao_contas_receber').update({ conta_contabil_id: null }).eq('conta_contabil_id', id);
        await supabase.from('configuracao_contas_pagar').update({ conta_contabil_id: null }).eq('conta_contabil_id', id);
        await supabase.from('configuracoes_stripe').update({ conta_sintetica_id: null, conta_receber_id: null }).eq('proprietario_id', proprietarioId);
        await supabase.from('configuracao_contratos').update({ id_conta_clientes_receber: null, id_conta_receita_contrato: null }).eq('proprietario_id', proprietarioId); // NOVO: Contratos
        
        // 2. Deletar a conta
        const { error } = await supabase
            .from('plano_contas')
            .delete()
            .eq('id', id);

        if (error) throw error;

        showSuccess('Conta excluída com sucesso.');
        handleImportComplete();
    } catch (error: any) {
        showError('Erro ao excluir conta: ' + error.message);
    }
  };
  
  // --- Lógica de Criação Hierárquica ---
  
  const handleRowClick = (conta: PlanoContas) => {
      setContaClicada(conta);
      setPopoverOpen(true);
  };
  
  const handleOpenNewConta = (nivel: 'acima' | 'mesmo' | 'abaixo') => {
      if (!contaClicada) return;
      
      const parts = contaClicada.Conta.split('.').filter(p => p.length > 0);
      const nivelAtual = parts.length;
      let novoCodigo = '';
      let novaAnalitica: 'Sim' | 'Não' = 'Não';
      let novaDescricao = '';
      
      // 1. Determinar a máscara de padding
      const maskParts = mascaraAtiva?.split('.') || [];
      
      // Função auxiliar para calcular o próximo segmento
      const calculateNextSegment = (prefixo: string, nivelSegmento: number, paddingLength: number): string => {
          const prefixoBusca = prefixo ? prefixo + '.' : '';
          
          // Filtra contas que são filhas diretas do prefixo (ou contas de nível 1 se prefixo vazio)
          const contasFilhas = contas.filter(c => {
              const cParts = c.Conta.split('.').filter(p => p.length > 0);
              
              // Se estamos buscando o nível 1 (prefixo vazio), queremos todas as contas de nível 1
              if (!prefixo && nivelSegmento === 0) {
                  return cParts.length >= 1;
              }
              
              // Se estamos buscando contas filhas, o código deve começar com o prefixo + '.'
              return c.Conta.startsWith(prefixoBusca);
          });
          
          let maxSegmento = 0;
          if (contasFilhas.length > 0) {
              maxSegmento = contasFilhas.reduce((max, c) => {
                  const cParts = c.Conta.split('.').filter(p => p.length > 0);
                  // O índice do segmento é nivelSegmento (0 para nível 1, 1 para nível 2, etc.)
                  if (cParts.length > nivelSegmento) {
                      return Math.max(max, parseInt(cParts[nivelSegmento], 10));
                  }
                  return max;
              }, 0);
          }
          
          const novoSegmentoNumerico = maxSegmento + 1;
          return String(novoSegmentoNumerico).padStart(paddingLength, '0');
      };
      
      if (nivel === 'acima' || nivel === 'mesmo') {
          // Nível Acima (Mesmo Nível): Incrementa o último segmento do código do pai
          
          const nivelSegmento = nivelAtual - 1; // O segmento a ser incrementado é o último
          
          if (nivelSegmento < 0) {
              showError('Não é possível criar um nível acima do nível 1.');
              setPopoverOpen(false);
              return;
          }
          
          const codigoPai = parts.slice(0, nivelSegmento).join('.');
          
          const maskSegment = maskParts[nivelSegmento];
          
          if (!maskSegment) {
             showError(`A máscara (${mascaraAtiva}) não define o formato para o nível ${nivelAtual}.`);
             setPopoverOpen(false);
             return;
          }
          
          const paddingLength = maskSegment.length;
          
          const novoSegmento = calculateNextSegment(codigoPai, nivelSegmento, paddingLength);
          
          if (nivelSegmento === 0) {
              novoCodigo = novoSegmento;
          } else {
              novoCodigo = `${codigoPai}.${novoSegmento}`;
          }
          
          novaAnalitica = 'Não';
          novaDescricao = `Nova Conta Nível ${nivelAtual}`;
          
      } else if (nivel === 'abaixo') {
          // Nível Abaixo: Adiciona um novo segmento
          
          const nivelSegmento = nivelAtual; // O segmento a ser incrementado é o próximo
          
          if (nivelSegmento >= maskParts.length) {
              showError(`A máscara (${mascaraAtiva}) não permite criar contas no nível ${nivelAtual + 1}.`);
              setPopoverOpen(false);
              return;
          }
          
          const codigoPai = contaClicada.Conta;
          const maskSegment = maskParts[nivelSegmento];
          const paddingLength = maskSegment.length;
          
          const novoSegmento = calculateNextSegment(codigoPai, nivelSegmento, paddingLength);
          
          novoCodigo = `${codigoPai}.${novoSegmento}`;
          novaAnalitica = 'Sim'; // Sugere analítica para o nível mais baixo
          novaDescricao = `Nova Conta Analítica`;
      }
      
      setContaSelecionada(null); // Garante que é uma nova conta
      setNovaContaInicial({ Conta: novoCodigo, Analitica: novaAnalitica, Descricao: novaDescricao }); // Define os valores iniciais
      setDialogAberto(true);
      setPopoverOpen(false);
  };
  
  // --- FIM Lógica de Criação Hierárquica ---

  const initialFormValues: PlanoContas | FormInitialData | null = contaSelecionada 
    ? contaSelecionada 
    : (novaContaInicial 
        ? { 
            Conta: novaContaInicial.Conta, 
            Analitica: novaContaInicial.Analitica,
            Descricao: novaContaInicial.Descricao,
            codigo_reduzido: novaContaInicial.Conta.replace(/\./g, ''), 
            is_conta_caixa_banco: false,
            is_conta_patrimonial: false,
            is_conta_resultado: false,
            is_caixa: false,
            is_banco: false,
            is_a_receber: false,
            is_a_pagar: false,
        } as FormInitialData
        : null);

  const guiaStatus = useMemo(() => {
    const hasCaixa = contas.some((c) => c.is_caixa);
    const hasBanco = contas.some((c) => c.is_banco);
    const hasCliente = contas.some((c) => c.is_a_receber);
    const hasFornecedor = contas.some((c) => c.is_a_pagar);
    const hasCapital = contas.some(
      (c) =>
        c.is_conta_patrimonial &&
        ((c.Descricao && c.Descricao.toLowerCase().includes('capital')) ||
          (c.Conta && c.Conta.toLowerCase().includes('3.1.00.0001'))),
    );
    const hasReceita = contas.some(
      (c) =>
        c.is_conta_resultado &&
        ((c.Conta && c.Conta.startsWith('4')) ||
          (c.Descricao && c.Descricao.toLowerCase().includes('receita'))),
    );
    const hasDespesa = contas.some(
      (c) =>
        c.is_conta_resultado &&
        ((c.Conta && (c.Conta.startsWith('5') || c.Conta.startsWith('6'))) ||
          (c.Descricao &&
            (c.Descricao.toLowerCase().includes('despesa') ||
              c.Descricao.toLowerCase().includes('custo')))),
    );

    return {
      plano_contas: contas.length > 0,
      historicos: setupStatus?.missingSteps.includes('historicos') === false,
      config_cr: setupStatus?.missingSteps.includes('config_cr') === false,
      config_cp: setupStatus?.missingSteps.includes('config_cp') === false,
      config_contratos: setupStatus?.missingSteps.includes('config_contratos') === false,
      plano_contas_caixa: hasCaixa,
      plano_contas_banco: hasBanco,
      plano_contas_cliente: hasCliente,
      plano_contas_fornecedor: hasFornecedor,
      plano_contas_capital_social: hasCapital,
      plano_contas_receita: hasReceita,
      plano_contas_despesa: hasDespesa,
    };
  }, [contas, setupStatus?.missingSteps]);

  const allGuiaDone = useMemo(() => {
      const requiredKeys: (keyof typeof guiaStatus)[] = [
          'plano_contas', 'historicos', 'config_cr', 'config_cp', 'config_contratos',
          'plano_contas_caixa', 'plano_contas_banco', 'plano_contas_cliente', 
          'plano_contas_fornecedor', 'plano_contas_capital_social', 
          'plano_contas_receita', 'plano_contas_despesa'
      ];
      return requiredKeys.every(key => guiaStatus[key]);
  }, [guiaStatus]);

  const guiaItens = [
    {
      key: 'plano_contas',
      title: '1. Importe o Plano de Contas',
      description: 'Cadastre ou importe o plano de contas do cliente.',
      link: '/plano-contas',
      done: guiaStatus.plano_contas,
    },
    {
      key: 'historicos',
      title: '2. Importe os Históricos',
      description: 'Importe ou cadastre históricos financeiros em Configurações > Históricos.',
      link: '/historicos',
      done: guiaStatus.historicos,
    },
    {
      key: 'plano_contas_caixa',
      title: '3. Marque as Contas Essenciais',
      description: 'Marque ao menos uma conta analítica para cada categoria (Caixa, Banco, Clientes, Fornecedores, Capital, Receita, Despesa).',
      link: '/plano-contas',
      done: guiaStatus.plano_contas_caixa && guiaStatus.plano_contas_banco && guiaStatus.plano_contas_cliente && guiaStatus.plano_contas_fornecedor && guiaStatus.plano_contas_capital_social && guiaStatus.plano_contas_receita && guiaStatus.plano_contas_despesa,
    },
    {
      key: 'config_contabil',
      title: '4. Configure Mapeamentos Contábeis',
      description: 'Verifique se as configurações de Níveis, CR, CP e Contratos estão preenchidas.',
      link: '/configuracoes',
      done: guiaStatus.config_cr && guiaStatus.config_cp && guiaStatus.config_contratos,
    },
  ];

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
  
    return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">Plano de Contas</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
                <DialogTrigger asChild>
                    <Button onClick={() => { setContaSelecionada(null); setNovaContaInicial(null); }} className="w-full sm:w-auto">
                        <PlusCircle className="w-4 h-4 mr-2" />
                        Nova Conta
                    </Button>
                </DialogTrigger>
                <FormPlanoContasDialog
                    open={dialogAberto}
                    onOpenChange={setDialogAberto}
                    contaInicial={initialFormValues as PlanoContas | null}
                    proprietarioId={proprietarioId}
                    onSaveComplete={handleSaveComplete}
                />
            </Dialog>
            <ImportarPlanoContas onImportComplete={handleImportComplete} />
            <ExportarPlanoContasButton />
            <Button variant="outline" className="w-full sm:w-auto" asChild>
                <a href="/plano_contas_padrao.csv" target="_blank" rel="noreferrer" download>
                    <FileDown className="w-4 h-4 mr-2" />
                    Baixar Plano Padrão
                </a>
            </Button>
        </div>
      </div>

      <Card className="mb-6 border-dashed border-primary/30 bg-primary/5">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Info className="h-5 w-5" />
              Guia de marcação obrigatória
            </CardTitle>
            <CardDescription>
              Após importar o plano e os históricos, marque pelo menos uma conta para cada categoria abaixo.
              Esses marcadores alimentam os módulos de Contas a Pagar/Receber e Contratos.
            </CardDescription>
            {allGuiaDone && (
              <p className="mt-2 text-sm text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Tudo certo! Todos os marcadores obrigatórios já foram configurados.
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setGuiaAberta((prev) => !prev)}
          >
            {guiaAberta ? 'Recolher guia' : 'Ver detalhes'}
            {guiaAberta ? (
              <ChevronUp className="h-4 w-4 ml-1" />
            ) : (
              <ChevronDown className="h-4 w-4 ml-1" />
            )}
          </Button>
        </CardHeader>
        {(!allGuiaDone || guiaAberta) && (
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {guiaItens.map((item) => (
              <div
                key={item.key}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 text-sm',
                  item.done
                    ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/20'
                    : 'border-amber-400 bg-amber-50 dark:bg-amber-900/20',
                )}
              >
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">
                    {item.title}
                  </p>
                  <p className="text-muted-foreground">{item.description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      {/* GRID MODERNO DE DUAS COLUNAS */}
      <div className="grid grid-cols-1 lg:grid-cols-[20%_80%] gap-6 items-start">
        
        {/* COLUNA ESQUERDA: FILTROS */}
        <div className="space-y-6">
          <Card className="shadow-md border border-border/50">
            <CardHeader>
              <CardTitle className="text-lg font-semibold flex items-center">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                Filtros
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por conta, código ou descrição..."
                  value={filtroTexto}
                  onChange={(e) => setFiltroTexto(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filtroTipoConta} onValueChange={setFiltroTipoConta}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Tipos</SelectItem>
                  <SelectItem value="ativo">Ativo (Inicia com 1)</SelectItem>
                  <SelectItem value="passivo">Passivo (Inicia com 2)</SelectItem>
                  <SelectItem value="receita">Receita (Inicia com 4)</SelectItem>
                  <SelectItem value="despesa">Despesa (Inicia com 5/6)</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filtroAnalitica} onValueChange={setFiltroAnalitica}>
                <SelectTrigger>
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
        </div>

        {/* COLUNA DIREITA: TABELA */}
        <div>
          <Card className="shadow-md border border-border/50">
            <CardHeader className="flex justify-between items-center">
              <CardTitle className="text-xl font-semibold">
                Contas Cadastradas ({contas.length})
              </CardTitle>
              {carregandoContas && (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="relative overflow-x-auto overflow-y-auto max-h-[95vh] rounded-md border border-border/50">
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b sticky top-0 bg-background/95 backdrop-blur-sm z-20 shadow-sm">
                    <TableRow>
                      <TableHead className="w-[150px]">Conta</TableHead>
                      <TableHead className="w-[100px]">Cód. Reduzido</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-[100px] text-center">Analítica</TableHead>
                      <TableHead className="w-[100px] text-center">CR</TableHead>
                      <TableHead className="w-[100px] text-center">CP</TableHead>
                      <TableHead className="w-[100px] text-center">Patrimonial</TableHead>
                      <TableHead className="w-[100px] text-center">Resultado</TableHead>
                      <TableHead className="w-[100px] text-center">Caixa</TableHead>
                      <TableHead className="w-[100px] text-center">Banco</TableHead>
                      <TableHead className="w-[100px] text-right">Ações</TableHead>
                    </TableRow>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {carregandoContas ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                        </TableCell>
                      </TableRow>
                    ) : contas.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={11}
                          className="text-center py-4 text-muted-foreground"
                        >
                          Nenhuma conta encontrada com os filtros aplicados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      contas.map((conta) => {
                        const nivel = conta.Conta.split('.').filter((p) => p.length > 0)
                          .length;
                        const nivelClass =
                          NIVEL_COLORS[nivel] || 'hover:bg-secondary/50';
                        const paddingLeft = (nivel - 1) * 10;
                        const rowClassName = cn(
                          nivelClass,
                          contaClicada?.id === conta.id &&
                            popoverOpen &&
                            'bg-secondary/50'
                        );

                        return (
                          <Popover
                            open={contaClicada?.id === conta.id && popoverOpen}
                            onOpenChange={setPopoverOpen}
                            key={conta.id}
                          >
                            <PopoverTrigger asChild>
                              <TableRow
                                onClick={() => handleRowClick(conta)}
                                className={cn('cursor-pointer', rowClassName)}
                              >
                                <TableCell
                                  className="font-mono text-sm"
                                  style={{ paddingLeft: `${paddingLeft + 16}px` }}
                                >
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
                                
                                {/* NOVO CAMPO: IS A RECEBER */}
                                <TableCell className="text-center">
                                  {conta.Analitica === 'Sim' ? (
                                    <EditableCell
                                      id={conta.id}
                                      initialValue={conta.is_a_receber}
                                      fieldName="is_a_receber"
                                      onSaveSuccess={handleInlineSaveSuccess}
                                      isEditable={true}
                                    />
                                  ) : (
                                    '-'
                                  )}
                                </TableCell>
                                
                                {/* NOVO CAMPO: IS A PAGAR */}
                                <TableCell className="text-center">
                                  {conta.Analitica === 'Sim' ? (
                                    <EditableCell
                                      id={conta.id}
                                      initialValue={conta.is_a_pagar}
                                      fieldName="is_a_pagar"
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
                                
                                {/* NOVO CAMPO: IS CAIXA */}
                                <TableCell className="text-center">
                                  {conta.Analitica === 'Sim' ? (
                                    <EditableCell
                                      id={conta.id}
                                      initialValue={conta.is_caixa}
                                      fieldName="is_caixa"
                                      onSaveSuccess={handleInlineSaveSuccess}
                                      isEditable={true}
                                    />
                                  ) : (
                                    '-'
                                  )}
                                </TableCell>
                                
                                {/* NOVO CAMPO: IS BANCO */}
                                <TableCell className="text-center">
                                  {conta.Analitica === 'Sim' ? (
                                    <EditableCell
                                      id={conta.id}
                                      initialValue={conta.is_banco}
                                      fieldName="is_banco"
                                      onSaveSuccess={handleInlineSaveSuccess}
                                      isEditable={true}
                                    />
                                  ) : (
                                    '-'
                                  )}
                                </TableCell>
                                
                                <TableCell className="text-right">
                                  <div className="flex justify-end space-x-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEdit(conta);
                                      }}
                                      title="Editar Conta"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(conta.id);
                                      }}
                                      title="Excluir Conta"
                                    >
                                      <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-2 flex flex-col space-y-1" align="end">
                              <Button variant="ghost" size="sm" onClick={() => handleOpenNewConta('mesmo')}>
                                <ArrowRight className="w-4 h-4 mr-2" /> Criar Conta Mesmo Nível
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleOpenNewConta('abaixo')}>
                                <ChevronDown className="w-4 h-4 mr-2" /> Criar Conta Nível Abaixo
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
      </div>
      
      {/* Diálogo de Criação/Edição (usando o FormPlanoContasDialog) */}
      {proprietarioId && (
          <FormPlanoContasDialog
              open={dialogAberto}
              onOpenChange={setDialogAberto}
              contaInicial={initialFormValues as PlanoContas | null}
              proprietarioId={proprietarioId}
              onSaveComplete={handleSaveComplete}
          />
      )}
    </LayoutPrincipal>
  );
};

export default PlanoContasPage;