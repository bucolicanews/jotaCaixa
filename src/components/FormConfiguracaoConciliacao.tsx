import React, { useState, useEffect, useCallback } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { SaldoContaDetalhada } from '@/types/saldo-conta';

const formSchema = z.object({
  nome_configuracao: z.string().min(1, 'O nome da configuração é obrigatório.'),
  id_saldo_contas: z.string().min(1, 'A conta de saldo é obrigatória.'),
  coluna_data: z.string().min(1, 'Mapeamento de Data é obrigatório.'),
  coluna_descricao: z.string().min(1, 'Mapeamento de Descrição é obrigatório.'),
  coluna_identificacao: z.string().min(1, 'Mapeamento de Identificação é obrigatório.'),
  coluna_valor: z.string().min(1, 'Mapeamento de Valor é obrigatório.'),
  
  coluna_tipo_transacao: z.string().optional().or(z.literal('')),
  valor_credito: z.string().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

interface FormConfiguracaoConciliacaoProps {
  configInicial?: ConfiguracaoConciliacao | null;
  onSaveComplete: () => void;
}

const FormConfiguracaoConciliacao: React.FC<FormConfiguracaoConciliacaoProps> = ({ configInicial, onSaveComplete }) => {
  const { perfil, role, usuario } = useSessao();
  const [contasSaldo, setContasSaldo] = useState<SaldoContaDetalhada[]>([]);
  const [carregandoContas, setCarregandoContas] = useState(true);
  const isEditing = !!configInicial;

  const getProprietarioId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
    return null;
  };
  
  const proprietarioId = getProprietarioId();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome_configuracao: configInicial?.nome_configuracao || '',
      id_saldo_contas: configInicial?.id_saldo_contas || '',
      coluna_data: configInicial?.mapeamento['Data'] || '',
      coluna_descricao: configInicial?.mapeamento['Descrição'] || '',
      coluna_identificacao: configInicial?.mapeamento['Identificação'] || '',
      coluna_valor: configInicial?.mapeamento['Valor'] || '',
      coluna_tipo_transacao: configInicial?.coluna_tipo_transacao || '',
      valor_credito: configInicial?.valor_credito || '',
    },
  });
  
  const buscarContasSaldo = useCallback(async () => {
    if (!proprietarioId) return;
    setCarregandoContas(true);
    
    // Buscar apenas contas que são contas de saldo (Bancos/Caixas)
    const { data, error } = await supabase
        .from('saldo_contas')
        .select('*, plano_contas ( is_conta_saldo )')
        .eq('proprietario_id', proprietarioId)
        .order('nome');
        
    if (error) {
        showError('Erro ao carregar contas de saldo: ' + error.message);
    } else {
        const filteredContas = (data as any[]).filter(c => c.plano_contas?.is_conta_saldo === true);
        setContasSaldo(filteredContas as SaldoContaDetalhada[]);
    }
    setCarregandoContas(false);
  }, [proprietarioId]);

  useEffect(() => {
    buscarContasSaldo();
  }, [buscarContasSaldo]);


  const onSubmit = async (values: FormValues) => {
    if (!proprietarioId) {
      showError('ID do proprietário não encontrado. Não é possível salvar.');
      return;
    }
    
    const mapeamentoFinal: Record<string, string> = {
        'Data': values.coluna_data,
        'Descrição': values.coluna_descricao,
        'Identificação': values.coluna_identificacao,
        'Valor': values.coluna_valor,
    };

    const dataToSave = {
      proprietario_id: proprietarioId,
      id_saldo_contas: values.id_saldo_contas,
      nome_configuracao: values.nome_configuracao,
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
      // O erro 23505 é a violação da restrição UNIQUE (id_saldo_contas)
      if (error.code === '23505') {
          showError('Falha ao salvar: Já existe uma configuração de conciliação cadastrada para esta Conta de Saldo.');
      } else {
          showError(`Falha ao salvar configuração: ${error.message}`);
      }
    } else {
      showSuccess(`Configuração ${values.nome_configuracao} salva com sucesso!`);
      onSaveComplete();
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="nome_configuracao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome da Configuração (Ex: Cora - Extrato Mensal)</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Cora, Banco do Brasil, Itaú" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="id_saldo_contas"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conta de Saldo Interna (Bancos/Caixas)</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isEditing || carregandoContas}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a conta de saldo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {contasSaldo.map(conta => (
                    <SelectItem key={conta.id} value={conta.id}>
                      {conta.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
              {isEditing && <p className="text-xs text-muted-foreground">A conta de saldo não pode ser alterada após a criação.</p>}
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

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || carregandoContas}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Configuração
        </Button>
      </form>
    </Form>
  );
};

export default FormConfiguracaoConciliacao;