import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ptBR } from "date-fns/locale";
import { startOfMonth } from "date-fns";

interface MonthPickerProps {
  date: Date;
  setDate: (date: Date) => void;
  disabled?: boolean;
}

export function MonthPicker({
  date,
  setDate,
  disabled = false,
}: MonthPickerProps) {
  
  // Função para garantir que a data selecionada seja sempre o início do mês
  const handleSelect = (newDate: Date | undefined) => {
    if (newDate) {
      setDate(startOfMonth(newDate));
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full sm:w-[200px] justify-start text-left font-normal",
            !date && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? (
            format(date, "MMMM yyyy", { locale: ptBR })
          ) : (
            <span>Selecione o mês</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          // Usamos 'dropdown-buttons' para forçar os seletores de mês e ano
          captionLayout="dropdown-buttons" 
          selected={date}
          onSelect={handleSelect}
          initialFocus
          locale={ptBR}
          // Configurações para mostrar apenas o seletor de mês/ano
          numberOfMonths={1}
          defaultMonth={date}
          // Oculta a tabela de dias e a navegação de setas, mantendo apenas os dropdowns
          classNames={{
            months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
            month: "space-y-4",
            caption: "flex justify-center pt-1 relative items-center",
            caption_label: "hidden", // Oculta o rótulo de texto do mês/ano
            nav: "hidden", // Oculta as setas de navegação
            table: "hidden", // Oculta a tabela de dias
            head_row: "hidden", // Oculta o cabeçalho dos dias
            row: "hidden", // Oculta as linhas dos dias
            // Garante que os dropdowns fiquem visíveis e centralizados
            caption_dropdowns: "flex gap-2 justify-center p-2", 
          }}
        />
      </PopoverContent>
    </Popover>
  );
}