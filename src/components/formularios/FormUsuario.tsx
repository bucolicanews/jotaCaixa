import React, { useState, useCallback, useEffect } from 'react';
import { useForm, FormProvider, Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Loader2, Tag, FileSignature, CalendarIcon, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, ClienteProfile, UsuarioProfile, UserRole, AdminUsuarioProfile } from '@/types/usuario';
import { PERMISSOES_DISPONIVEIS, Permissao } from '@/config/permissoes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import FormDadosCadastrais from '../usuario-forms/FormDadosCadastrais';
import { Input } from '@/components/ui/input';
import { FormField, FormItem, FormLabel, FormControl, FormMessage, Form } from '@/components/ui/form';
import { useBulkTagManager } from '@/hooks/use-bulk-tag-manager';
import { format } from 'date-fns';
import { BASE_URL } from '@/config/app-config';
import { Separator } from '@/components/ui/separator';
import FormGeral from './FormGeral';
import FormFolgas from './FormFolgas';
import FormDocumentos from '../usuario-forms/FormDocumentos';
import FormDadosContratuais from '../usuario-forms/FormDadosContratuais';
import FormFerias from '@/components/usuario-forms/FormFerias';
import LogoUpload from '../LogoUpload';
import AvatarUpload from '../AvatarUpload';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import FormIdentificacao from '../cliente-forms/FormIdentificacao';
import FormContato from '../cliente-forms/FormContato';
import FormEndereco from '../cliente-forms/FormEndereco';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Plano } from '@/types/plano';
import { fetchAddressByCep } from '@/utils/cep-lookup';
import { sanitizeConteudo } from '@/utils/formatters';

const textOptional = z.string().optional().or(z.literal(''));
const urlSchema = z.string().url('URL inválida.').optional().or(z.literal(''));

