import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Ferias } from '@/types/ferias';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Loader2, Plus, Trash2, CalendarIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface GerenciarFeriasProps {
  funcionarioId: string;
  empresaId: string;
  readOnly?: boolean; // Adicionando a prop readOnly
}

const GerenciarFerias: React.FC<GerenciarFeriasProps> = ({ funcionarioId, empresaId, readOnly = false }) => {
  const [ferias, setFerias] = useState<Ferias[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novaDataInicio, setNovaDataInicio] = useState<Date | undefined>(undefined);
  const [novaDataFim, setNovaDataFim] = useState<Date | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const buscarFerias = useCallback(async () => {
    setCarregando(true);
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
    setCarregando(false);
  }, [funcionarioId]);

  useEffect(() => {
    buscarFerias();
  }, [buscarFerias]);

  const handleAdicionarFerias = async () => {
    if (!novaDataInicio || !novaDataFim) {
      showError('Selecione as datas de início e fim.');
      return;
    }
    if (novaDataInicio >= novaDataFim) {
      showError('A data de início deve ser anterior à data de fim.');
      return;
    }

    setIsSubmitting(true);

    try {
      const feriasData = {
        funcionario_id: funcionarioId,
        empresa_id: empresaId,
        data_inicio: format(novaDataInicio, 'yyyy-MM-dd'),
        data_fim: format(novaDataFim, 'yyyy-MM-dd'),
        status: 'agendada', // Padrão inicial
      };

      const { error } = await supabase.from('ferias').insert(feriasData);

      if (error) throw error;

      showSuccess('Férias agendadas com sucesso!');
      setNovaDataInicio(undefined);
      setNovaDataFim(undefined);
      buscarFerias();
    } catch (error: any) {
      showError('Falha ao agendar férias: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoverFerias = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja remover este período de férias?')) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('ferias').delete().eq('id', id);

      if (error) throw error;

      showSuccess('Férias removidas com sucesso.');
      buscarFerias();
    } catch (error: any) {
      showError('Falha ao remover férias: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Gestão de Férias</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <div className="border p-4 rounded-md space-y-3">
            <h4 className="font-semibold text-sm">Agendar Novo Período</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !novaDataInicio && "text-muted-foreground"
                    )}
                    disabled={isSubmitting}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {novaDataInicio ? format(novaDataInicio, "PPP", { locale: ptBR }) : <span>Data Início</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={novaDataInicio}
                    onSelect={setNovaDataInicio}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !novaDataFim && "text-muted-foreground"
                    )}
                    disabled={isSubmitting}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {novaDataFim ? format(novaDataFim, "PPP", { locale: ptBR }) : <span>Data Fim</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={novaDataFim}
                    onSelect={setNovaDataFim}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>

              <Button onClick={handleAdicionarFerias} disabled={isSubmitting || !novaDataInicio || !novaDataFim}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Agendar
              </Button>
            </div>
          </div>
        )}

        <h4 className="font-semibold text-sm mt-4">Histórico de Férias</h4>
        {carregando ? (
          <div className="flex justify-center items-center h-20"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : ferias.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum período de férias registrado.</p>
        ) : (
          <div className="space-y-2">
            {ferias.map((f) => (
              <div key={f.id} className="flex justify-between items-center p-3 border rounded-md">
                <div className="text-sm">
                  <p className="font-medium">
                    {format(parseISO(f.data_inicio), 'dd/MM/yyyy')} - {format(parseISO(f.data_fim), 'dd/MM/yyyy')}
                  </p>
                  <p className={cn("text-xs", f.status === 'agendada' ? 'text-blue-500' : 'text-green-500')}>
                    {f.status.charAt(0).toUpperCase() + f.status.slice(1)}
                  </p>
                </div>
                {!readOnly && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleRemoverFerias(f.id)} 
                    disabled={isSubmitting}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GerenciarFerias;