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
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { ConfiguracaoConciliacao } from '@/types/conciliacao';
import { Separator } from './ui/separator';

// Removido CAMPOS_INTERNOS

const formSchema = z.object({
  nome_banco: z.string().min(1, 'O nome do banco é obrigatório.'),
  coluna_data: z.string().min(1, 'Mapeamento de Data é obrigatório.'),
  coluna_descricao: z.string().min(1, 'Mapeamento de Descrição é obrigatório.'),
  coluna_identificacao: z.string().min(1, 'Mapeamento de Identificação é obrigatório.'),
  coluna_valor: z.string().min(1, 'Mapeamento de Valor é obrigatório.'),
  
  coluna_tipo_transacao: z.string().optional().or(z.literal('')),
  valor_credito: z.string().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

interface FormConfiguracaoBancoProps {
  configInicial?: ConfiguracaoConciliacao | null;
  onSaveComplete: () => void;
}

const FormConfiguracaoBanco: React.FC<FormConfiguracaoBancoProps> = ({ configInicial, onSaveComplete }) => {
  const { perfil, role, usuario } = useSessao();
  const isEditing = !!configInicial;

  const getEmpresaId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
    return null;
  };
  
  const empresaId = getEmpresaId();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome_banco: configInicial?.nome_configuracao || '',
      coluna_data: configInicial?.mapeamento['Data'] || '',
      coluna_descricao: configInicial?.mapeamento['Descrição'] || '',
      coluna_identificacao: configInicial?.mapeamento['Identificação'] || '',
      coluna_valor: configInicial?.mapeamento['Valor'] || '',
      coluna_tipo_transacao: configInicial?.coluna_tipo_transacao || '',
      valor_credito: configInicial?.valor_credito || '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (!empresaId) {
      showError('ID da empresa não encontrado. Não é possível salvar.');
      return;
    }
    
    const mapeamentoFinal: Record<string, string> = {
        'Data': values.coluna_data,
        'Descrição': values.coluna_descricao,
        'Identificação': values.coluna_identificacao,
        'Valor': values.coluna_valor,
    };

    const dataToSave = {
      empresa_id: empresaId,
      nome_banco: values.nome_banco,
      mapeamento: mapeamentoFinal,
      coluna_tipo_transacao: values.coluna_tipo_transacao || null,
      valor_credito: values.valor_credito || null,
    };

    let error = null;

    if (isEditing) {
      const result = await supabase
        .from('configuracao_conciliacao')
        .update(dataToSave)
        .eq('id', configInicial.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('configuracao_conciliacao')
        .insert(dataToSave);
      error = result.error;
    }

    if (error) {
      showError(`Falha ao salvar configuração: ${error.message}`);
    } else {
      showSuccess(`Configuração do banco ${values.nome_banco} salva com sucesso!`);
      onSaveComplete();
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="nome_banco"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome do Banco</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Cora, Banco do Brasil, Itaú" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Separator />
        <h4 className="font-semibold">Mapeamento de Colunas (Extrato)</h4>
        <p className="text-sm text-muted-foreground">
            Informe o nome exato da coluna no seu arquivo de extrato que corresponde ao campo interno.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="coluna_data" render={({ field }) => (<FormItem><FormLabel>Data da Movimentação</FormLabel><FormControl><Input placeholder="Ex: Data" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="coluna_valor" render={({ field }) => (<FormItem><FormLabel>Valor</FormLabel><FormControl><Input placeholder="Ex: Valor" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="coluna_descricao" render={({ field }) => (<FormItem><FormLabel>Descrição/Transação</FormLabel><FormControl><Input placeholder="Ex: Transação" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="coluna_identificacao" render={({ field }) => (<FormItem><FormLabel>Identificação/Favorecido</FormLabel><FormControl><Input placeholder="Ex: Identificação" {...field} /></FormControl><FormMessage /></FormItem>)} />
        </div>
        
        <Separator />
        <h4 className="font-semibold">Configuração de Tipo (Entrada/Saída)</h4>
        <p className="text-sm text-muted-foreground">
            Se o valor no extrato não for negativo para saídas, use uma coluna de tipo para determinar se é Crédito ou Débito.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="coluna_tipo_transacao" render={({ field }) => (<FormItem><FormLabel>Nome da Coluna de Tipo (Opcional)</FormLabel><FormControl><Input placeholder="Ex: Tipo Transação" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="valor_credito" render={({ field }) => (<FormItem><FormLabel>Valor na Coluna que Indica CRÉDITO</FormLabel><FormControl><Input placeholder="Ex: CRÉDITO" {...field} /></FormControl><FormMessage /></FormItem>)} />
        </div>

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Configuração
        </Button>
      </form>
    </Form>
  );
};

export default FormConfiguracaoBanco;