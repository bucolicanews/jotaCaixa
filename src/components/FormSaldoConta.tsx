import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { NATUREZA_PREFIXO_MAP } from '@/config/contas-mapa';

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  tipo_saldo: z.enum(['Credito', 'Debito'], {
    required_error: 'O tipo de saldo é obrigatório.',
  }),
  natureza_contabil: z.enum(['Ativo', 'Passivo', 'Receita', 'Despesa'], {
    required_error: 'A natureza contábil é obrigatória.',
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
  const [todasContasContabeis, setTodasContasContabeis] = useState<PlanoContas[]>([]);
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
    
    // Busca TODAS as contas analíticas que podem ser contas de saldo
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica, is_conta_saldo')
        .eq('proprietario_id', empresaId)
        .eq('Analitica', 'Sim')
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar Plano de Contas: ' + error.message);
        setTodasContasContabeis([]);
    } else {
        setTodasContasContabeis(data as PlanoContas[]);
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
      tipo_saldo: contaInicial?.tipo_saldo || 'Debito',
      natureza_contabil: contaInicial?.natureza_contabil || 'Ativo',
      conta_contabil_id: contaInicial?.conta_contabil_id || null,
      saldo_inicial: contaInicial?.saldo_inicial || 0,
    },
  });
  
  const naturezaSelecionada = form.watch('natureza_contabil');

  // Filtra as contas contábeis com base na natureza selecionada
  const contasFiltradas = useMemo(() => {
    const prefixo = NATUREZA_PREFIXO_MAP[naturezaSelecionada];
    
    // Se a natureza for Ativo ou Passivo, filtra apenas as contas marcadas como is_conta_saldo
    if (naturezaSelecionada === 'Ativo' || naturezaSelecionada === 'Passivo') {
        return todasContasContabeis
            .filter(c => c.is_conta_saldo === true && c.Conta.startsWith(prefixo))
            .sort((a, b) => a.Conta.localeCompare(b.Conta));
    }
    
    // Para Receita e Despesa, filtra todas as contas analíticas com o prefixo correspondente
    return todasContasContabeis
        .filter(c => c.Conta.startsWith(prefixo))
        .sort((a, b) => a.Conta.localeCompare(b.Conta));
        
  }, [naturezaSelecionada, todasContasContabeis]);
  
  // Efeito para resetar a conta contábil se a natureza mudar e a conta anterior não for mais válida
  useEffect(() => {
      if (contaInicial && contaInicial.natureza_contabil !== naturezaSelecionada) {
          form.setValue('conta_contabil_id', null);
      } else if (!contaInicial && contasFiltradas.length > 0) {
          // Se for nova conta e houver filtros, define a primeira como padrão
          form.setValue('conta_contabil_id', contasFiltradas[0].id);
      }
  }, [naturezaSelecionada, contasFiltradas, contaInicial, form]);


  const onSubmit = async (values: FormValues) => {
    if (!empresaId) {
      showError('ID da empresa não encontrado. Não é possível salvar.');
      return;
    }
    
    // Validação final: Garante que a conta contábil foi selecionada
    if (!values.conta_contabil_id) {
        showError('Selecione uma Conta Contábil válida para a natureza escolhida.');
        return;
    }
    
    const dataToSave = {
      empresa_id: empresaId,
      nome: values.nome,
      tipo_saldo: values.tipo_saldo,
      natureza_contabil: values.natureza_contabil,
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
        
        <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="natureza_contabil"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Natureza Contábil (DRE/BP)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a natureza" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Ativo">Ativo</SelectItem>
                      <SelectItem value="Passivo">Passivo</SelectItem>
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
              name="tipo_saldo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Saldo (Débito/Crédito)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Debito">Débito</SelectItem>
                      <SelectItem value="Credito">Crédito</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
        </div>
        
        <FormField
          control={form.control}
          name="conta_contabil_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conta Contábil (Plano de Contas)</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                value={field.value || undefined}
                disabled={loadingContas || contasFiltradas.length === 0}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingContas ? "Carregando Contas Contábeis..." : "Selecione a conta analítica"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                    {contasFiltradas.length === 0 ? (
                        <SelectItem value="disabled" disabled>Nenhuma conta analítica encontrada para {naturezaSelecionada}.</SelectItem>
                    ) : (
                        contasFiltradas.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.Conta} - {c.Descricao}
                            </SelectItem>
                        ))
                    )}
                </SelectContent>
              </Select>
              <FormMessage />
              {naturezaSelecionada && contasFiltradas.length === 0 && (
                  <p className="text-sm text-red-500">
                      Verifique se existem contas analíticas com o prefixo {NATUREZA_PREFIXO_MAP[naturezaSelecionada]} no seu Plano de Contas.
                      { (naturezaSelecionada === 'Ativo' || naturezaSelecionada === 'Passivo') && 
                        ' (Apenas contas marcadas como "Conta de Saldo" são exibidas para Ativo/Passivo).'
                      }
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
        
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || !form.watch('conta_contabil_id')}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Conta
        </Button>
      </form>
    </Form>
  );
};

export default FormSaldoConta;