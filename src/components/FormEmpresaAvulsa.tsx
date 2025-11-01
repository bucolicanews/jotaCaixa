import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Plano } from '@/types/plano';
import { useSessao } from '@/hooks/use-sessao';

const formSchema = z.object({
  nome: z.string().min(1, 'O nome da empresa é obrigatório.'),
  email: z.string().email('Email inválido.'),
  plano_id: z.string().uuid('Selecione um plano válido.'),
  data_fim_acesso: z.date({ required_error: 'A data limite é obrigatória.' }),
  tipo_cliente: z.enum(['PF', 'PJ'], { required_error: 'O tipo de cliente é obrigatório.' }),
});

type FormValues = z.infer<typeof formSchema>;

interface FormEmpresaAvulsaProps {
  onSaveComplete: () => void;
}

const FormEmpresaAvulsa: React.FC<FormEmpresaAvulsaProps> = ({ onSaveComplete }) => {
  const { usuario } = useSessao();
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loadingPlanos, setLoadingPlanos] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: '',
      email: '',
      plano_id: undefined,
      data_fim_acesso: undefined,
      tipo_cliente: 'PJ',
    },
  });
  
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const fetchPlanos = useCallback(async () => {
    setLoadingPlanos(true);
    const { data, error } = await supabase
      .from('planos')
      .select('*')
      .order('preco_mensal', { ascending: true });

    if (error) {
      showError('Erro ao carregar planos: ' + error.message);
      setPlanos([]);
    } else {
      setPlanos(data as Plano[]);
    }
    setLoadingPlanos(false);
  }, []);

  useEffect(() => {
    fetchPlanos();
  }, [fetchPlanos]);

  const onSubmit = async (values: FormValues) => {
    if (!usuario?.id) {
      showError('Sessão de administrador inválida.');
      return;
    }
    
    setIsSubmitting(true);
    
    const planoSelecionado = planos.find(p => p.id === values.plano_id);
    if (!planoSelecionado) {
        showError('Plano não encontrado.');
        setIsSubmitting(false);
        return;
    }

    try {
      let newUserId: string | undefined;
      
      // 1. Tentar criar o usuário no Auth (se já existir, o erro será capturado)
      const tempPassword = Math.random().toString(36).substring(2, 15);
      
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: values.email,
        password: tempPassword,
        options: {
          data: { 
            role: 'Cliente', 
            nome: values.nome, 
            plano_id: values.plano_id, 
            permissoes: JSON.stringify(planoSelecionado.permissoes), 
            aprovado: true, // Já é aprovado
          }
        }
      });

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
            // Se já estiver registrado, tentamos obter o usuário para prosseguir com o reset de senha
            const { data: userData } = await supabase.auth.getUser();
            newUserId = userData.user?.id;
            if (!newUserId) throw new Error('Usuário já registrado, mas ID não encontrado.');
        } else {
            throw signUpError;
        }
      } else {
          newUserId = signUpData.user?.id;
      }
      
      if (!newUserId) throw new Error('Falha ao criar ou obter ID do usuário no Auth.');

      // 2. Enviar o link de redefinição de senha (que funciona como convite)
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(values.email, {
          redirectTo: `${window.location.origin}/atualizar-senha`,
      });
      
      if (resetError) {
          // Se o reset falhar, ainda podemos prosseguir com a atualização do perfil
          console.error('Aviso: Falha ao enviar email de redefinição de senha:', resetError);
      }

      // 3. Atualizar tbl_clientes (o trigger já inseriu, mas precisamos garantir os dados avulsos)
      const dataToUpdate = {
        nome: values.nome,
        email: values.email,
        aprovado: true,
        limite_usuarios: 5, // Padrão
        permissoes: planoSelecionado.permissoes,
        plano_id: values.plano_id,
        data_fim_acesso: format(values.data_fim_acesso, 'yyyy-MM-dd') + 'T12:00:00Z', // Meio-dia UTC
        tipo_cliente: `${values.tipo_cliente}_Avulso`, // Define o tipo avulso
      };

      const { error: updateError } = await supabase
        .from('tbl_clientes')
        .update(dataToUpdate)
        .eq('id', newUserId);

      if (updateError) throw updateError;

      showSuccess(`Empresa Avulsa ${values.nome} cadastrada com sucesso! Convite de acesso enviado para ${values.email}.`);
      onSaveComplete();

    } catch (error: any) {
      console.error('Erro ao cadastrar empresa avulsa:', error);
      showError('Falha no cadastro: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <h3 className="font-semibold text-lg">Dados de Acesso</h3>
        <FormField
          control={form.control}
          name="nome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome da Empresa / Pessoa</FormLabel>
              <FormControl><Input placeholder="Nome Fantasia ou Nome Completo" {...field} disabled={isSubmitting} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email (Login)</FormLabel>
              <FormControl><Input type="email" placeholder="email@empresa.com" {...field} disabled={isSubmitting} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <h3 className="font-semibold text-lg pt-4 border-t">Configuração do Plano</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
                control={form.control}
                name="tipo_cliente"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Tipo de Cliente</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting}>
                            <FormControl>
                                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="PJ">Pessoa Jurídica (PJ)</SelectItem>
                                <SelectItem value="PF">Pessoa Física (PF)</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={form.control}
                name="plano_id"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Plano de Assinatura</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={loadingPlanos || isSubmitting}>
                            <FormControl>
                                <SelectTrigger><SelectValue placeholder={loadingPlanos ? "Carregando Planos..." : "Selecione o Plano"} /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {planos.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.nome} ({p.preco_mensal > 0 ? formatCurrency(p.preco_mensal) : 'Grátis'})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
        
        <FormField
          control={form.control}
          name="data_fim_acesso"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Data Limite de Acesso</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full pl-3 text-left font-normal",
                        !field.value && "text-muted-foreground"
                      )}
                      disabled={isSubmitting}
                    >
                      {field.value ? format(field.value as Date, "PPP", { locale: ptBR }) : <span>Escolha a data</span>}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value as Date}
                    onSelect={field.onChange}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Cadastrar Empresa Avulsa
        </Button>
      </form>
    </Form>
  );
};

export default FormEmpresaAvulsa;