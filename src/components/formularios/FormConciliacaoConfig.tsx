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

const formSchema = z.object({
  nome_configuracao: z.string().min(1, 'O nome é obrigatório.'),
  coluna_data: z.string().min(1, 'O nome da coluna de data é obrigatória.'),
  coluna_descricao: z.string().min(1, 'O nome da coluna de descrição é obrigatória.'),
  coluna_valor: z.string().min(1, 'O nome da coluna de valor é obrigatória.'),
  coluna_identificacao: z.string().optional(), // NOVO CAMPO
  coluna_tipo_transacao: z.string().optional(),
  valor_credito: z.string().optional(),
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
      coluna_descricao: configInicial?.mapeamento?.descricao || 'Transação',
      coluna_valor: configInicial?.mapeamento?.valor || 'Valor',
      coluna_identificacao: configInicial?.mapeamento?.identificacao || 'Identificação', // Valor inicial
      coluna_tipo_transacao: configInicial?.coluna_tipo_transacao || '',
      valor_credito: configInicial?.valor_credito || '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    const ownerId = proprietarioId;
    if (!ownerId) {
      showError('Proprietário da configuração não pôde ser determinado.');
      return;
    }

    const colunaIdentificacao = (values.coluna_identificacao || '').trim();
    const colunaTipoTransacao = (values.coluna_tipo_transacao || '').trim();
    const valorCredito = (values.valor_credito || '').trim();

    const dataToSave = {
      proprietario_id: ownerId,
      id_saldo_contas: idSaldoContas,
      nome_configuracao: values.nome_configuracao,
      mapeamento: {
        data: values.coluna_data,
        descricao: values.coluna_descricao,
        valor: values.coluna_valor,
        identificacao: colunaIdentificacao || null, // Salva o novo campo
      },
      coluna_tipo_transacao: colunaTipoTransacao || null,
      valor_credito: valorCredito || null,
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
        <h4 className="font-semibold pt-2 border-t">Mapeamento de Colunas (CSV)</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField control={form.control} name="coluna_data" render={({ field }) => (
              <FormItem><FormLabel>Coluna de Data</FormLabel><FormControl><Input placeholder="Data" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="coluna_descricao" render={({ field }) => (
              <FormItem><FormLabel>Coluna de Descrição</FormLabel><FormControl><Input placeholder="Transação" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="coluna_valor" render={({ field }) => (
              <FormItem><FormLabel>Coluna de Valor</FormLabel><FormControl><Input placeholder="Valor" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
        </div>
        
        <FormField control={form.control} name="coluna_identificacao" render={({ field }) => (
            <FormItem>
                <FormLabel>Coluna de Identificação (Opcional)</FormLabel>
                <FormControl><Input placeholder="Identificação" {...field} /></FormControl>
                <FormMessage />
            </FormItem>
        )} />
        
        <h4 className="font-semibold pt-2 border-t">Regra de Crédito/Débito (Opcional)</h4>
        <p className="text-xs text-muted-foreground">Use se a coluna de valor não tiver sinal (+/-). Se o valor já for negativo para saídas, deixe em branco.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="coluna_tipo_transacao" render={({ field }) => (
              <FormItem><FormLabel>Coluna de Tipo</FormLabel><FormControl><Input placeholder="Tipo Transação" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="valor_credito" render={({ field }) => (
              <FormItem><FormLabel>Valor para Crédito</FormLabel><FormControl><Input placeholder="CRÉDITO" {...field} /></FormControl><FormMessage /></FormItem>
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
