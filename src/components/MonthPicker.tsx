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
          captionLayout="dropdown-buttons"
          selected={date}
          onSelect={handleSelect}
          initialFocus
          locale={ptBR}
          // Configurações para mostrar apenas o seletor de mês/ano
          numberOfMonths={1}
          defaultMonth={date}
          // Oculta a tabela de dias
          classNames={{
            table: "hidden",
            head_row: "hidden",
            row: "hidden",
            caption_dropdowns: "flex gap-1 justify-center p-2", // Garante que os dropdowns fiquem visíveis
            caption: "flex justify-center pt-1 relative items-center",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}