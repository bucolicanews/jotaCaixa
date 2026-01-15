import React from 'react';
import { Control } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

interface NumberFieldProps {
  control: Control<any>;
  name: string;
  label: string;
  placeholder: string;
  disabled?: boolean;
}

const NumberField: React.FC<NumberFieldProps> = ({ control, name, label, placeholder, disabled = false }) => (
  <FormField
    control={control}
    name={name}
    render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl>
          <Input 
            type="number" 
            placeholder={placeholder} 
            {...field} 
            value={field.value === undefined || field.value === null ? '' : String(field.value)}
            onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            disabled={disabled} 
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
);

export default NumberField;