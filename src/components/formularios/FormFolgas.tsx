import React from 'react';
import { Control } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';

interface FormFolgasProps {
  control: Control<any>;
  isSubmitting: boolean;
  usuarioInicial: UsuarioProfile | AdminUsuarioProfile | null;
  isReadOnly: boolean; // NOVO PROP
}

const DIAS_DA_SEMANA = [
    { value: 'Monday', label: 'Segunda-feira' },
    { value: 'Tuesday', label: 'Terça-feira' },
    { value: 'Wednesday', label: 'Quarta-feira' },
    { value: 'Thursday', label: 'Quinta-feira' },
    { value: 'Friday', label: 'Sexta-feira' },
    { value: 'Saturday', label: 'Sábado' },
    { value: 'Sunday', label: 'Domingo' },
];

const FormFolgas: React.FC<FormFolgasProps> = ({ control, isSubmitting, usuarioInicial, isReadOnly }) => {
  
  if (!usuarioInicial) {
      return (
          <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                  As configurações de folgas estarão disponíveis após a criação do usuário.
              </p>
          </div>
      );
  }

  return (
    <div className="space-y-6">
        <h4 className="font-semibold">Configuração de Folgas Fixas</h4>
        <FormField
            control={control}
            name="folga_domingo_obrigatoria"
            render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                        <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isSubmitting || isReadOnly} // Bloqueado se isReadOnly
                        />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                        <FormLabel>
                            Considerar Domingo como Folga Obrigatória (Padrão CLT)
                        </FormLabel>
                        <p className="text-sm text-muted-foreground">
                            Se desmarcado, o domingo será considerado dia útil, a menos que seja marcado abaixo.
                        </p>
                    </div>
                </FormItem>
            )}
        />
        <FormField
            control={control}
            name="dias_folga_fixos"
            render={() => (
                <FormItem>
                    <FormLabel>Dias de Folga Fixos (Além do Domingo)</FormLabel>
                    <div className="grid grid-cols-3 gap-2">
                        {DIAS_DA_SEMANA.map((item) => (
                            <FormField
                                key={item.value}
                                control={control}
                                name="dias_folga_fixos"
                                render={({ field: arrayField }) => {
                                    const current = arrayField.value || [];
                                    const isChecked = current.includes(item.value);
                                    return (
                                        <FormItem
                                            key={item.value}
                                            className="flex flex-row items-start space-x-3 space-y-0"
                                        >
                                            <FormControl>
                                                <Checkbox
                                                    checked={isChecked}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            arrayField.onChange([...current, item.value]);
                                                        } else {
                                                            arrayField.onChange(
                                                                current.filter((value: string) => value !== item.value)
                                                            );
                                                        }
                                                    }}
                                                    disabled={isSubmitting || isReadOnly} // Bloqueado se isReadOnly
                                                />
                                            </FormControl>
                                            <FormLabel className="font-normal">
                                                {item.label}
                                            </FormLabel>
                                        </FormItem>
                                    );
                                }}
                            />
                        ))}
                    </div>
                    <FormMessage />
                </FormItem>
            )}
        />
    </div>
  );
};

export default FormFolgas;