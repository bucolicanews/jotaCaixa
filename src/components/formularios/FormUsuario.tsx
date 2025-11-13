import React, { useState, useCallback } from 'react';
import { useForm, FormProvider, Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Loader2, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, ClienteProfile, UsuarioProfile, UserRole } from '@/types/usuario';
import { PERMISSOES_DISPONIVEIS, Permissao } from '@/config/permissoes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import FormDadosCadastrais from '../usuario-forms/FormDadosCadastrais';
import { Input } from '../ui/input';
import { FormField, FormItem, FormLabel, FormControl, FormMessage, Form } from '../ui/form';
import { useBulkTagManager } from '@/hooks/use-bulk-tag-manager';
import { format } from 'date-fns';
import { BASE_URL } from '@/config/app-config';
import { Separator } from '../ui/separator';
import FormGeral from '../usuario-forms/FormGeral';
import FormFolgasFerias from '../usuario-forms/FormFolgasFerias';
import FormDocumentos from '../usuario-forms/FormDocumentos';
import FormDadosContratuais from '../usuario-forms/FormDadosContratuais';

const textOptional = z.string().optional().or(z.literal(''));
const urlSchema = z.string().url('URL inválida.').optional().or(z.literal(''));

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  email: z.string().email('Email inválido.'),
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').optional().or(z.literal('')),
  permissoes: z.record(z.boolean()).optional(),
  
  // Novos Campos de Folga
  dias_folga_fixos: z.array(z.string()).optional(),
  folga_domingo_obrigatoria: z.boolean().optional(),
  
  // Novos Campos de Salário/Jornada
  salario: z.coerce.number().min(0).optional(),
  horas_semanais: z.coerce.number().int().min(1).optional(),
  horas_mensais: z.coerce.number().int().min(1).optional(),
  
  // Novos Dados Cadastrais (Comum a Cliente e Usuário)
  cpf: textOptional,
  rg: textOptional,
  nome_mae: textOptional,
  nome_pai: textOptional,
  telefone: textOptional,
  cep: textOptional,
  endereco: textOptional,
  numero: textOptional,
  complemento: textOptional,
  bairro: textOptional,
  cidade: textOptional,
  estado: textOptional,
  
  // NOVOS CAMPOS DE CLIENTE
  razao_social: textOptional,
  nome_fantasia: textOptional,
  documento: textOptional,
  cnpj: textOptional,

  // Dados Contratuais (Apenas para UsuarioProfile)
  data_inicio_contrato: z.date().optional().nullable(),
  data_fim_contrato: z.date().optional().nullable(),
  data_inicio_aviso: z.date().optional().nullable(),
  tipo_aviso: z.enum(['Trabalhado', 'Indenizado', 'Nenhum']).optional().nullable(),

  // Documentos (URLs)
  rg_url: urlSchema,
  cpf_url: urlSchema,
  titulo_eleitor_url: urlSchema,
  reservista_url: urlSchema,
  ctps_url: urlSchema,
  certidao_nascimento_url: urlSchema,
  certidao_casamento_url: urlSchema,
  comprovante_residencia_url: urlSchema,
  comprovante_escolaridade_url: urlSchema,
  exame_admissional_url: urlSchema,
  foto_3x4_url: urlSchema,
  cnh_url: urlSchema,
  cartao_pis_url: urlSchema,
  ja_admitido_anteriormente: z.boolean().optional(),
  
  // NOVO CAMPO DE ACESSO
  data_fim_acesso: z.date().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormUsuarioProps {
  criadorRole: UserRole;
  criadorPerfil: AnyProfile;
  usuarioInicial?: AnyProfile | null;
  onSaveComplete: () => void;
}

