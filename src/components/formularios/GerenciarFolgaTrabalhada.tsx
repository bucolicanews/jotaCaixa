import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, DollarSign, CalendarCheck, CalendarIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { RegistroPonto } from '@/types/ponto';
import { format, parseISO, differenceInMinutes, isSameDay } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { ptBR } from 'date-fns/locale';
// import { useSessao } from '@/hooks/use-sessao'; // Removido

interface FuncionarioGerenciado {
  id: string;
  nome: string;
  empresa_id: string; // ID do Cliente/Admin proprietário
  isFuncionarioAdmin: boolean; // NOVO CAMPO
}

interface GerenciarFolgaTrabalhadaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funcionario: FuncionarioGerenciado;
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
  const [acaoSelecionada, setAcaoSelecionada] = useState<'Compensacao' | 'Extra100' | null>(null);
  const [dataCompensacao, setDataCompensacao] = useState<Date | undefined>(undefined);
  
  const diaFormatado = format(dia, 'dd/MM/yyyy');
  
  // Determina a tabela de destino e a chave do proprietário
  const tabelaRegistros = funcionario.isFuncionarioAdmin ? 'admin_registros_ponto' : 'registros_ponto';
  const ownerKey = funcionario.isFuncionarioAdmin ? 'admin_id' : 'empresa_id';

  const minutosTrabalhados = useMemo(() => calculateMinutesWorked(registrosDoDia), [registrosDoDia]);
  const horasTrabalhadas = formatarHoras(minutosTrabalhados);
  
  // Resetar estados ao abrir o modal
  React.useEffect(() => {
      if (open) {
          setAcaoSelecionada(null);
          setDataCompensacao(undefined);
      }
  }, [open]);

  const handleDecision = async (tipo: 'Compensacao' | 'Extra100') => {
    if (tipo === 'Compensacao' && !dataCompensacao) {
        showError('Selecione a data da folga compensatória.');
        return;
    }
    
    setLoading(true);
    
    try {
      // 1. Deletar qualquer registro de decisão anterior (Compensacao ou Extra100) para este dia
      const decisionRecords = registrosDoDia.filter(r => r.tipo === 'Compensacao' || r.tipo === 'Extra100');
      if (decisionRecords.length > 0) {
        const { error: deleteError } = await supabase
          .from(tabelaRegistros) // ROTEAMENTO AQUI
          .delete()
          .in('id', decisionRecords.map(r => r.id));
        if (deleteError) throw deleteError;
      }

      // 2. Inserir o novo registro de decisão para o dia trabalhado
      const dataNoonUTC = new Date(Date.UTC(dia.getFullYear(), dia.getMonth(), dia.getDate(), 12, 0, 0));
      
      const dataToInsert = {
        funcionario_id: funcionario.id,
        [ownerKey]: funcionario.empresa_id, // empresa_id ou admin_id
        horario_registro: dataNoonUTC.toISOString(),
        tipo: tipo,
        selfie_url: 'N/A',
        maps_url: 'N/A',
        atestado_url: null,
        observacao: `Folga trabalhada: ${horasTrabalhadas}`,
      };

      const { error: insertError } = await supabase
        .from(tabelaRegistros) // ROTEAMENTO AQUI
        .insert(dataToInsert);
            
      if (insertError) throw insertError;
      
      // 3. Se for Compensação, insere um registro de Abono para o dia futuro
      if (tipo === 'Compensacao' && dataCompensacao) {
          const dataCompensacaoNoonUTC = new Date(Date.UTC(dataCompensacao.getFullYear(), dataCompensacao.getMonth(), dataCompensacao.getDate(), 12, 0, 0));
          
          const abonoToInsert = {
            funcionario_id: funcionario.id,
            [ownerKey]: funcionario.empresa_id, // empresa_id ou admin_id
            horario_registro: dataCompensacaoNoonUTC.toISOString(),
            tipo: 'Abono' as const, // Marca como Abono
            selfie_url: 'N/A',
            maps_url: 'N/A',
            atestado_url: null,
            observacao: `8h (Compensação de folga trabalhada em ${diaFormatado})`,
          };
          
          const { error: abonoError } = await supabase
            .from(tabelaRegistros) // ROTEAMENTO AQUI
            .insert(abonoToInsert);
            
          if (abonoError) throw abonoError;
      }

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
  
  const isCompensacao = acaoSelecionada === 'Compensacao';
  const isExtra100 = acaoSelecionada === 'Extra100';
  const isDecisionReady = isExtra100 || (isCompensacao && dataCompensacao);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Ajuste de responsividade: sm:max-w-full e max-h-[95vh] */}
      <DialogContent className="w-full sm:max-w-full md:max-w-[500px] max-h-[95vh] overflow-y-auto">
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
              variant={isExtra100 ? 'default' : 'outline'} 
              onClick={() => setAcaoSelecionada('Extra100')}
              disabled={loading}
              className={cn("h-12 justify-start", isExtra100 && "bg-red-600 hover:bg-red-700")}
            >
              <DollarSign className="w-5 h-5 mr-3" />
              <div className="flex flex-col items-start">
                <span className="font-semibold">Pagar a Folga (Extra 100%)</span>
                <span className="text-xs opacity-80">As horas serão pagas com adicional de 100%.</span>
              </div>
            </Button>
            
            <Button 
              variant={isCompensacao ? 'default' : 'outline'} 
              onClick={() => setAcaoSelecionada('Compensacao')}
              disabled={loading}
              className="h-12 justify-start"
            >
              <CalendarCheck className="w-5 h-5 mr-3" />
              <div className="flex flex-col items-start">
                <span className="font-semibold">Escolher Outro Dia para a Folga</span>
                <span className="text-xs opacity-80">Marca um dia futuro para folga compensatória (Abono de 8h).</span>
              </div>
            </Button>
          </div>
          
          {isCompensacao && (
              <div className="space-y-2 pt-4 border-t">
                  <label className="font-semibold text-sm">Data da Folga Compensatória</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !dataCompensacao && "text-muted-foreground"
                        )}
                        disabled={loading}
                      >
                        {dataCompensacao ? format(dataCompensacao, "PPP", { locale: ptBR }) : <span>Selecione a data da folga</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dataCompensacao}
                        onSelect={setDataCompensacao}
                        initialFocus
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
              </div>
          )}
        </div>

        <div className="flex space-x-2">
            <Button 
              onClick={() => onOpenChange(false)} 
              variant="secondary"
              className="flex-1"
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button 
              onClick={() => handleDecision(acaoSelecionada!)} 
              className="flex-1"
              disabled={loading || !isDecisionReady}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirmar Decisão'}
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GerenciarFolgaTrabalhada;