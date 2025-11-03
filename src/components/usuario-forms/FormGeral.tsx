import React from 'react';
import { Control } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Permissao } from '@/config/permissoes';
// import { Loader2 } from 'lucide-react'; // Removed Loader2

interface FormGeralProps {
  control: Control<any>;
  isEditing: boolean;
  isUserScope: boolean;
  isSubmitting: boolean;
  criadorRole: string;
  permissoesVisiveis: Permissao[];
  handleSelectAll: (select: boolean) => void;
}

const FormGeral: React.FC<FormGeralProps> = ({
  control,
  isEditing,
  isUserScope,
  isSubmitting,
  criadorRole,
  permissoesVisiveis,
  handleSelectAll,
}) => {
  
  const renderNumberField = (fieldName: string, label: string, placeholder: string, disabled: boolean = false) => (
    <FormField
      control={control}
      name={fieldName}
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
  
  const nomeLabel = isUserScope ? 'Nome Completo do Usuário' : 'Nome da Empresa';

  return (
    <div className="space-y-4">
      <FormField control={control} name="nome" render={({ field }) => (
        <FormItem><FormLabel>{nomeLabel}</FormLabel><FormControl><Input placeholder="Nome completo" {...field} disabled={isEditing && !isUserScope} /></FormControl><FormMessage /></FormItem>
      )} />
      <FormField control={control} name="email" render={({ field }) => (
        <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="email@exemplo.com" {...field} disabled={isEditing} /></FormControl><FormMessage /></FormItem>
      )} />
      {isEditing && <FormField control={control} name="senha" render={({ field }) => (
        <FormItem><FormLabel>Alterar Senha (Opcional)</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>
      )} />}
      
      {isUserScope && (
        <>
          <h4 className="font-semibold mt-6 border-t pt-4">Remuneração e Jornada</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {renderNumberField('salario', 'Salário Mensal (R$)', '3000.00', isSubmitting)}
            {renderNumberField('horas_semanais', 'Horas Semanais', '44', isSubmitting)}
            {renderNumberField('horas_mensais', 'Horas Mensais', '220', isSubmitting)}
          </div>
        </>
      )}
      
      {/* Permissões (Visível para Admin/Cliente gerenciando Usuário, ou Admin gerenciando Cliente) */}
      {(isUserScope || criadorRole === 'Admin') && (
        <div className="space-y-2 pt-4 border-t">
          <div className="flex justify-between items-center mb-1">
            <FormLabel>Permissões de Acesso</FormLabel>
            <div className="space-x-2">
              <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(true)} className="p-0 h-auto" disabled={isSubmitting}>Selecionar Todos</Button>
              <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(false)} className="p-0 h-auto text-destructive" disabled={isSubmitting}>Desmarcar Todos</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
            {permissoesVisiveis.map((p: Permissao) => (
              <FormField key={p.key} control={control} name={`permissoes.${p.key}`} render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting} /></FormControl>
                  <FormLabel className="font-normal">{p.label}</FormLabel>
                </FormItem>
              )} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FormGeral;