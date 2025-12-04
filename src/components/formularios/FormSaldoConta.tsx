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

// Removendo 'Receita' e 'Despesa' do enum
const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  tipo_saldo: z.enum(['Credito', 'Debito'], { // APENAS CRÉDITO E DÉBITO
    required_error: 'O tipo de saldo é obrigatório.',
  }),
  conta_contabil_id: z.string().uuid('Selecione uma conta contábil válida.').nullable(),
  // Removendo saldo_inicial do esquema de validação, mas mantendo-o no defaultValues para o payload
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
  
  console.log('[FormSaldoConta] DEBUG:', { role, 'usuario?.id': usuario?.id, 'perfil?.id': (perfil as any)?.id, empresaId });

  const fetchContasContabeis = useCallback(async () => {
    if (!empresaId) return;
    setLoadingContas(true);
    
    // Busca contas analíticas que são marcadas como Caixa/Banco OU Patrimonial
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica, is_conta_caixa_banco, is_conta_patrimonial') // RENOMEADO
        .eq('proprietario_id', empresaId)
        .eq('Analitica', 'Sim') // Apenas contas analíticas
        .or('is_conta_caixa_banco.eq.true,is_conta_patrimonial.eq.true') // FILTRO PRINCIPAL
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
      tipo_saldo: contaInicial?.tipo_saldo === 'Receita' || contaInicial?.tipo_saldo === 'Despesa' ? 'Debito' : contaInicial?.tipo_saldo || 'Credito', // Fallback para Debito/Credito
      conta_contabil_id: contaInicial?.conta_contabil_id || null,
      // Removido saldo_inicial do defaultValues do RHF, mas o valor será forçado no payload
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
      // CRÍTICO: Força saldo_inicial para 0 na criação, ou mantém o valor existente na edição
      saldo_inicial: isEditing ? contaInicial?.saldo_inicial : 0, 
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
                  {/* REMOVIDO: Receita e Despesa */}
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
                        <SelectItem value="disabled" disabled>Nenhuma conta de saldo/patrimonial marcada no Plano de Contas.</SelectItem>
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
              {contasContabeis.length === 0 && !loadingContas && (
                  <p className="text-sm text-red-500">
                      Nenhuma conta contábil marcada como "Conta de Saldo" ou "Conta Patrimonial". Marque as contas em <a href="/plano-contas" className="underline">Plano de Contas</a>.
                  </p>
              )}
            </FormItem>
          )}
        />
        
        {/* Saldo Inicial removido do JSX */}
        
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Conta
        </Button>
      </form>
    </Form>
  );
};

export default FormSaldoConta;