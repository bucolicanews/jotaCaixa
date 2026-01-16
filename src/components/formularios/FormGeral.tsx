import React from 'react';
import { Control } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { GRUPOS_PERMISSOES } from '@/config/permissoes';
import NumberField from './NumberField';

interface FormGeralProps {
  control: Control<any>;
  isSubmitting: boolean;
  handleSelectAll: (select: boolean) => void;
  isReadOnly: boolean;
  isEditingSelfPermissions: boolean;
}

const FormGeral: React.FC<FormGeralProps> = ({
  control,
  isSubmitting,
  handleSelectAll,
  isReadOnly,
  isEditingSelfPermissions,
}) => {
  
  const nomeLabel = 'Nome Completo';
  const isNameEditable = !isReadOnly;

  return (
    <div className="space-y-4">
      <FormField control={control} name="nome" render={({ field }) => (
        <FormItem>
          <FormLabel>{nomeLabel}</FormLabel>
          <FormControl>
            <Input placeholder="Nome completo" {...field} disabled={!isNameEditable} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />
      
      <h4 className="font-semibold mt-6 border-t pt-4">Remuneração e Jornada</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NumberField control={control} name="salario" label="Salário Mensal (R$)" placeholder="0" disabled={isSubmitting || isReadOnly} />
        <NumberField control={control} name="horas_semanais" label="Horas Semanais" placeholder="44" disabled={isSubmitting || isReadOnly} />
        <NumberField control={control} name="horas_mensais" label="Horas Mensais" placeholder="220" disabled={isSubmitting || isReadOnly} />
      </div>
      
      <div className="space-y-4 pt-4 border-t">
        <div className="flex justify-between items-center mb-1">
          <FormLabel className="text-lg font-semibold">Permissões de Acesso</FormLabel>
          <div className="space-x-2">
            <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(true)} className="p-0 h-auto" disabled={isSubmitting || isReadOnly || isEditingSelfPermissions}>Selecionar Todos</Button>
            <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(false)} className="p-0 h-auto text-destructive" disabled={isSubmitting || isReadOnly || isEditingSelfPermissions}>Desmarcar Todos</Button>
          </div>
        </div>
        
        <div className="space-y-4">
          {GRUPOS_PERMISSOES.map((grupo) => (
            <div key={grupo.key} className="rounded-lg border p-4">
              <h5 className="font-semibold text-sm text-primary mb-3 border-b pb-2">{grupo.label}</h5>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {grupo.permissoes.map((p) => (
                  <FormField key={p.key} control={control} name={`permissoes.${p.key}`} render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting || isReadOnly || isEditingSelfPermissions} />
                      </FormControl>
                      <FormLabel className="font-normal text-sm">{p.label}</FormLabel>
                    </FormItem>
                  )} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FormGeral;