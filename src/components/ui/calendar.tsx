"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, useNavigation } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

// Componente de Cabeçalho Personalizado com Selects do shadcn/ui
function CaptionComponent(props: { displayMonth: Date, onMonthChange?: (month: Date) => void }) {
  const { goToMonth } = useNavigation();
  const { displayMonth, onMonthChange } = props;

  const months = Array.from({ length: 12 }, (_, i) => {
    const month = new Date(displayMonth.getFullYear(), i, 1);
    return {
      value: i,
      label: format(month, "MMMM", { locale: ptBR }),
    };
  });

  // Gera anos de 5 anos atrás até 5 anos à frente
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => {
    const year = currentYear - 5 + i;
    return {
      value: year,
      label: String(year),
    };
  });

  const handleMonthChange = (value: string) => {
    const newMonth = new Date(displayMonth.getFullYear(), Number(value));
    goToMonth(newMonth);
    if (onMonthChange) {
        onMonthChange(newMonth);
    }
  };

  const handleYearChange = (value: string) => {
    const newYear = new Date(Number(value), displayMonth.getMonth());
    goToMonth(newYear);
    if (onMonthChange) {
        onMonthChange(newYear);
    }
  };

  return (
    <div className="flex justify-center gap-2 p-2">
      <Select
        value={String(displayMonth.getMonth())}
        onValueChange={handleMonthChange}
      >
        <SelectTrigger className="w-[120px] h-8">
          <SelectValue placeholder="Mês" />
        </SelectTrigger>
        <SelectContent>
          {months.map((month) => (
            <SelectItem key={month.value} value={String(month.value)}>
              {month.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={String(displayMonth.getFullYear())}
        onValueChange={handleYearChange}
      >
        <SelectTrigger className="w-[100px] h-8">
          <SelectValue placeholder="Ano" />
        </SelectTrigger>
        <SelectContent>
          {years.map((year) => (
            <SelectItem key={year.value} value={String(year.value)}>
              {year.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}


function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  onMonthChange, // Capturando onMonthChange aqui
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        caption_dropdowns: "hidden", 
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
        // Passando onMonthChange para o CaptionComponent
        Caption: (props) => <CaptionComponent {...props} onMonthChange={onMonthChange} />, 
      }}
      locale={ptBR}
      labels={{
        labelMonthDropdown: () => "Mês:",
        labelYearDropdown: () => "Ano:",
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };