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
    proprietario_id: string; // ALTERADO: empresa_id -> proprietario_id
    
    // Relações:
    conta_resultado: { Conta: string }[] | null; 
    historicos: { codigo: string | null }[] | null;
    
    conta_saldo: {
        conta_contabil_id: string;
        conta_ativo: { Conta: string }[] | null; 
    }[] | null;
}

const ExportarLancamentos: React.FC = () => {
  const { perfil, role, carregando } = useSessao();
  const { printContent } = usePrint();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>(undefined);
  const [cnpjCpf, setCnpjCpf] = useState('');
  const [skippedLaunches, setSkippedLaunches] = useState<string[]>([]);
  const [totalNaoMapeados, setTotalNaoMapeados] = useState(0); // NOVO ESTADO

  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.proprietario_id;
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
              // CORREÇÃO: Acessando 'documento' que agora existe em ClienteProfile
              documento = clienteProfile.documento || clienteProfile.cpf || ''; 
          }
          setCnpjCpf(documento.replace(/\D/g, '')); // Remove caracteres não numéricos
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

      // 1. Buscar Lançamentos com as contas contábeis e históricos
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
          
          conta_resultado:plano_contas!conta_contabil_id ( Conta ),
          
          historicos:historicos!historico_id ( codigo ),
          
          conta_saldo:saldo_contas!conta_bancaria_id ( 
            conta_contabil_id,
            conta_ativo:plano_contas!conta_contabil_id ( Conta )
          )
        `)
        .eq('proprietario_id', ownerId) // USANDO proprietario_id
        .gte('data_movimentacao', startDate)
        .lte('data_movimentacao', endDate)
        .order('data_movimentacao', { ascending: true });

      if (error) throw error;

      const lancamentos = data as unknown as LancamentoCalima[];

      if (lancamentos.length === 0) {
        showError('Nenhum lançamento encontrado no período.');
        setLoading(false);
        return;
      }
      
      const currentSkipped: string[] = [];

      // 2. Mapeamento para o formato Calima (Partidas Dobradas)
      const dataToExport = lancamentos.map(l => {
        // Acessa o primeiro elemento do array de relações
        const contaResultadoCodigo = l.conta_resultado?.[0]?.Conta || '';
        
        // CORREÇÃO: Acessa o primeiro elemento de conta_saldo, e depois o primeiro elemento de conta_ativo
        const contaSaldoCodigo = l.conta_saldo?.[0]?.conta_ativo?.[0]?.Conta || '';
        
        const historicoCodigo = l.historicos?.[0]?.codigo || '';
        
        // Verifica se as contas essenciais estão mapeadas
        if (!contaResultadoCodigo || !contaSaldoCodigo || !l.historico_id) {
            const tipoTransacao = l.tipo === 'Entrada' ? 'Receita/Ativo' : 'Despesa/Ativo';
            const motivo = `Tipo: ${tipoTransacao}. Conta Resultado (${contaResultadoCodigo || 'N/A'}), Conta Saldo (${contaSaldoCodigo || 'N/A'}) ou Histórico (N/A) não mapeada.`;
            currentSkipped.push(`ID ${l.id.substring(0, 8)} (${l.tipo}): ${l.descricao} - ${motivo}`);
            return null;
        }
        
        const valor = l.valor.toFixed(2).replace('.', ',');
        const dataFormatada = format(new Date(l.data_movimentacao + 'T00:00:00'), 'dd/MM/yyyy');
        
        let contaDebito = '';
        let contaCredito = '';
        
        // Regra de Partidas Dobradas
        if (l.tipo === 'Entrada') {
            // Entrada (Receita): D - Ativo (Caixa/Banco), C - Receita
            contaDebito = contaSaldoCodigo;
            contaCredito = contaResultadoCodigo;
        } else {
            // Saída (Despesa): D - Despesa, C - Ativo (Caixa/Banco)
            contaDebito = contaResultadoCodigo;
            contaCredito = contaSaldoCodigo;
        }
        
        // Formato simplificado solicitado: Data;Valor;Conta Débito;Conta Crédito;Número Histórico
        return {
            Data: dataFormatada,
            Valor: valor,
            'Conta Débito': contaDebito,
            'Conta Crédito': contaCredito,
            'Número Histórico': historicoCodigo,
        };
      }).filter(l => l !== null); // Remove lançamentos que não puderam ser mapeados

      setSkippedLaunches(currentSkipped);

      if (dataToExport.length === 0) {
          showError('Nenhum lançamento pôde ser mapeado para o formato Calima. Verifique se todas as contas de saldo e resultado estão vinculadas a um Plano de Contas.');
          setLoading(false);
          return;
      }

      // 3. Exportar CSV
      // Headers simplificados
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
            {/* Ajuste 1: Garantir que o DateRangePicker use w-full */}
            <DateRangePicker date={filtroPeriodo} setDate={setFiltroPeriodo} className="w-full" />
            
            <Label htmlFor="cnpj-cpf">CPF/CNPJ da Empresa (Obrigatório para Calima)</Label>
            <Input 
                id="cnpj-cpf"
                placeholder="00.000.000/0000-00"
                value={cnpjCpf}
                onChange={(e) => setCnpjCpf(e.target.value)}
            />
        </div>
        
        {/* Ajuste 2: Usar flex-col em mobile e flex-row em sm:flex-row para os botões */}
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