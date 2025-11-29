import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2, FileBarChart, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import Papa from 'papaparse';
import { UsuarioProfile, ClienteProfile, AdminProfile } from '@/types/usuario';
import { DateRangePicker } from '@/components/DateRangePicker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import ExportacaoCalimaPrint from './ExportacaoCalimaPrint';
import { useNavigate } from 'react-router-dom';

interface LancamentoCalima {
    id: string;
    data_movimentacao: string;
    valor: number;
    tipo: 'Entrada' | 'Saida';
    documento: string | null;
    conta_contabil_id: string;
    historico_id: string | null;
    descricao: string;
    proprietario_id: string;
    conta_resultado_id: string | null; // ID do lançamento emparelhado
    
    // Relações:
    conta_contabil: { Conta: string, Descricao: string } | null; // NOVO: Relação direta com a conta contábil
    historicos: { codigo: string | null } | null;
    
    // Relação para conta de saldo (só existe se conta_bancaria_id não for nulo)
    conta_saldo: {
        conta_contabil_id: string;
        conta_ativo: { Conta: string } | null; 
    } | null;
}

const ExportarLancamentos: React.FC = () => {
  const { perfil, role, carregando } = useSessao();
  const { printContent } = usePrint();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>(undefined);
  const [cnpjCpf, setCnpjCpf] = useState('');
  const [skippedLaunches, setSkippedLaunches] = useState<string[]>([]);
  const [totalNaoMapeados, setTotalNaoMapeados] = useState(0);

  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId();
  
  // Efeito para preencher o CPF/CNPJ automaticamente
  useEffect(() => {
      if (!carregando && perfil) {
          let documento = '';
          if (role === 'Admin') {
              const adminProfile = perfil as AdminProfile;
              documento = adminProfile.cnpj || adminProfile.cpf || '';
          } else if (role === 'Cliente') {
              const clienteProfile = perfil as ClienteProfile;
              documento = clienteProfile.documento || clienteProfile.cpf || ''; 
          }
          setCnpjCpf(documento.replace(/\D/g, ''));
      }
  }, [carregando, perfil, role]);
  
  // Efeito para buscar o total de lançamentos não mapeados
  const fetchTotalNaoMapeados = useCallback(async () => {
      if (!ownerId) return;
      
      const { count, error } = await supabase
          .from('lancamentos')
          .select('id', { count: 'exact', head: true })
          .eq('proprietario_id', ownerId)
          .or('conta_contabil_id.is.null,historico_id.is.null');
          
      if (error) {
          console.error('Erro ao contar não mapeados:', error);
          setTotalNaoMapeados(0);
      } else {
          setTotalNaoMapeados(count || 0);
      }
  }, [ownerId]);
  
  useEffect(() => {
      fetchTotalNaoMapeados();
  }, [fetchTotalNaoMapeados]);

  const handleExport = useCallback(async () => {
    if (!ownerId || !filtroPeriodo?.from || !filtroPeriodo?.to) {
      showError('Selecione o período de exportação.');
      return;
    }
    if (!cnpjCpf) {
        showError('O CPF/CNPJ da empresa é obrigatório para a exportação Calima.');
        return;
    }
    setLoading(true);
    setSkippedLaunches([]);

    try {
      const startDate = format(filtroPeriodo.from, 'yyyy-MM-dd');
      const endDate = format(filtroPeriodo.to, 'yyyy-MM-dd');

      // 1. Buscar TODOS os Lançamentos do Período (incluindo os que foram marcados como estornados)
      const { data, error } = await supabase
        .from('lancamentos')
        .select(`
          id,
          data_movimentacao,
          valor,
          tipo,
          documento,
          descricao,
          proprietario_id,
          conta_contabil_id,
          conta_bancaria_id,
          conta_resultado_id,
          origem,
          
          conta_contabil:conta_contabil_id ( Conta, Descricao ),
          historicos:historico_id ( codigo ),
          
          conta_saldo:conta_bancaria_id ( 
            conta_contabil_id,
            conta_ativo:plano_contas!conta_contabil_id ( Conta )
          )
        `)
        .eq('proprietario_id', ownerId)
        .gte('data_movimentacao', startDate)
        .lte('data_movimentacao', endDate)
        // REMOVIDO: .neq('origem', 'movimentacao_direta_estornada')
        .order('data_movimentacao', { ascending: true });

      if (error) throw error;

      const lancamentos = data as unknown as LancamentoCalima[];
      
      // NOVO LOG PARA DEPURAR
      console.log(`[Export] Total de Lançamentos Buscados: ${lancamentos.length}`);
      lancamentos.forEach(l => console.log(`[Export] ID: ${l.id.substring(0, 8)}, Valor: ${l.valor}, Tipo: ${l.tipo}, Origem: ${l.origem}, Par: ${l.conta_resultado_id?.substring(0, 8)}`));
      // FIM NOVO LOG

      if (lancamentos.length === 0) {
        showError('Nenhum lançamento encontrado no período.');
        setLoading(false);
        return;
      }
      
      const currentSkipped: string[] = [];
      const processedLaunchIds = new Set<string>();
      const dataToExport: any[] = [];

      // 2. Agrupar em Pares (Débito/Crédito)
      for (const l of lancamentos) {
        if (processedLaunchIds.has(l.id)) continue;

        // Busca o par usando a referência cruzada (conta_resultado_id)
        const par = lancamentos.find(p => p.id === l.conta_resultado_id && p.id !== l.id);
        
        // Se não for um par, ignora e registra o erro
        if (!par) {
            currentSkipped.push(`ID ${l.id.substring(0, 8)}: Lançamento sem par de partida dobrada. Ignorado.`);
            processedLaunchIds.add(l.id);
            continue;
        }
        
        // Encontramos o par. Agora, identificamos Débito e Crédito.
        const debito = l.tipo === 'Entrada' ? l : par;
        const credito = l.tipo === 'Saida' ? l : par;
        
        // CRÍTICO: Se o valor for zero, ignora (pode ser um estorno que se cancelou)
        if (Math.abs(debito.valor) < 0.01 || Math.abs(credito.valor) < 0.01) {
            processedLaunchIds.add(l.id);
            processedLaunchIds.add(par.id);
            continue;
        }
        
        // 3. Mapeamento de Contas
        
        // Conta Débito: Deve ser a conta contábil do lançamento de Débito (Entrada)
        let contaDebitoCodigo = debito.conta_contabil?.Conta || '';
        
        // Se o Débito for uma movimentação de Caixa/Banco, a conta contábil é a conta de Ativo (conta_ativo)
        if (debito.conta_bancaria_id) {
            contaDebitoCodigo = debito.conta_saldo?.conta_ativo?.Conta || '';
        }
        
        // Conta Crédito: Deve ser a conta contábil do lançamento de Crédito (Saída)
        let contaCreditoCodigo = credito.conta_contabil?.Conta || '';
        
        // Se o Crédito for uma movimentação de Caixa/Banco, a conta contábil é a conta de Ativo (conta_ativo)
        if (credito.conta_bancaria_id) {
            contaCreditoCodigo = credito.conta_saldo?.conta_ativo?.Conta || '';
        }
        
        const historicoCodigo = debito.historicos?.codigo || credito.historicos?.codigo || '';
        
        // 4. Validação
        if (!contaDebitoCodigo || !contaCreditoCodigo || !historicoCodigo) {
            const motivo = `Conta Débito (${contaDebitoCodigo || 'N/A'}), Conta Crédito (${contaCreditoCodigo || 'N/A'}) ou Histórico (N/A) não mapeada.`;
            currentSkipped.push(`ID ${l.id.substring(0, 8)}: ${debito.descricao} / ${credito.descricao} - ${motivo}`);
            processedLaunchIds.add(l.id);
            processedLaunchIds.add(par.id);
            continue;
        }
        
        // 5. Exportar
        const valor = Math.abs(debito.valor).toFixed(2).replace('.', ',');
        const dataFormatada = format(new Date(debito.data_movimentacao + 'T00:00:00'), 'dd/MM/yyyy');
        
        dataToExport.push({
            Data: dataFormatada,
            Valor: valor,
            'Conta Débito': contaDebitoCodigo,
            'Conta Crédito': contaCreditoCodigo,
            'Número Histórico': historicoCodigo,
        });
        
        processedLaunchIds.add(l.id);
        processedLaunchIds.add(par.id);
      }

      setSkippedLaunches(currentSkipped);

      if (dataToExport.length === 0) {
          showError('Nenhum lançamento pôde ser mapeado para o formato Calima. Verifique se todas as contas de saldo e resultado estão vinculadas a um Plano de Contas.');
          setLoading(false);
          return;
      }

      // 6. Exportar CSV
      const headers = ['Data', 'Valor', 'Conta Débito', 'Conta Crédito', 'Número Histórico'];

      const csv = Papa.unparse(dataToExport, {
        header: true,
        columns: headers,
        delimiter: ';',
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'lancamentos_calima.csv');
      link.click();

      showSuccess('Lançamentos exportados com sucesso!');

    } catch (error: any) {
      console.error('Erro ao exportar lançamentos:', error);
      showError('Falha na exportação: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [ownerId, filtroPeriodo, cnpjCpf]);
  
  const handlePrintErrors = () => {
      if (skippedLaunches.length === 0 || !filtroPeriodo?.from || !filtroPeriodo?.to) {
          showError('Nenhum erro para imprimir.');
          return;
      }
      
      const periodoDisplay = `${format(filtroPeriodo.from, 'dd/MM/yyyy')} - ${format(filtroPeriodo.to, 'dd/MM/yyyy')}`;
      
      const printComponent = (
          <ExportacaoCalimaPrint 
              skippedLaunches={skippedLaunches} 
              periodo={periodoDisplay} 
          />
      );

      const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
      printContent(htmlContent, `Erros Calima - ${periodoDisplay}`);
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center"><FileBarChart className="w-5 h-5 mr-2" /> Exportar Lançamentos</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Exporta os lançamentos financeiros no período selecionado no formato de partidas dobradas (Débito/Crédito) para o Calima.
        </p>
        
        <div className="space-y-4 border p-4 rounded-md">
            <Label>Período de Exportação</Label>
            <DateRangePicker date={filtroPeriodo} setDate={setFiltroPeriodo} className="w-full" />
            
            <Label htmlFor="cnpj-cpf">CPF/CNPJ da Empresa (Obrigatório para Calima)</Label>
            <Input 
                id="cnpj-cpf"
                placeholder="00.000.000/0000-00"
                value={cnpjCpf}
                onChange={(e) => setCnpjCpf(e.target.value)}
            />
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
            <Button 
                onClick={handleExport} 
                disabled={loading || !filtroPeriodo?.from || !filtroPeriodo?.to || !cnpjCpf} 
                className="w-full sm:w-auto"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
              Baixar Lançamentos CSV
            </Button>
            
            <Button 
                onClick={() => navigate('/relatorios/lancamentos-nao-mapeados')}
                variant="outline" 
                disabled={totalNaoMapeados === 0}
                className="w-full sm:w-auto flex-shrink-0"
            >
                <AlertTriangle className="w-4 h-4 mr-2 text-yellow-500" /> Mapear Pendentes ({totalNaoMapeados})
            </Button>
        </div>
        
        {skippedLaunches.length > 0 && (
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500 rounded-md text-sm text-yellow-700 dark:text-yellow-300">
                <p className="font-semibold mb-1">Aviso: {skippedLaunches.length} Lançamentos Ignorados</p>
                <p>Os lançamentos ignorados não possuem vínculo contábil ou histórico. <Button variant="link" size="sm" onClick={handlePrintErrors} className="p-0 h-auto text-yellow-700 dark:text-yellow-300">Imprima o relatório de erros</Button> para detalhes.</p>
            </div>
        )}
        
        <p className="text-xs text-muted-foreground">
            Verifique se as contas de saldo em <a href="/bancos" className="underline">Bancos/Caixas</a> e as contas de resultado em <a href="/plano-contas" className="underline">Plano de Contas</a> estão corretamente vinculadas.
        </p>
      </CardContent>
    </Card>
  );
};

export default ExportarLancamentos;