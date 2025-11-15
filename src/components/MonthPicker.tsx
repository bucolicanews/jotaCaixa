import { useState, useEffect } from 'react';
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
  
  const [tempDate, setTempDate] = useState(date);
  const [open, setOpen] = useState(false);

  // Sincroniza tempDate quando o popover abre ou a data externa muda
  useEffect(() => {
    if (!open) {
        setTempDate(date);
    }
  }, [date, open]);

  // Função para garantir que a data selecionada seja sempre o início do mês
  const handleSelect = (newDate: Date | undefined) => {
    if (newDate) {
      setTempDate(startOfMonth(newDate));
    }
  };

  // Função chamada quando o mês/ano muda via dropdowns (onMonthChange)
  const handleMonthChange = (newMonth: Date) => {
    // Garante que a data temporária seja o início do novo mês selecionado
    setTempDate(startOfMonth(newMonth));
  };

  const handleConfirm = () => {
    setDate(tempDate);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          selected={tempDate}
          onSelect={handleSelect}
          onMonthChange={handleMonthChange} // Agora este callback funciona
          initialFocus
          locale={ptBR}
          numberOfMonths={1}
          defaultMonth={tempDate}
          classNames={{
            nav: "hidden", 
            table: "hidden", 
            head_row: "hidden", 
            row: "hidden", 
            // Removido 'caption_dropdowns: "hidden"' para exibir os dropdowns de mês/ano
          }}
        />
        <div className="p-2 border-t flex justify-end">
            <Button size="sm" onClick={handleConfirm}>
                Confirmar
            </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}