const FormUsuario: React.FC<FormUsuarioProps> = ({
  criadorRole,
  criadorPerfil,
  usuarioInicial,
  onSaveComplete,
}) => {
  const isEditing = !!usuarioInicial;
  
  const profileToEdit = usuarioInicial as UsuarioProfile;
  
  const [activeTab, setActiveTab] = useState('pessoal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const resourceId = usuarioInicial?.id;
  const { refetchStatus, refreshKey } = useBulkTagManager(resourceId);

  const parseDate = (dateString: string | null | undefined): Date | undefined => {
    if (!dateString) return undefined;
    const date = new Date(dateString + 'T00:00:00');
    return isNaN(date.getTime()) ? undefined : date;
  };

  // Determina as permissões visíveis
  const permissoesVisiveis = PERMISSOES_DISPONIVEIS.filter((p: Permissao) => {
      // Se for Admin, mostra todas as permissões
      if (criadorRole === 'Admin') return true;
      
      // Se for Cliente, mostra apenas as permissões de Usuário (Funcionário)
      return p.key === 'ponto_eletronico' || p.key === 'visualizar_proprio_ponto' || p.key === 'folha_ponto' || p.key === 'cadastrar_usuarios';
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: (function() { // IIFE para resolver TS2322 (Erro 2)
        const defaultPermissoes = permissoesVisiveis.reduce((acc: Record<string, boolean>, p: Permissao) => {
            if (profileToEdit && 'permissoes' in profileToEdit && (profileToEdit as any).permissoes) {
                acc[p.key] = (profileToEdit as any).permissoes[p.key] !== false;
            } else {
                // Padrão para novo usuário: Ponto Eletrônico e Visualizar Próprio Ponto
                acc[p.key] = p.key === 'ponto_eletronico' || p.key === 'visualizar_proprio_ponto';
            }
            return acc;
        }, {} as Record<string, boolean>);
        
        return {
            nome: profileToEdit?.nome || '',
            email: profileToEdit?.email || '',
            senha: '',
            permissoes: defaultPermissoes,
            
            // Dados de Folga (Apenas Usuário)
            dias_folga_fixos: profileToEdit?.dias_folga_fixos || ['Saturday', 'Sunday'],
            folga_domingo_obrigatoria: profileToEdit?.folga_domingo_obrigatoria ?? true,
            
            // Dados de Salário/Jornada
            salario: profileToEdit?.salario || 0,
            horas_semanais: profileToEdit?.horas_semanais || 44,
            horas_mensais: profileToEdit?.horas_mensais || 220,
            
            // Dados Cadastrais
            cpf: profileToEdit?.cpf || '',
            rg: profileToEdit?.rg || '',
            nome_mae: profileToEdit?.nome_mae || '',
            nome_pai: profileToEdit?.nome_pai || '',
            telefone: profileToEdit?.telefone || '',
            cep: profileToEdit?.cep || '',
            endereco: profileToEdit?.endereco || '',
            numero: profileToEdit?.numero || '',
            complemento: profileToEdit?.complemento || '',
            bairro: profileToEdit?.bairro || '',
            cidade: profileToEdit?.cidade || '',
            estado: profileToEdit?.estado || '',
            
            // Dados Contratuais (Apenas Usuário)
            data_inicio_contrato: parseDate(profileToEdit?.data_inicio_contrato),
            data_fim_contrato: parseDate(profileToEdit?.data_fim_contrato),
            data_inicio_aviso: parseDate(profileToEdit?.data_inicio_aviso),
            tipo_aviso: (profileToEdit?.tipo_aviso || 'Nenhum') as FormValues['tipo_aviso'],
            
            // Documentos (URLs)
            rg_url: profileToEdit?.rg_url || '',
            cpf_url: profileToEdit?.cpf_url || '',
            titulo_eleitor_url: profileToEdit?.titulo_eleitor_url || '',
            reservista_url: profileToEdit?.reservista_url || '',
            ctps_url: profileToEdit?.ctps_url || '',
            certidao_nascimento_url: profileToEdit?.certidao_nascimento_url || '',
            certidao_casamento_url: profileToEdit?.certidao_casamento_url || '',
            comprovante_residencia_url: profileToEdit?.comprovante_residencia_url || '',
            comprovante_escolaridade_url: profileToEdit?.comprovante_escolaridade_url || '',
            exame_admissional_url: profileToEdit?.exame_admissional_url || '',
            foto_3x4_url: profileToEdit?.foto_3x4_url || '',
            cnh_url: profileToEdit?.cnh_url || '',
            cartao_pis_url: profileToEdit?.cartao_pis_url || '',
            ja_admitido_anteriormente: profileToEdit?.ja_admitido_anteriormente ?? false,
        };
    })(),
  });

  const handleSelectAll = (select: boolean) => {
    permissoesVisiveis.forEach((p: Permissao) => {
      form.setValue(`permissoes.${p.key}`, select, { shouldDirty: true });
    });
  };
  
  const handleTagToggle = useCallback(() => {
      refetchStatus();
  }, [refetchStatus]);
  
  const isContractEditable = criadorRole === 'Admin' || criadorRole === 'Cliente';

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    
    const proprietarioId = criadorRole === 'Admin' ? criadorPerfil?.id : (criadorPerfil as ClienteProfile)?.id;
    
    if (!proprietarioId) {
        showError('ID do proprietário não pôde ser determinado.');
        setIsSubmitting(false);
        return;
    }

    try {
        let userId = usuarioInicial?.id;
        let isNewAuthUser = false;
        
        // 1. Handle New User Creation (Auth)
        if (!isEditing) {
            if (!values.senha) {
                showError('A senha é obrigatória para novos usuários.');
                return;
            }
            
            const { data: signUpData, error: authError } = await supabase.auth.signUp({
                email: values.email,
                password: values.senha,
                options: {
                    emailRedirectTo: `${BASE_URL}/atualizar-senha`,
                    data: { 
                        role: 'Usuario', 
                        nome: values.nome, 
                        proprietario_id: proprietarioId, // Vincula ao Admin ou Cliente
                    }
                }
            });

            if (authError) {
                if (authError.message.includes('already registered')) {
                    showError('Este email já está cadastrado.');
                    return;
                }
                throw authError;
            }
            
            userId = signUpData.user?.id;
            isNewAuthUser = true;
        }
        
        if (!userId) throw new Error('Falha ao obter ID do usuário.');

        // 2. Prepare Data Payload (tbl_usuarios)
        const dataToUpdate: any = { 
            nome: values.nome,
            permissoes: values.permissoes,
            
            // Dados de RH/Contrato
            dias_folga_fixos: values.dias_folga_fixos || [],
            folga_domingo_obrigatoria: values.folga_domingo_obrigatoria,
            salario: values.salario,
            horas_semanais: values.horas_semanais,
            horas_mensais: values.horas_mensais,
            data_inicio_contrato: values.data_inicio_contrato ? format(values.data_inicio_contrato, 'yyyy-MM-dd') : null,
            data_fim_contrato: values.data_fim_contrato ? format(values.data_fim_contrato, 'yyyy-MM-dd') : null,
            data_inicio_aviso: values.data_inicio_aviso ? format(values.data_inicio_aviso, 'yyyy-MM-dd') : null,
            tipo_aviso: values.tipo_aviso === 'Nenhum' ? null : values.tipo_aviso,
            
            // Dados Cadastrais e Documentos
            cpf: values.cpf || null,
            rg: values.rg || null,
            nome_mae: values.nome_mae || null,
            nome_pai: values.nome_pai || null,
            telefone: values.telefone || null,
            cep: values.cep || null,
            endereco: values.endereco || null,
            numero: values.numero || null,
            complemento: values.complemento || null,
            bairro: values.bairro || null,
            cidade: values.cidade || null,
            estado: values.estado || null,
            rg_url: values.rg_url || null,
            cpf_url: values.cpf_url || null,
            titulo_eleitor_url: values.titulo_eleitor_url || null,
            reservista_url: values.reservista_url || null,
            ctps_url: values.ctps_url || null,
            certidao_nascimento_url: values.certidao_nascimento_url || null,
            certidao_casamento_url: values.certidao_casamento_url || null,
            comprovante_residencia_url: values.comprovante_residencia_url || null,
            comprovante_escolaridade_url: values.comprovante_escolaridade_url || null,
            exame_admissional_url: values.exame_admissional_url || null,
            foto_3x4_url: values.foto_3x4_url || null,
            cnh_url: values.cnh_url || null,
            cartao_pis_url: values.cartao_pis_url || null,
            ja_admitido_anteriormente: values.ja_admitido_anteriormente,
        };
        
        if (isEditing) {
            if (values.senha) {
                const { error: authError } = await supabase.auth.updateUser({ password: values.senha });
                if (authError) throw authError;
            }
            const { error } = await supabase.from('tbl_usuarios').update(dataToUpdate).eq('id', userId);
            if (error) throw error;
        } else {
            // Se for novo, o trigger já inseriu o registro base, apenas atualizamos os campos de RH
            const { error } = await supabase.from('tbl_usuarios').update(dataToUpdate).eq('id', userId);
            if (error) throw error;
        }

        showSuccess(`Usuário ${isEditing ? 'atualizado' : 'criado'} com sucesso!`);
        
        if (isNewAuthUser) {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(values.email, {
                redirectTo: `${BASE_URL}/atualizar-senha`,
            });
            if (resetError) console.error('Aviso: Falha ao enviar email de redefinição de senha:', resetError);
            else showSuccess('Link de acesso enviado para o email.');
        }
        
        refetchStatus();
        onSaveComplete();
    } catch (error: any) {
        showError(`Falha ao salvar: ${error.message}`);
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <FormProvider {...form}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex flex-wrap justify-start w-full h-auto p-1">
              <TabsTrigger value="pessoal" className="flex-1 md:flex-none md:w-1/5">Geral</TabsTrigger>
              <TabsTrigger value="folgas" className="flex-1 md:flex-none md:w-1/5">Folgas/Férias</TabsTrigger>
              <TabsTrigger value="cadastrais" className="flex-1 md:flex-none md:w-1/5">Dados Cadastrais</TabsTrigger>
              <TabsTrigger value="documentos" className="flex-1 md:flex-none md:w-1/5">Documentos</TabsTrigger>
              <TabsTrigger value="contrato" className="flex-1 md:flex-none md:w-1/5">Contrato (RH)</TabsTrigger>
            </TabsList>
            
            {/* TAB 1: GERAL */}
            <TabsContent value="pessoal" className="mt-4 space-y-4 p-4">
              <FormGeral
                  control={form.control}
                  isSubmitting={isSubmitting}
                  permissoesVisiveis={permissoesVisiveis}
                  handleSelectAll={handleSelectAll}
              />
              
              {/* Campos de Login (Apenas para criação ou alteração de senha) */}
              <Separator />
              <h3 className="font-semibold text-lg">Acesso e Login</h3>
              <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email (Login)</FormLabel><FormControl><Input type="email" placeholder="email@exemplo.com" {...field} disabled={isEditing} /></FormControl><FormMessage /></FormItem>
              )} />
              {!isEditing && <FormField control={form.control} name="senha" render={({ field }) => (
                  <FormItem><FormLabel>Criar Senha</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>
              )} />}
              {isEditing && <FormField control={form.control} name="senha" render={({ field }) => (
                  <FormItem><FormLabel>Alterar Senha (Opcional)</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>
              )} />}
            </TabsContent>
            
            {/* TAB 2: FOLGAS E FÉRIAS */}
            <TabsContent value="folgas" className="mt-4 space-y-6 p-4">
                <FormFolgasFerias
                    control={form.control as unknown as Control<any>}
                    isSubmitting={isSubmitting}
                    usuarioInicial={profileToEdit} // Passa o perfil (que pode ser null na criação)
                />
            </TabsContent>

            {/* TAB 3: DADOS CADASTRAIS */}
            <TabsContent value="cadastrais" className="mt-4 space-y-6 p-4">
                <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-lg flex items-center"><Tag className="w-5 h-5 mr-2" /> Tags de Contrato</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Dados pessoais e de contato do funcionário.</p>
                
                <FormDadosCadastrais
                    control={form.control as unknown as Control<any>}
                    isSubmitting={isSubmitting}
                    resourceId={resourceId}
                    tagRefreshKey={refreshKey}
                    onTagToggle={handleTagToggle}
                />
            </TabsContent>
            
            {/* TAB 4: DOCUMENTOS DE ADMISSÃO */}
            <TabsContent value="documentos" className="mt-4 space-y-6 p-4">
                <FormDocumentos
                    control={form.control as unknown as Control<any>}
                    isSubmitting={isSubmitting}
                    resourceId={resourceId}
                />
            </TabsContent>

            {/* TAB 5: DADOS CONTRATUAIS (RH) */}
            <TabsContent value="contrato" className="mt-4 space-y-6 p-4">
                <FormDadosContratuais
                    control={form.control as unknown as Control<any>}
                    isSubmitting={isSubmitting}
                    isContractEditable={isContractEditable}
                />
            </TabsContent>
          </Tabs>
          
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Alterações
          </Button>
        </form>
      </Form>
    </FormProvider>
  );
};

export default FormUsuario;