const formSchema = z.object({
  avatar_url: textOptional,
  nome: z.string().min(1, 'O nome é obrigatório.'),
  email: z.string().email('Email inválido.'),
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').optional().or(z.literal('')),
  permissoes: z.record(z.boolean()).optional(),
  limite_usuarios: z.coerce.number().int().min(1, 'O limite deve ser ao menos 1.').optional(),
  
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
  plano_id: z.string().optional(),
  
  // NOVOS CAMPOS DE ASSINATURA
  assinatura_proprietario_nome: textOptional,
  assinatura_proprietario_url: textOptional,
  
  // Dados Contratuais
  data_inicio_contrato: z.date().optional().nullable(),
  data_fim_contrato: z.date().optional().nullable(),
  data_inicio_aviso: z.date().optional().nullable(),
  tipo_aviso: z.enum(['Trabalhado', 'Indenizado', 'Nenhum']).optional().nullable(),

  // Documentos
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
  
  data_fim_acesso: z.date().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormUsuarioProps {
  criadorRole: UserRole;
  criadorPerfil: AnyProfile;
  usuarioInicial?: AnyProfile | null;
  onSaveComplete: () => void;
  isNewClient?: boolean;
  isReadOnly?: boolean;
  planos?: Plano[];
}

const isUsuarioProfile = (profile: AnyProfile): profile is UsuarioProfile => {
    return !!profile && 'cliente_id' in profile && profile.cliente_id !== null;
};

const isAdminUsuarioProfile = (profile: AnyProfile): profile is AdminUsuarioProfile => {
    return !!profile && 'admin_id' in profile && profile.admin_id !== null;
};

const isClienteProfile = (profile: AnyProfile): profile is ClienteProfile => {
    return !!profile && 'limite_usuarios' in profile;
};

const FormUsuario: React.FC<FormUsuarioProps> = ({
  criadorRole,
  criadorPerfil,
  usuarioInicial,
  onSaveComplete,
  isNewClient = false,
  isReadOnly = false,
  planos = [],
}) => {
  const isEditing = !!usuarioInicial;
  const profileToEdit = isNewClient ? (criadorPerfil as ClienteProfile) : usuarioInicial;
  
  const isEditingClientProfile = isEditing && isClienteProfile(profileToEdit);
  const isEditingUser = isEditing && (isUsuarioProfile(profileToEdit) || isAdminUsuarioProfile(profileToEdit));
  
  const userProfile: UsuarioProfile | AdminUsuarioProfile | null = isEditingUser ? profileToEdit as UsuarioProfile | AdminUsuarioProfile : null;
  const clientProfile: ClienteProfile | null = isEditingClientProfile ? profileToEdit as ClienteProfile : null;
  
  const isClientEditLocked = isEditingClientProfile && criadorRole !== 'Admin';

  const [activeTab, setActiveTab] = useState('pessoal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const resourceId = usuarioInicial?.id;
  const { refetchStatus, refreshKey } = useBulkTagManager(resourceId);

  const parseDate = (dateString: string | null | undefined): Date | undefined => {
    if (!dateString) return undefined;
    const date = new Date(dateString + 'T00:00:00');
    return isNaN(date.getTime()) ? undefined : date;
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
        avatar_url: '',
        nome: '',
        email: '',
        senha: '',
        permissoes: {},
        limite_usuarios: 5,
    },
  });
  
  const { watch, setValue, reset, handleSubmit, control } = form; // ADICIONADO: control
  const cepValue = watch('cep');
  const isAddressLoading = watch('endereco') === 'Buscando...';
  
  const handleCepLookup = useCallback(async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;
    
    setValue('endereco', 'Buscando...');
    setValue('bairro', 'Buscando...');
    setValue('cidade', 'Buscando...');
    setValue('estado', 'Buscando...');
    
    const address = await fetchAddressByCep(cleanCep);
    if (address) {
        setValue('endereco', address.logradouro || '');
        setValue('bairro', address.bairro || '');
        setValue('cidade', address.localidade || '');
        setValue('estado', address.uf || '');
    } else {
        setValue('endereco', '');
        setValue('bairro', '');
        setValue('cidade', '');
        setValue('estado', '');
    }
  }, [setValue]);
  
  useEffect(() => {
    const cleanCep = cepValue?.replace(/\D/g, '');
    if (cleanCep && cleanCep.length === 8) {
      handleCepLookup(cleanCep);
    }
  }, [cepValue, handleCepLookup]);

  useEffect(() => {
    if (!profileToEdit) return;

    const defaultPermissoes = PERMISSOES_DISPONIVEIS.reduce((acc: Record<string, boolean>, p: Permissao) => {
        if (profileToEdit && 'permissoes' in profileToEdit && (profileToEdit as any).permissoes) {
            acc[p.key] = (profileToEdit as any).permissoes[p.key] === true;
        } else {
            acc[p.key] = p.key === 'ponto_eletronico' || p.key === 'visualizar_proprio_ponto';
        }
        return acc;
    }, {} as Record<string, boolean>);
    
    const resetValues: Partial<FormValues> = {
        avatar_url: profileToEdit?.avatar_url || '',
        nome: profileToEdit?.nome || '',
        email: profileToEdit?.email || '',
        senha: '',
        permissoes: defaultPermissoes,
        
        limite_usuarios: clientProfile?.limite_usuarios || 5,
        plano_id: clientProfile?.plano_id || undefined,
        data_fim_acesso: parseDate(clientProfile?.data_fim_acesso),
        razao_social: clientProfile?.razao_social || '',
        nome_fantasia: clientProfile?.nome_fantasia || '',
        documento: clientProfile?.documento || '',
        cnpj: clientProfile?.cnpj || '',
        assinatura_proprietario_nome: clientProfile?.assinatura_proprietario_nome || clientProfile?.nome || '',
        assinatura_proprietario_url: clientProfile?.assinatura_proprietario_url || clientProfile?.logo_url || '',
        
        dias_folga_fixos: userProfile?.dias_folga_fixos || ['Saturday', 'Sunday'],
        folga_domingo_obrigatoria: userProfile?.folga_domingo_obrigatoria ?? true,
        salario: userProfile?.salario || 0,
        horas_semanais: userProfile?.horas_semanais || 44,
        horas_mensais: userProfile?.horas_mensais || 220,
        data_inicio_contrato: parseDate(userProfile?.data_inicio_contrato),
        data_fim_contrato: parseDate(userProfile?.data_fim_contrato),
        data_inicio_aviso: parseDate(userProfile?.data_inicio_aviso),
        tipo_aviso: (userProfile?.tipo_aviso || 'Nenhum') as FormValues['tipo_aviso'],
        
        cpf: userProfile?.cpf || clientProfile?.cpf || '',
        rg: userProfile?.rg || clientProfile?.rg || '',
        nome_mae: userProfile?.nome_mae || '',
        nome_pai: userProfile?.nome_pai || '',
        telefone: userProfile?.telefone || clientProfile?.telefone || '',
        cep: userProfile?.cep || clientProfile?.cep || '',
        endereco: userProfile?.endereco || clientProfile?.endereco || '',
        numero: userProfile?.numero || clientProfile?.numero || '',
        complemento: userProfile?.complemento || clientProfile?.complemento || '',
        bairro: userProfile?.bairro || clientProfile?.bairro || '',
        cidade: userProfile?.cidade || clientProfile?.cidade || '',
        estado: userProfile?.estado || clientProfile?.estado || '',
        
        rg_url: userProfile?.rg_url || '',
        cpf_url: userProfile?.cpf_url || '',
        titulo_eleitor_url: userProfile?.titulo_eleitor_url || '',
        reservista_url: userProfile?.reservista_url || '',
        ctps_url: userProfile?.ctps_url || '',
        certidao_nascimento_url: userProfile?.certidao_nascimento_url || '',
        certidao_casamento_url: userProfile?.certidao_casamento_url || '',
        comprovante_residencia_url: userProfile?.comprovante_residencia_url || '',
        comprovante_escolaridade_url: userProfile?.comprovante_escolaridade_url || '',
        exame_admissional_url: userProfile?.exame_admissional_url || '',
        foto_3x4_url: userProfile?.foto_3x4_url || '',
        cnh_url: userProfile?.cnh_url || '',
        cartao_pis_url: userProfile?.cartao_pis_url || '',
        ja_admitido_anteriormente: userProfile?.ja_admitido_anteriormente ?? false,
    };

    reset(resetValues);
  }, [profileToEdit, isNewClient, reset, clientProfile, userProfile]);

  const handleSelectAll = (select: boolean) => {
    PERMISSOES_DISPONIVEIS.forEach((p: Permissao) => {
      setValue(`permissoes.${p.key}`, select, { shouldDirty: true });
    });
  };
  
  const handleTagToggle = useCallback(() => {
      refetchStatus();
  }, [refetchStatus]);
  
  const handleLogoUploadComplete = useCallback(async (url: string | null) => {
      setValue('assinatura_proprietario_url', url || '', { shouldDirty: true });
      if (isEditingClientProfile) {
          await supabase.from('tbl_clientes').update({ logo_url: url || null }).eq('id', clientProfile!.id);
      }
  }, [setValue, isEditingClientProfile, clientProfile]);

  const handleSyncUrl = useCallback((url: string | null) => {
      setValue('assinatura_proprietario_url', url || '', { shouldDirty: true });
  }, [setValue]);
  
  const handleAvatarUploadComplete = useCallback(async (url: string | null) => {
      setValue('avatar_url', url || null, { shouldDirty: true });
  }, [setValue]);
  
  const isContractEditable = criadorRole === 'Admin' || criadorRole === 'Cliente' || criadorRole === 'Usuario';

  const onSubmit = async (values: FormValues) => {
    if (isReadOnly) {
        showError('O perfil está em modo somente leitura.');
        return;
    }
    
    setIsSubmitting(true);
    const isSelfEditing = isEditing && usuarioInicial?.id === criadorPerfil?.id;
    let proprietarioId: string | null = null;
    let isAdminContext = false;
    
    if (criadorRole === 'Admin') {
        proprietarioId = criadorPerfil?.id || null;
        isAdminContext = true;
    } else if (criadorRole === 'Cliente') {
        proprietarioId = (criadorPerfil as ClienteProfile)?.id || null;
        isAdminContext = false;
    } else if (criadorRole === 'Usuario') {
        const userPerfil = criadorPerfil as UsuarioProfile | AdminUsuarioProfile;
        if ('admin_id' in userPerfil && userPerfil.admin_id) {
            proprietarioId = userPerfil.admin_id;
            isAdminContext = true;
        } else if ('cliente_id' in userPerfil && userPerfil.cliente_id) {
            proprietarioId = userPerfil.cliente_id;
            isAdminContext = false;
        }
    }
    
    if (!proprietarioId) {
        showError('ID do proprietário não pôde ser determinado.');
        setIsSubmitting(false);
        return;
    }

    try {
        let userId = usuarioInicial?.id;
        let isNewAuthUser = false;
        
        if (!isEditing) {
            if (!values.senha) {
                showError('A senha é obrigatória para novos usuários.');
                setIsSubmitting(false);
                return;
            }
            
            const targetRole = isNewClient ? 'Cliente' : 'Usuario';
            const metadata: Record<string, any> = { role: targetRole, nome: values.nome };
            
            if (targetRole === 'Usuario') {
                metadata.proprietario_id = proprietarioId;
            } else if (targetRole === 'Cliente') {
                metadata.aprovado = false;
            }
            
            const { data, error: invokeError } = await supabase.functions.invoke('create-user-admin', {
                body: { email: values.email, password: values.senha, user_metadata: metadata },
            });
            
            if (invokeError) throw invokeError;
            if (data?.error) throw new Error(data.error);
            userId = data.userId;
            isNewAuthUser = true;
        }
        
        if (!userId) throw new Error('Falha ao obter ID do usuário.');

        if (isEditingClientProfile || isNewClient) {
            const dataToUpdate: any = {
                avatar_url: values.avatar_url || null,
                nome: values.nome,
                email: values.email,
                admin_id: isAdminContext ? proprietarioId : (criadorPerfil as ClienteProfile)?.admin_id,
                limite_usuarios: values.limite_usuarios ?? 5,
                ...(isSelfEditing ? {} : { permissoes: values.permissoes }),
                plano_id: values.plano_id || null,
                data_fim_acesso: values.data_fim_acesso ? format(values.data_fim_acesso, 'yyyy-MM-dd') + 'T12:00:00Z' : null,
                razao_social: values.razao_social || null,
                nome_fantasia: values.nome_fantasia || null,
                documento: values.documento || null,
                cnpj: values.cnpj || null,
                cpf: values.cpf || null,
                rg: values.rg || null,
                telefone: values.telefone || null,
                cep: values.cep || null,
                endereco: values.endereco || null,
                numero: values.numero || null,
                complemento: values.complemento || null,
                bairro: values.bairro || null,
                cidade: values.cidade || null,
                estado: values.estado || null,
                assinatura_proprietario_nome: values.assinatura_proprietario_nome || null,
                assinatura_proprietario_url: values.assinatura_proprietario_url || null,
            };
            
            const { error } = await supabase.from('tbl_clientes').upsert({ ...dataToUpdate, id: userId }, { onConflict: 'id' });
            if (error) throw error;
            
        } else {
            const tabelaDestino = isAdminContext ? 'admin_usuarios' : 'tbl_usuarios';
            const dataToUpdate: any = { 
                avatar_url: values.avatar_url || null,
                nome: values.nome,
                ...(isSelfEditing ? {} : { permissoes: values.permissoes }),
                dias_folga_fixos: values.dias_folga_fixos || [],
                folga_domingo_obrigatoria: values.folga_domingo_obrigatoria,
                salario: values.salario,
                horas_semanais: values.horas_semanais,
                horas_mensais: values.horas_mensais,
                data_inicio_contrato: values.data_inicio_contrato ? format(values.data_inicio_contrato, 'yyyy-MM-dd') : null,
                data_fim_contrato: values.data_fim_contrato ? format(values.data_fim_contrato, 'yyyy-MM-dd') : null,
                data_inicio_aviso: values.data_inicio_aviso ? format(values.data_inicio_aviso, 'yyyy-MM-dd') : null,
                tipo_aviso: values.tipo_aviso === 'Nenhum' ? null : values.tipo_aviso,
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
                ...(isNewAuthUser && (isAdminContext ? { admin_id: proprietarioId } : { cliente_id: proprietarioId })),
            };
            
            const { error } = await supabase.from(tabelaDestino).upsert({ ...dataToUpdate, id: userId, email: values.email }, { onConflict: 'id' });
            if (error) throw error;
            
            if (isEditing && values.senha) {
                const { error: authError } = await supabase.auth.updateUser({ password: values.senha });
                if (authError) throw authError;
            }
        }

        showSuccess(`${isNewClient ? 'Cliente' : 'Usuário'} salvo com sucesso!`);
        if (isNewAuthUser) {
            await supabase.auth.resetPasswordForEmail(values.email, { redirectTo: `${BASE_URL}/atualizar-senha` });
        }
        refetchStatus();
        onSaveComplete();
    } catch (error: any) {
        showError(`Falha ao salvar: ${error.message}`);
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const isSelfEditUsuario = criadorRole === 'Usuario' && isEditing && usuarioInicial?.id === criadorPerfil?.id;
  const isChildFormReadOnly = (tabValue: string) => isReadOnly || (isSelfEditUsuario && (tabValue !== 'pessoal' && tabValue !== 'cadastrais' && tabValue !== 'documentos'));
  const shouldShowSaveButton = !isReadOnly && (!isSelfEditUsuario || ['pessoal', 'cadastrais', 'documentos'].includes(activeTab));
  
  if (isEditingClientProfile) {
      return (
        <FormProvider {...form}>
            <Form {...form}>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="flex flex-wrap justify-start w-full h-auto p-1">
                            <TabsTrigger value="pessoal" className="flex-1 md:flex-none md:w-1/4">Geral</TabsTrigger>
                            <TabsTrigger value="identificacao" className="flex-1 md:flex-none md:w-1/4">Identificação</TabsTrigger>
                            <TabsTrigger value="contato" className="flex-1 md:flex-none md:w-1/4">Contato</TabsTrigger>
                            <TabsTrigger value="endereco" className="flex-1 md:flex-none md:w-1/4">Endereço</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="pessoal" className="mt-4 space-y-4 p-4">
                            <AvatarUpload entityId={clientProfile!.id} bucketName="avatars" initialAvatarUrl={watch('avatar_url')} onUploadComplete={handleAvatarUploadComplete} isReadOnly={isSubmitting || isReadOnly} />
                            <FormField control={form.control} name="nome" render={({ field }) => ( <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField control={form.control} name="email" render={({ field }) => ( <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} disabled /></FormControl><FormMessage /></FormItem> )} />
                            
                            <Separator />
                            <h3 className="font-semibold text-lg flex items-center"><FileSignature className="w-4 h-4 mr-2" /> Assinatura e Branding</h3>
                            <FormField control={form.control} name="assinatura_proprietario_nome" render={({ field }) => ( <FormItem><FormLabel>Nome da Empresa para Assinatura</FormLabel><FormControl><Input {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem> )} />
                            <LogoUpload ownerId={clientProfile!.id} tableName="tbl_clientes" initialLogoUrl={watch('assinatura_proprietario_url')} onUploadComplete={handleLogoUploadComplete} onSyncUrl={handleSyncUrl} isReadOnly={isSubmitting || isReadOnly} />
                            
                            <Separator />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField control={form.control} name="plano_id" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Plano</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || isReadOnly || isClientEditLocked}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Selecione o plano" /></SelectTrigger></FormControl>
                                            <SelectContent>{planos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <FormField control={form.control} name="data_fim_acesso" render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Data Limite</FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild><FormControl><Button variant="outline" className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground')} disabled={isSubmitting || isReadOnly || isClientEditLocked}>{field.value ? format(field.value as Date, 'PPP', { locale: ptBR }) : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger>
                                            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value as Date} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent>
                                        </Popover>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            </div>
                        </TabsContent>
                        
                        <TabsContent value="identificacao" className="mt-4 p-4"><FormIdentificacao control={control as unknown as Control<any>} clienteId={clientProfile?.id} isSubmitting={isSubmitting} tagRefreshKey={refreshKey} onTagToggle={handleTagToggle} /></TabsContent>
                        <TabsContent value="contato" className="mt-4 p-4"><FormContato control={control as unknown as Control<any>} clienteId={clientProfile?.id} isSubmitting={isSubmitting} tagRefreshKey={refreshKey} onTagToggle={handleTagToggle} /></TabsContent>
                        <TabsContent value="endereco" className="mt-4 p-4"><FormEndereco control={control as unknown as Control<any>} clienteId={clientProfile?.id} isSubmitting={isSubmitting} tagRefreshKey={refreshKey} onTagToggle={handleTagToggle} /></TabsContent>
                    </Tabs>
                    <Button type="submit" className="w-full" disabled={isSubmitting || isReadOnly}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar Alterações</Button>
                </form>
            </Form>
        </FormProvider>
      );
  }

  return (
    <FormProvider {...form}>
      <Form {...form}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex flex-wrap justify-start w-full h-auto p-1">
              <TabsTrigger value="pessoal" className="flex-1 md:flex-none md:w-1/6">Geral</TabsTrigger>
              <TabsTrigger value="folgas" className="flex-1 md:flex-none md:w-1/6">Folgas</TabsTrigger>
              <TabsTrigger value="ferias" className="flex-1 md:flex-none md:w-1/6">Férias</TabsTrigger>
              <TabsTrigger value="cadastrais" className="flex-1 md:flex-none md:w-1/6">Dados Cadastrais</TabsTrigger>
              <TabsTrigger value="documentos" className="flex-1 md:flex-none md:w-1/6">Documentos</TabsTrigger>
              <TabsTrigger value="contrato" className="flex-1 md:flex-none md:w-1/6">Contrato (RH)</TabsTrigger>
            </TabsList>
            
            <TabsContent value="pessoal" className="mt-4 space-y-4 p-4">
                <AvatarUpload entityId={userProfile?.id || ''} bucketName="avatars" initialAvatarUrl={watch('avatar_url')} onUploadComplete={handleAvatarUploadComplete} isReadOnly={isSubmitting || isChildFormReadOnly('pessoal')} />
                <FormGeral control={control} isSubmitting={isSubmitting} handleSelectAll={handleSelectAll} isReadOnly={isChildFormReadOnly('pessoal')} isEditingSelfPermissions={isSelfEditUsuario && activeTab === 'pessoal'} />
                <Separator /><h3 className="font-semibold text-lg">Acesso e Login</h3>
                <FormField control={control} name="email" render={({ field }) => ( <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} disabled={isEditing || isChildFormReadOnly('pessoal')} /></FormControl><FormMessage /></FormItem> )} />
                <FormField control={control} name="senha" render={({ field }) => ( <FormItem><FormLabel>{isEditing ? 'Alterar Senha' : 'Criar Senha'}</FormLabel><FormControl><Input type="password" {...field} disabled={isChildFormReadOnly('pessoal')} /></FormControl><FormMessage /></FormItem> )} />
            </TabsContent>
            
            <TabsContent value="folgas" className="mt-4 p-4"><FormFolgas control={control as unknown as Control<any>} isSubmitting={isSubmitting} usuarioInicial={userProfile} isReadOnly={isChildFormReadOnly('folgas')} /></TabsContent>
            <TabsContent value="ferias" className="mt-4 p-4"><FormFerias usuarioInicial={userProfile} isReadOnly={isChildFormReadOnly('ferias')} /></TabsContent>
            <TabsContent value="cadastrais" className="mt-4 p-4"><FormDadosCadastrais control={control as unknown as Control<any>} isSubmitting={isSubmitting} resourceId={resourceId} tagRefreshKey={refreshKey} onTagToggle={handleTagToggle} isReadOnly={isChildFormReadOnly('cadastrais')} isAddressLoading={isAddressLoading} /></TabsContent>
            <TabsContent value="documentos" className="mt-4 p-4"><FormDocumentos control={control as unknown as Control<any>} isSubmitting={isSubmitting} resourceId={resourceId} isReadOnly={isChildFormReadOnly('documentos')} /></TabsContent>
            <TabsContent value="contrato" className="mt-4 p-4"><FormDadosContratuais control={control as unknown as Control<any>} isSubmitting={isSubmitting} isContractEditable={isContractEditable} isReadOnly={isChildFormReadOnly('contrato')} /></TabsContent>
          </Tabs>
          {shouldShowSaveButton && <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar Alterações</Button>}
        </form>
      </Form>
    </FormProvider>
  );
};

export default FormUsuario;