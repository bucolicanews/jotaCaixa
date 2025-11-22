import React from 'react';
import { Control } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface FormDadosContratuaisProps {
  control: Control<any>;
  isSubmitting: boolean;
  isContractEditable: boolean;
  isReadOnly: boolean; // FIX: NOVO PROP
}

const FormDadosContratuais: React.FC<FormDadosContratuaisProps> = ({ control, isSubmitting, isContractEditable, isReadOnly }) => {
  
  // A edição é permitida apenas se o contrato for editável E não estiver em modo somente leitura
  const isEditable = isContractEditable && !isReadOnly;

  const renderDateField = (fieldName: string, label: string, disabled: boolean) => (
    <FormField
      control={control}
      name={fieldName}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>{label}</FormLabel>
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full pl-3 text-left font-normal",
                    !field.value && "text-muted-foreground"
                  )}
                  disabled={disabled || isSubmitting || !isEditable} // Bloqueado se isReadOnly
                >
                  {field.value ? format(field.value as Date, "PPP", { locale: ptBR }) : <span>Selecione a data</span>}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={field.value as Date}
                onSelect={field.onChange}
                initialFocus
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <div className="space-y-6">
        <p className="text-sm text-muted-foreground">Estes campos são usados para gestão de RH.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderDateField('data_inicio_contrato', 'Início do Contrato', !isEditable)}
            {renderDateField('data_fim_contrato', 'Fim do Contrato', !isEditable)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderDateField('data_inicio_aviso', 'Início do Aviso Prévio', !isEditable)}
            <FormField
                control={control}
                name="tipo_aviso"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Tipo de Aviso</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value || 'Nenhum'} disabled={!isEditable || isSubmitting}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione o tipo de aviso" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="Nenhum">Nenhum</SelectItem>
                                <SelectItem value="Trabalhado">Trabalhado</SelectItem>
                                <SelectItem value="Indenizado">Indenizado</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    </div>
  );
};

export default FormDadosContratuais;