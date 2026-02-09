import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ConfiguracaoConciliacao } from '@/types/conciliacao';
import { Separator } from '../ui/separator';

const formSchema = z.object({
  nome_configuracao: z.string().min(1, 'O nome é obrigatório.'),
  coluna_data: z.string().min(1, 'O nome da coluna de data é obrigatória.'),
  coluna_descricao: z.string().min(1, 'O nome da coluna de descrição é obrigatória.'),
  coluna_identificacao: z.string().optional(),
  
  // Modo 1: Coluna única de valor
  coluna_valor: z.string().optional(),
  coluna_tipo_transacao: z.string().optional(),
  valor_credito: z.string().optional(),

  // Modo 2: Colunas separadas
  coluna_credito: z.string().optional(),
  coluna_debito: z.string().optional(),
}).superRefine((data, ctx) => {
    const hasValorUnico = !!data.coluna_valor;
    const hasCreditoDebito = !!data.coluna_credito && !!data.coluna_debito;

    if (!hasValorUnico && !hasCreditoDebito) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Preencha a "Coluna de Valor" ou ambas "Coluna de Crédito" e "Coluna de Débito".',
            path: ['coluna_valor'],
        });
    }
    if (hasValorUnico && (!!data.coluna_credito || !!data.coluna_debito)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Use apenas a "Coluna de Valor" OU as colunas de Crédito/Débito, não ambos.',
            path: ['coluna_valor'],
        });
    }
});

type FormValues = z.infer<typeof formSchema>;

interface FormConciliacaoConfigProps {
  configInicial?: ConfiguracaoConciliacao | null;
  idSaldoContas: string;
  proprietarioId: string | undefined | null;
  onSaveComplete: () => void;
}

const FormConciliacaoConfig: React.FC<FormConciliacaoConfigProps> = ({ configInicial, idSaldoContas, proprietarioId, onSaveComplete }) => {
  const isEditing = !!configInicial;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome_configuracao: configInicial?.nome_configuracao || '',
      coluna_data: configInicial?.mapeamento?.data || 'Data',
      coluna_descricao: configInicial?.mapeamento?.descricao || 'Descrição',
      coluna_valor: configInicial?.mapeamento?.valor || '',
      coluna_identificacao: configInicial?.mapeamento?.identificacao || '',
      coluna_tipo_transacao: configInicial?.coluna_tipo_transacao || '',
      valor_credito: configInicial?.valor_credito || '',
      coluna_credito: (configInicial?.mapeamento as any)?.credito || '',
      coluna_debito: (configInicial?.mapeamento as any)?.debito || '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    const ownerId = proprietarioId;
    if (!ownerId) {
      showError('Proprietário da configuração não pôde ser determinado.');
      return;
    }

    const dataToSave = {
      proprietario_id: ownerId,
      id_saldo_contas: idSaldoContas,
      nome_configuracao: values.nome_configuracao,
      mapeamento: {
        data: values.coluna_data,
        descricao: values.coluna_descricao,
        valor: values.coluna_valor || null,
        identificacao: values.coluna_identificacao || null,
        credito: values.coluna_credito || null,
        debito: values.coluna_debito || null,
      },
      coluna_tipo_transacao: values.coluna_tipo_transacao || null,
      valor_credito: values.valor_credito || null,
    };

    let error = null;

    if (isEditing) {
      const result = await supabase.from('configuracao_conciliacao').update(dataToSave).eq('id', configInicial.id);
      error = result.error;
    } else {
      const result = await supabase.from('configuracao_conciliacao').insert(dataToSave);
      error = result.error;
    }

    if (error) {
      showError(`Falha ao salvar configuração: ${error.message}`);
    } else {
      showSuccess('Configuração salva com sucesso!');
      onSaveComplete();
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="nome_configuracao" render={({ field }) => (
          <FormItem><FormLabel>Nome da Configuração</FormLabel><FormControl><Input placeholder="Ex: Extrato Banco Cora" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        
        <h4 className="font-semibold pt-2 border-t">Mapeamento de Colunas Essenciais (CSV)</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField control={form.control} name="coluna_data" render={({ field }) => (
              <FormItem><FormLabel>Coluna de Data</FormLabel><FormControl><Input placeholder="Data" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="coluna_descricao" render={({ field }) => (
              <FormItem><FormLabel>Coluna de Descrição</FormLabel><FormControl><Input placeholder="Transação" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="coluna_identificacao" render={({ field }) => (
                <FormItem><FormLabel>Coluna de Identificação</FormLabel><FormControl><Input placeholder="Documento" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
        </div>
        
        <Separator />
        
        <h4 className="font-semibold">Modo 1: Coluna de Valor Único</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField control={form.control} name="coluna_valor" render={({ field }) => (
              <FormItem><FormLabel>Coluna de Valor</FormLabel><FormControl><Input placeholder="Valor" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="coluna_tipo_transacao" render={({ field }) => (
              <FormItem><FormLabel>Coluna de Tipo (Opcional)</FormLabel><FormControl><Input placeholder="Tipo Transação" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="valor_credito" render={({ field }) => (
              <FormItem><FormLabel>Valor para Crédito (Opcional)</FormLabel><FormControl><Input placeholder="CRÉDITO" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
        </div>
        
        <Separator />
        
        <h4 className="font-semibold">Modo 2: Colunas de Crédito e Débito Separadas</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="coluna_credito" render={({ field }) => (
              <FormItem><FormLabel>Coluna de Crédito</FormLabel><FormControl><Input placeholder="Crédito (R$)" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="coluna_debito" render={({ field }) => (
              <FormItem><FormLabel>Coluna de Débito</FormLabel><FormControl><Input placeholder="Débito (R$)" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
        </div>

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Configuração
        </Button>
      </form>
    </Form>
  );
};

export default FormConciliacaoConfig;