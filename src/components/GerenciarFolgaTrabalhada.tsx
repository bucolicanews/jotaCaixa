import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, DollarSign, CalendarCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { RegistroPonto } from '@/types/ponto';
import { format, parseISO, differenceInMinutes, isSameDay } from 'date-fns';

interface GerenciarFolgaTrabalhadaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funcionario: { id: string, nome: string, empresa_id: string };
  dia: Date;
  registrosDoDia: RegistroPonto[];
  onSaveComplete: () => void;
}

const calculateMinutesWorked = (registros: RegistroPonto[]): number => {
    let minutes = 0;
    let entrada: Date | null = null;
    
    const pontoRecords = registros.filter(r => r.tipo === 'Entrada' || r.tipo === 'Saida');
    
    for (const registro of pontoRecords) {
        const horario = parseISO(registro.horario_registro);
        
        if (registro.tipo === 'Entrada') {
            entrada = horario;
        } else if (registro.tipo === 'Saida' && entrada && isSameDay(horario, entrada)) {
            minutes += differenceInMinutes(horario, entrada);
            entrada = null;
        }
    }
    return minutes;
};

const formatarHoras = (minutos: number): string => {
    const horas = Math.floor(minutos / 60);
    const mins = Math.round(minutos % 60);
    return `${horas}h ${mins}m`;
};

const GerenciarFolgaTrabalhada: React.FC<GerenciarFolgaTrabalhadaProps> = ({ open, onOpenChange, funcionario, dia, registrosDoDia, onSaveComplete }) => {
  const [loading, setLoading] = useState(false);
  const diaFormatado = format(dia, 'dd/MM/yyyy');

  const minutosTrabalhados = useMemo(() => calculateMinutesWorked(registrosDoDia), [registrosDoDia]);
  const horasTrabalhadas = formatarHoras(minutosTrabalhados);

  const handleDecision = async (tipo: 'Compensacao' | 'Extra100') => {
    setLoading(true);
    
    try {
      // 1. Deletar qualquer registro de decisão anterior (Compensacao ou Extra100) para este dia
      const decisionRecords = registrosDoDia.filter(r => r.tipo === 'Compensacao' || r.tipo === 'Extra100');
      if (decisionRecords.length > 0) {
        const { error: deleteError } = await supabase
          .from('registros_ponto')
          .delete()
          .in('id', decisionRecords.map(r => r.id));
        if (deleteError) throw deleteError;
      }

      // 2. Inserir o novo registro de decisão
      const dataNoonUTC = new Date(Date.UTC(dia.getFullYear(), dia.getMonth(), dia.getDate(), 12, 0, 0));
      
      const dataToInsert = {
        funcionario_id: funcionario.id,
        empresa_id: funcionario.empresa_id,
        horario_registro: dataNoonUTC.toISOString(),
        tipo: tipo,
        selfie_url: 'N/A',
        maps_url: 'N/A',
        atestado_url: null,
        observacao: `Folga trabalhada: ${horasTrabalhadas}`,
      };

      const { error: insertError } = await supabase
        .from('registros_ponto')
        .insert(dataToInsert);
            
      if (insertError) throw insertError;

      showSuccess(`Decisão de ${tipo === 'Extra100' ? 'Pagamento Extra' : 'Compensação'} registrada com sucesso!`);
      onSaveComplete();
      onOpenChange(false);

    } catch (error: any) {
      console.error('Erro ao gerenciar folga trabalhada:', error);
      showError('Falha ao salvar decisão: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Gerenciar Folga Trabalhada</DialogTitle>
          <DialogDescription>
            O funcionário <strong>{funcionario.nome}</strong> trabalhou em sua folga fixa no dia <strong>{diaFormatado}</strong>.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500 rounded-md">
            <p className="font-semibold text-lg text-yellow-700 dark:text-yellow-300">
                Horas Registradas: {horasTrabalhadas}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
                Selecione como compensar o trabalho realizado neste dia de folga.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <Button 
              variant="default" 
              onClick={() => handleDecision('Extra100')}
              disabled={loading}
              className="h-12 justify-start"
            >
              <DollarSign className="w-5 h-5 mr-3" />
              <div className="flex flex-col items-start">
                <span className="font-semibold">Pagar a Folga (Extra 100%)</span>
                <span className="text-xs opacity-80">As horas serão pagas com adicional de 100%.</span>
              </div>
            </Button>
            
            <Button 
              variant="outline" 
              onClick={() => handleDecision('Compensacao')}
              disabled={loading}
              className="h-12 justify-start"
            >
              <CalendarCheck className="w-5 h-5 mr-3" />
              <div className="flex flex-col items-start">
                <span className="font-semibold">Escolher Outro Dia para a Folga</span>
                <span className="text-xs opacity-80">As horas serão compensadas com um dia de folga futuro (Banco de Horas).</span>
              </div>
            </Button>
          </div>
        </div>

        <Button 
          onClick={() => onOpenChange(false)} 
          variant="secondary"
          className="w-full"
          disabled={loading}
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Cancelar'}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default GerenciarFolgaTrabalhada;