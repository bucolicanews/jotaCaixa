import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2, FileBarChart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import Papa from 'papaparse';
import { UsuarioProfile } from '@/types/usuario';
import { DateRangePicker } from '@/components/DateRangePicker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LancamentoCalima {
    id: string; // Adicionado para o log de erro
    data_movimentacao: string;
    valor: number;
    tipo: 'Entrada' | 'Saida';
    documento: string | null;
    conta_contabil_id: string;
    historico_id: string | null;
    descricao: string; // Adicionado para o complemento
    
    // Relações:
    plano_contas: { Conta: string }[] | null; // Conta de Resultado/Despesa
    historicos: { codigo: string | null }[] | null;
    
    // Corrigido para refletir a estrutura de array retornada pelo Supabase
    conta_saldo: {
        conta_contabil_id: string;
        plano_contas: { Conta: string } | null; // A relação aninhada é um objeto, mas a relação principal é um array
    }[] | null;
}

const ExportarLancamentos: React.FC = () => {
  const { perfil, role } = useSessao();
  const [loading, setLoading] = useState(false);
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>(undefined);
  const [cnpjCpf, setCnpjCpf] = useState('');

  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId();

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
          conta_contabil_id,
          historico_id,
          descricao,
          plano_contas:conta_contabil_id ( Conta ),
          historicos:historico_id ( codigo ),
          conta_saldo:conta_bancaria_id ( 
            conta_contabil_id,
            plano_contas:conta_contabil_id ( Conta )
          )
        `)
        .eq('empresa_id', ownerId)
        .gte('data_movimentacao', startDate)
        .lte('data_movimentacao', endDate)
        .order('data_movimentacao', { ascending: true });

      if (error) throw error;

      // Corrigindo o cast para 'unknown' primeiro para satisfazer o TS2352
      const lancamentos = data as unknown as LancamentoCalima[];

      if (lancamentos.length === 0) {
        showError('Nenhum lançamento encontrado no período.');
        setLoading(false);
        return;
      }

      // 2. Mapeamento para o formato Calima (Partidas Dobradas)
      const dataToExport = lancamentos.map(l => {
        // A relação aninhada retorna um array, pegamos o primeiro elemento
        const contaResultadoCodigo = l.plano_contas?.[0]?.Conta || '';
        const contaSaldoCodigo = l.conta_saldo?.[0]?.plano_contas?.Conta || '';
        const historicoCodigo = l.historicos?.[0]?.codigo || '';
        
        if (!contaResultadoCodigo || !contaSaldoCodigo) {
            // TS2339 resolvido: 'id' agora existe em LancamentoCalima
            console.warn(`Lançamento ID ${l.id} ignorado: Conta contábil ou conta de saldo não mapeada.`); 
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
        
        return {
            Data: dataFormatada,
            'Conta Débito': contaDebito,
            'Conta Crédito': contaCredito,
            Valor: valor,
            'Código Histórico': historicoCodigo,
            Complemento: l.descricao,
            'CPF/CNPJ': cnpjCpf,
        };
      }).filter(l => l !== null); // Remove lançamentos que não puderam ser mapeados

      if (dataToExport.length === 0) {
          showError('Nenhum lançamento pôde ser mapeado para o formato Calima. Verifique se todas as contas de saldo e resultado estão vinculadas a um Plano de Contas.');
          setLoading(false);
          return;
      }

      // Cabeçalhos Calima (Ordem Importante)
      const headers = ['Data', 'Conta Débito', 'Conta Crédito', 'Valor', 'Código Histórico', 'Complemento', 'CPF/CNPJ'];

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

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center"><FileBarChart className="w-5 h-5 mr-2" /> Exportar Lançamentos</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Exporta os lançamentos financeiros no período selecionado no formato de partidas dobradas (Débito/Crédito) para o Calima.
        </p>
        
        <div className="space-y-4 border p-4 rounded-md">
            <Label>Período de Exportação</Label>
            <DateRangePicker date={filtroPeriodo} setDate={setFiltroPeriodo} />
            
            <Label htmlFor="cnpj-cpf">CPF/CNPJ da Empresa (Obrigatório para Calima)</Label>
            <Input 
                id="cnpj-cpf"
                placeholder="00.000.000/0000-00"
                value={cnpjCpf}
                onChange={(e) => setCnpjCpf(e.target.value)}
            />
        </div>
        
        <Button 
            onClick={handleExport} 
            disabled={loading || !filtroPeriodo?.from || !filtroPeriodo?.to || !cnpjCpf} 
            className="w-full"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
          Baixar Lançamentos CSV
        </Button>
      </CardContent>
    </Card>
  );
};

export default ExportarLancamentos;