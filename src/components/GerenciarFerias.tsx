import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, PlusCircle, Trash2, CalendarIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Ferias {
    id: string;
    data_inicio: string;
    data_fim: string;
    periodo_referencia: string;
}

interface GerenciarFeriasProps {
  funcionarioId: string;
  empresaId: string;
}

const GerenciarFerias: React.FC<GerenciarFeriasProps> = ({ funcionarioId, empresaId }) => {
  const [ferias, setFerias] = useState<Ferias[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [periodoReferencia, setPeriodoReferencia] = useState('');

  const fetchFerias = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ferias')
      .select('*')
      .eq('funcionario_id', funcionarioId)
      .order('data_inicio', { ascending: false });

    if (error) {
      showError('Erro ao carregar férias: ' + error.message);
      setFerias([]);
    } else {
      setFerias(data as Ferias[]);
    }
    setLoading(false);
  }, [funcionarioId]);

  useEffect(() => {
    fetchFerias();
  }, [fetchFerias]);

  const handleAddFerias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dateRange?.from || !dateRange.to || !periodoReferencia.trim()) {
      showError('Preencha o período de férias e a referência.');
      return;
    }

    setIsSubmitting(true);
    
    const dataToInsert = {
      funcionario_id: funcionarioId,
      empresa_id: empresaId,
      data_inicio: format(dateRange.from, 'yyyy-MM-dd'),
      data_fim: format(dateRange.to, 'yyyy-MM-dd'),
      periodo_referencia: periodoReferencia.trim(),
    };

    const { error } = await supabase.from('ferias').insert(dataToInsert);

    if (error) {
      showError('Falha ao registrar férias: ' + error.message);
    } else {
      showSuccess('Férias registradas com sucesso!');
      setDateRange(undefined);
      setPeriodoReferencia('');
      fetchFerias();
    }
    setIsSubmitting(false);
  };

  const handleDeleteFerias = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro de férias?')) return;
    
    const { error } = await supabase.from('ferias').delete().eq('id', id);

    if (error) {
      showError('Falha ao excluir férias: ' + error.message);
    } else {
      showSuccess('Registro de férias excluído.');
      fetchFerias();
    }
  };

  const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Gestão de Férias</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleAddFerias} className="space-y-4 border p-4 rounded-md">
          <h3 className="font-semibold">Adicionar Novo Período</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 col-span-1 md:col-span-2">
              <Label>Período de Férias</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="date"
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateRange?.from && "text-muted-foreground"
                    )}
                    disabled={isSubmitting}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "dd/MM/yyyy")} -{" "}
                          {format(dateRange.to, "dd/MM/yyyy")}
                        </>
                      ) : (
                        format(dateRange.from, "dd/MM/yyyy")
                      )
                    ) : (
                      <span>Selecione o período</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={1} 
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodo-referencia">Referência (Ex: 2023/2024)</Label>
              <Input
                id="periodo-referencia"
                value={periodoReferencia}
                onChange={(e) => setPeriodoReferencia(e.target.value)}
                placeholder="2024/2025"
                disabled={isSubmitting}
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting || !dateRange?.from || !dateRange.to}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <PlusCircle className="w-4 h-4 mr-2" />
            Registrar Férias
          </Button>
        </form>

        <h3 className="font-semibold mt-6">Períodos Registrados</h3>
        {loading ? (
          <div className="flex justify-center items-center h-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : ferias.length === 0 ? (
          <p className="text-muted-foreground">Nenhum período de férias registrado.</p>
        ) : (
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referência</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ferias.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.periodo_referencia}</TableCell>
                    <TableCell>{formatDate(f.data_inicio)}</TableCell>
                    <TableCell>{formatDate(f.data_fim)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteFerias(f.id)} disabled={isSubmitting}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GerenciarFerias;