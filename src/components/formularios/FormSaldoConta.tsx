import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { SaldoConta } from '@/types/saldo-conta';
import { PlanoContas } from '@/types/plano-contas';

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  tipo_saldo: z.enum(['Credito', 'Debito', 'Receita', 'Despesa'], {
    required_error: 'O tipo de saldo é obrigatório.',
  }),
  conta_contabil_id: z.string().uuid('Selecione uma conta contábil válida.').nullable(),
  saldo_inicial: z.coerce.number().optional().default(0),
});

type FormValues = z.infer<typeof formSchema>;

interface FormSaldoContaProps {
  contaInicial?: SaldoConta | null;
  onSaveComplete: () => void;
}

const FormSaldoConta: React.FC<FormSaldoContaProps> = ({ contaInicial, onSaveComplete }) => {
  const { usuario, perfil, role } = useSessao();
  const isEditing = !!contaInicial;
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
  const [loadingContas, setLoadingContas] = useState(true);

  const getEmpresaId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
    return null;
  };
  
  const empresaId = getEmpresaId();

  const fetchContasContabeis = useCallback(async () => {
    if (!empresaId) return;
    setLoadingContas(true);
    
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica, is_conta_saldo') // Incluindo is_conta_saldo
        .eq('proprietario_id', empresaId)
        .eq('Analitica', 'Sim') // Apenas contas analíticas
        .eq('is_conta_saldo', true) // FILTRO PRINCIPAL: Apenas contas marcadas como saldo
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar Plano de Contas: ' + error.message);
        setContasContabeis([]);
    } else {
        setContasContabeis(data as PlanoContas[]);
    }
    setLoadingContas(false);
  }, [empresaId]);
  
  useEffect(() => {
      fetchContasContabeis();
  }, [fetchContasContabeis]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: contaInicial?.nome || '',
      tipo_saldo: contaInicial?.tipo_saldo || 'Credito',
      conta_contabil_id: contaInicial?.conta_contabil_id || null,
      saldo_inicial: contaInicial?.saldo_inicial || 0,
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (!empresaId) {
      showError('ID da empresa não encontrado. Não é possível salvar.');
      return;
    }
    
    const dataToSave = {
      proprietario_id: empresaId,
      nome: values.nome,
      tipo_saldo: values.tipo_saldo,
      saldo_inicial: values.saldo_inicial,
      conta_contabil_id: values.conta_contabil_id,
    };

    let error = null;

    if (isEditing) {
      // Atualizar
      const result = await supabase
        .from('saldo_contas')
        .update(dataToSave)
        .eq('id', contaInicial.id);
      error = result.error;
    } else {
      // Inserir
      const result = await supabase
        .from('saldo_contas')
        .insert(dataToSave);
      error = result.error;
    }

    if (error) {
      showError(`Falha ao salvar conta: ${error.message}`);
    } else {
      showSuccess(`Conta salva com sucesso!`);
      onSaveComplete();
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="nome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome da Conta/Caixa</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Caixa Matriz, Conta Corrente BB" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="tipo_saldo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de Saldo (Natureza)</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Debito">Débito (Ativo)</SelectItem>
                  <SelectItem value="Credito">Crédito (Passivo)</SelectItem>
                  <SelectItem value="Receita">Receita</SelectItem>
                  <SelectItem value="Despesa">Despesa</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="conta_contabil_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conta Contábil (Plano de Contas)</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value || undefined} disabled={loadingContas}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingContas ? "Carregando Contas Contábeis..." : "Selecione a conta analítica"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                    {contasContabeis.length === 0 ? (
                        <SelectItem value="disabled" disabled>Nenhuma conta de saldo marcada no Plano de Contas.</SelectItem>
                    ) : (
                        contasContabeis.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.Conta} - {c.Descricao}
                            </SelectItem>
                        ))
                    )}
                </SelectContent>
              </Select>
              <FormMessage />
              {contasContabeis.length === 0 && (
                  <p className="text-sm text-red-500">
                      Nenhuma conta contábil marcada como "Conta de Saldo". Marque as contas em <a href="/plano-contas" className="underline">Plano de Contas</a>.
                  </p>
              )}
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="saldo_inicial"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Saldo Inicial (R$)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="0.00" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Conta
        </Button>
      </form>
    </Form>
  );
};

export default FormSaldoConta;