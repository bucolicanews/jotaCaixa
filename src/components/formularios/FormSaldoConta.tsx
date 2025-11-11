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

type FormScope = 'bancos' | 'patrimonial';

interface FormSaldoContaProps {
  contaInicial?: SaldoConta | null;
  onSaveComplete: () => void;
  scope: FormScope; // NOVO PROP
}

const FormSaldoConta: React.FC<FormSaldoContaProps> = ({ contaInicial, onSaveComplete, scope }) => {
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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: contaInicial?.nome || '',
      tipo_saldo: contaInicial?.tipo_saldo || 'Debito', // Alterado o padrão para Debito
      conta_contabil_id: contaInicial?.conta_contabil_id || null,
      saldo_inicial: contaInicial?.saldo_inicial || 0,
    },
  });
  
  const tipoSaldoWatch = form.watch('tipo_saldo');

  const fetchContasContabeis = useCallback(async (tipo: FormValues['tipo_saldo'], currentScope: FormScope) => {
    if (!empresaId) return;
    setLoadingContas(true);
    
    let filterCondition: string;
    let requiredFlag: 'is_conta_caixa_banco' | 'is_conta_patrimonial' | 'is_conta_resultado';
    
    // 1. Determinar a flag principal de filtro com base no SCOPE
    if (currentScope === 'bancos') {
        requiredFlag = 'is_conta_caixa_banco';
    } else if (currentScope === 'patrimonial') {
        requiredFlag = 'is_conta_patrimonial';
    } else {
        setContasContabeis([]);
        setLoadingContas(false);
        return;
    }
    
    // 2. Determinar a condição de filtro de natureza (Ativo/Passivo/Resultado)
    if (tipo === 'Debito' || tipo === 'Credito') {
        // Contas de Ativo/Passivo (1.x.x e 2.x.x)
        filterCondition = 'Conta.like.1.%,Conta.like.2.%';
    } else if (tipo === 'Receita' || tipo === 'Despesa') {
        // Contas de Resultado (3.x.x, 4.x.x, 5.x.x)
        filterCondition = 'is_conta_resultado.eq.true';
    } else {
        setContasContabeis([]);
        setLoadingContas(false);
        return;
    }
    
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica, is_conta_caixa_banco, is_conta_patrimonial')
        .eq('proprietario_id', empresaId)
        .eq('Analitica', 'Sim') // Apenas contas analíticas
        .eq(requiredFlag, true) // Aplica o filtro principal (Caixa/Banco OU Patrimonial)
        .or(filterCondition) // Aplica o filtro de natureza (para garantir que a conta seja do tipo certo)
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar Plano de Contas: ' + error.message);
        setContasContabeis([]);
    } else {
        // Filtro adicional para garantir que a conta seja do grupo correto (1.x.x, 2.x.x, 3.x.x, etc.)
        let filteredData = data as PlanoContas[];
        
        if (tipo === 'Debito' || tipo === 'Credito') {
            // Filtra para garantir que a conta comece com 1 ou 2 (Ativo/Passivo)
            filteredData = filteredData.filter(c => c.Conta.startsWith('1') || c.Conta.startsWith('2'));
        } else if (tipo === 'Receita') {
            // Filtra para garantir que a conta comece com 3 (Receita)
            filteredData = filteredData.filter(c => c.Conta.startsWith('3'));
        } else if (tipo === 'Despesa') {
            // Filtra para garantir que a conta comece com 4 ou 5 (Custo/Despesa)
            filteredData = filteredData.filter(c => c.Conta.startsWith('4') || c.Conta.startsWith('5'));
        }
        
        setContasContabeis(filteredData);
    }
    setLoadingContas(false);
  }, [empresaId]);
  
  useEffect(() => {
      // Recarrega as contas contábeis sempre que o tipo de saldo ou o escopo mudar
      fetchContasContabeis(tipoSaldoWatch, scope);
      // Limpa a seleção anterior se o tipo mudar
      form.setValue('conta_contabil_id', null);
  }, [tipoSaldoWatch, scope, fetchContasContabeis, form]);

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
                  <SelectItem value="Receita">Receita (DRE)</SelectItem>
                  <SelectItem value="Despesa">Despesa (DRE)</SelectItem>
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
              <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingContas}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingContas ? "Carregando Contas Contábeis..." : "Selecione a conta analítica"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                    {contasContabeis.length === 0 ? (
                        <SelectItem value="disabled" disabled>Nenhuma conta analítica marcada para esta natureza.</SelectItem>
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
                      Nenhuma conta contábil analítica marcada como "{scope === 'bancos' ? 'Caixa/Banco' : 'Patrimonial'}" para esta natureza. Marque as contas em <a href="/plano-contas" className="underline">Plano de Contas</a>.
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