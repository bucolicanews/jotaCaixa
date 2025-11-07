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
    id?: string; // Tornando opcional para corresponder à query
    data_movimentacao: string;
    valor: number;
    tipo: 'Entrada' | 'Saida';
    documento: string | null;
    conta_contabil_id: string;
    historico_id: string | null;
    
    // Relações (Ajustado para refletir a estrutura aninhada da query)
    plano_contas: { Conta: string } | null;
    historicos: { codigo: string | null } | null;
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
    setLoading(true);

    try {
      const startDate = format(filtroPeriodo.from, 'yyyy-MM-dd');
      const endDate = format(filtroPeriodo.to, 'yyyy-MM-dd');

      // 1. Buscar Lançamentos com as contas contábeis e históricos
      const { data, error } = await supabase
        .from('lancamentos')
        .select(`
          data_movimentacao,
          valor,
          tipo,
          documento,
          conta_contabil_id,
          historico_id,
          plano_contas:conta_contabil_id ( Conta ),
          historicos:historico_id ( codigo )
        `)
        .eq('empresa_id', ownerId)
        .gte('data_movimentacao', startDate)
        .lte('data_movimentacao', endDate)
        .order('data_movimentacao', { ascending: true });

      if (error) throw error;

      // O cast é necessário, mas a estrutura da query deve corresponder à interface
      const lancamentos = data as LancamentoCalima[];

      if (lancamentos.length === 0) {
        showError('Nenhum lançamento encontrado no período.');
        setLoading(false);
        return;
      }

      // 2. Mapeamento para o formato Calima
      const dataToExport = lancamentos.flatMap(l => {
        const contaContabil = l.plano_contas?.Conta || '';
        const historicoCodigo = l.historicos?.codigo || '';
        const valor = l.valor.toFixed(2).replace('.', ',');
        const dataFormatada = format(new Date(l.data_movimentacao + 'T00:00:00'), 'dd/MM/yyyy');
        
        return {
            Data: dataFormatada,
            Valor: valor,
            'Conta Contábil': contaContabil,
            Tipo: l.tipo,
            Documento: l.documento || '',
            'Código Histórico': historicoCodigo,
            'CPF/CNPJ': cnpjCpf,
        };
      });

      const csv = Papa.unparse(dataToExport, {
        header: true,
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
          Exporta os lançamentos financeiros no período selecionado.
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