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
import { PlanoContas } from '@/types/plano-contas';
import { Checkbox } from '../ui/checkbox';
import { cn } from '@/lib/utils';
import { useMapeamentoContabil } from '@/hooks/use-mapeamento-contabil'; // NOVO IMPORT

// Função de validação da máscara
const validateMask = (code: string, mask: string): boolean => {
    if (!mask) return true; // Se não houver máscara, a validação passa
    
    const codeParts = code.split('.');
    const maskParts = mask.split('.');
    
    if (codeParts.length !== maskParts.length) {
        return false;
    }
    
    for (let i = 0; i < codeParts.length; i++) {
        const codeSegment = codeParts[i];
        const maskSegment = maskParts[i];
        
        // Verifica se o segmento do código tem o mesmo comprimento do segmento da máscara
        if (codeSegment.length !== maskSegment.length) {
            return false;
        }
        
        // Verifica se o segmento contém apenas dígitos (já que a máscara só tem '0')
        if (!/^\d+$/.test(codeSegment)) {
            return false;
        }
    }
    
    return true;
};

const formSchema = z.object({
  Conta: z.string().min(1, 'O código é obrigatório.'),
  codigo_reduzido: z.string().optional().or(z.literal('')),
  Descricao: z.string().min(1, 'A descrição é obrigatória.'),
  Analitica: z.enum(['Sim', 'Não'], {
    required_error: 'O tipo é obrigatório.',
  }),
  is_conta_caixa_banco: z.boolean().optional(),
  is_conta_patrimonial: z.boolean().optional(),
  is_conta_resultado: z.boolean().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormPlanoContasProps {
  proprietarioId: string;
  contaInicial?: Partial<PlanoContas> | null; 
  onSaveComplete: () => void;
}

const FormPlanoContas: React.FC<FormPlanoContasProps> = ({ proprietarioId, contaInicial, onSaveComplete }) => {
  
  const isEditing = !!contaInicial && !!contaInicial.id;
  const [mascara, setMascara] = useState<string | null>(null);
  const [loadingMascara, setLoadingMascara] = useState(true);
  const { mapeamento, loading: loadingMapeamento } = useMapeamentoContabil(); // USANDO HOOK

  const defaultConta = contaInicial?.Conta || '';
  const defaultAnalitica = contaInicial?.Analitica || 'Não';
  
  // Lógica de preenchimento automático de flags para novas contas
  const inferFlags = useCallback((contaCode: string, isAnalitica: boolean) => {
      if (!isAnalitica || !mapeamento || mapeamento.length === 0) {
          // Fallback para o padrão se o mapeamento não estiver carregado
          return { is_conta_patrimonial: false, is_conta_resultado: false, is_conta_caixa_banco: false };
      }
      
      let is_conta_patrimonial = false;
      let is_conta_resultado = false;
      let is_conta_caixa_banco = false;
      
      const nivel1 = contaCode.split('.')[0];
      const natureza = mapeamento.find(m => m.codigo_nivel_1 === nivel1)?.tipo_natureza;
      
      if (natureza) {
          // 1. Patrimonial: Ativo, Passivo, PL
          if (natureza === 'Ativo' || natureza === 'Passivo' || natureza === 'Patrimonio Liquido') {
              is_conta_patrimonial = true;
          }
          
          // 2. Resultado: Receita, Despesa
          if (natureza === 'Receita' || natureza === 'Despesa') {
              is_conta_resultado = true;
          }
          
          // 3. Caixa/Banco: Sugerido para contas de Ativo (1.x.x)
          if (natureza === 'Ativo') {
              is_conta_caixa_banco = true;
          }
      }
      
      return { is_conta_patrimonial, is_conta_resultado, is_conta_caixa_banco };
  }, [mapeamento]);
  
  const initialFlags = isEditing 
      ? {
          is_conta_caixa_banco: contaInicial?.is_conta_caixa_banco || false,
          is_conta_patrimonial: contaInicial?.is_conta_patrimonial || false,
          is_conta_resultado: contaInicial?.is_conta_resultado || false,
      }
      : inferFlags(defaultConta, defaultAnalitica === 'Sim');
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      Conta: defaultConta,
      codigo_reduzido: contaInicial?.codigo_reduzido || '',
      Descricao: contaInicial?.Descricao || '',
      Analitica: defaultAnalitica,
      is_conta_caixa_banco: initialFlags.is_conta_caixa_banco,
      is_conta_patrimonial: initialFlags.is_conta_patrimonial,
      is_conta_resultado: initialFlags.is_conta_resultado,
    },
  });
  
  const isAnalitica = form.watch('Analitica') === 'Sim';
  const contaCodigo = form.watch('Conta');
  
  // Efeito para preencher o Código Reduzido e flags automaticamente
  useEffect(() => {
    if (!isEditing && contaCodigo && !loadingMapeamento) {
        const codigoSemPontos = contaCodigo.replace(/\./g, '');
        form.setValue('codigo_reduzido', codigoSemPontos, { shouldDirty: false });
        
        const newFlags = inferFlags(contaCodigo, isAnalitica);
        form.setValue('is_conta_patrimonial', newFlags.is_conta_patrimonial, { shouldDirty: false });
        form.setValue('is_conta_resultado', newFlags.is_conta_resultado, { shouldDirty: false });
        form.setValue('is_conta_caixa_banco', newFlags.is_conta_caixa_banco, { shouldDirty: false });
    }
  }, [contaCodigo, isEditing, form, isAnalitica, inferFlags, loadingMapeamento]);
  
  const fetchMascara = useCallback(async () => {
    if (!proprietarioId) return;
    setLoadingMascara(true);
    
    const { data, error } = await supabase
        .from('configuracao_plano_contas')
        .select('mascara_codigo')
        .eq('proprietario_id', proprietarioId)
        .limit(1)
        .single();
        
    if (error && error.code !== 'PGRST116') {
        console.error('Erro ao buscar máscara:', error);
    }
    
    setMascara(data?.mascara_codigo || null);
    setLoadingMascara(false);
  }, [proprietarioId]);
  
  useEffect(() => {
      fetchMascara();
  }, [fetchMascara]);

  const onSubmit = async (values: FormValues) => {
    
    // Validação da Máscara (Apenas para contas analíticas)
    if (values.Analitica === 'Sim' && mascara) {
        if (!validateMask(values.Conta, mascara)) {
            showError(`O código da conta analítica não segue a máscara cadastrada: ${mascara}`);
            return;
        }
    }
    
    const dataToSave = {
      proprietario_id: proprietarioId,
      Conta: values.Conta,
      codigo_reduzido: values.codigo_reduzido || null,
      Descricao: values.Descricao,
      Analitica: values.Analitica,
      is_conta_caixa_banco: values.Analitica === 'Sim' ? values.is_conta_caixa_banco : false,
      is_conta_patrimonial: values.Analitica === 'Sim' ? values.is_conta_patrimonial : false,
      is_conta_resultado: values.Analitica === 'Sim' ? values.is_conta_resultado : false,
    };

    let error = null;

    if (isEditing) {
      // Atualizar
      const result = await supabase
        .from('plano_contas')
        .update(dataToSave)
        .eq('id', contaInicial!.id);
      error = result.error;
    } else {
      // Inserir
      const result = await supabase
        .from('plano_contas')
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
  
  // Determina se a validação da máscara falhou
  const isMaskInvalid = isAnalitica && !!mascara && !validateMask(contaCodigo, mascara);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        
        {loadingMascara ? (
            <div className="flex justify-center items-center h-10"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
        ) : (
            <div className="p-2 bg-secondary rounded-md text-sm">
                Máscara Ativa: <span className="font-mono font-semibold text-primary">{mascara || 'Nenhuma'}</span>
            </div>
        )}
        
        <FormField
          control={form.control}
          name="Conta"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Código da Conta</FormLabel>
              <FormControl>
                <Input placeholder="Ex: 1.0.1.01.0101" {...field} />
              </FormControl>
              <FormMessage />
              {isMaskInvalid && (
                  <p className="text-xs text-red-500">
                      O código não segue a máscara: {mascara}
                  </p>
              )}
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="codigo_reduzido"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Código Reduzido (Opcional)</FormLabel>
              <FormControl>
                <Input placeholder="Ex: 1010101" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="Descricao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Caixa Matriz" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="Analitica"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Analítica (Permite Lançamentos)</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Sim">Sim</SelectItem>
                  <SelectItem value="Não">Não</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {/* CAMPO: IS CONTA CAIXA/BANCO (Ativo) */}
        <FormField
            control={form.control}
            name="is_conta_caixa_banco"
            render={({ field }) => (
                <FormItem className={cn("flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 transition-opacity", isAnalitica ? 'opacity-100' : 'opacity-50 pointer-events-none')}>
                    <FormControl>
                        <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!isAnalitica}
                        />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                        <FormLabel>
                            Usar como Conta de Saldo (Caixa/Banco)
                        </FormLabel>
                        <p className="text-sm text-muted-foreground">
                            Se marcada, esta conta contábil poderá ser vinculada a uma Conta/Caixa em Bancos.
                        </p>
                    </div>
                </FormItem>
            )}
        />
        
        {/* NOVO CAMPO: IS CONTA PATRIMONIAL (Ativo/Passivo/PL) */}
        <FormField
            control={form.control}
            name="is_conta_patrimonial"
            render={({ field }) => (
                <FormItem className={cn("flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 transition-opacity", isAnalitica ? 'opacity-100' : 'opacity-50 pointer-events-none')}>
                    <FormControl>
                        <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!isAnalitica}
                        />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                        <FormLabel>
                            Usar como Conta Patrimonial (Ativo/Passivo/PL)
                        </FormLabel>
                        <p className="text-sm text-muted-foreground">
                            Se marcada, esta conta será listada para cadastro de saldo na página Contas Patrimoniais.
                        </p>
                    </div>
                </FormItem>
            )}
        />
        
        {/* CAMPO: IS CONTA RESULTADO (Receita/Despesa) */}
        <FormField
            control={form.control}
            name="is_conta_resultado"
            render={({ field }) => (
                <FormItem className={cn("flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 transition-opacity", isAnalitica ? 'opacity-100' : 'opacity-50 pointer-events-none')}>
                    <FormControl>
                        <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!isAnalitica}
                        />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                        <FormLabel>
                            Usar como Conta de Resultado (Receita/Despesa)
                        </FormLabel>
                        <p className="text-sm text-muted-foreground">
                            Se marcada, esta conta será listada para mapeamento de transações de Receita e Despesa na Conciliação.
                        </p>
                    </div>
                </FormItem>
            )}
        />
        {/* FIM NOVO CAMPO */}
        
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || isMaskInvalid}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Salvar Alterações' : 'Salvar Conta'}
        </Button>
      </form>
    </Form>
  );
};

export default FormPlanoContas;