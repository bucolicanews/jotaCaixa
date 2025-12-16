import React, { useState, useCallback, useEffect } from 'react';
import { useForm, FormProvider, Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Loader2, Tag, FileSignature, CalendarIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, ClienteProfile, UsuarioProfile, UserRole, AdminUsuarioProfile } from '@/types/usuario';
import { PERMISSOES_DISPONIVEIS, Permissao } from '@/config/permissoes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import FormDadosCadastrais from '../usuario-forms/FormDadosCadastrais';
import { Input } from '../ui/input';
import { FormField, FormItem, FormLabel, FormControl, FormMessage, Form } from '../ui/form';
import { useBulkTagManager } from '@/hooks/use-bulk-tag-manager';
import { format } from 'date-fns';
import { BASE_URL } from '@/config/app-config';
import { Separator } from '../ui/separator';
import FormGeral from '../formularios/FormGeral';
import FormFolgas from '../formularios/FormFolgas';
import FormDocumentos from '../usuario-forms/FormDocumentos';
import FormDadosContratuais from '../usuario-forms/FormDadosContratuais';
import FormFerias from '@/components/usuario-forms/FormFerias';
import LogoUpload from '../LogoUpload'; // Importado para Cliente Profile
import { Checkbox } from '../ui/checkbox'; // IMPORT CORRIGIDO
import FormIdentificacao from '../cliente-forms/FormIdentificacao'; // NOVO IMPORT
import FormContato from '../cliente-forms/FormContato'; // NOVO IMPORT
import FormEndereco from '../cliente-forms/FormEndereco'; // NOVO IMPORT
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Plano } from '@/types/plano';

const textOptional = z.string().optional().or(z.literal(''));
const urlSchema = z.string().url('URL inválida.').optional().or(z.literal(''));

const formSchema = z.object({
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
  
  // NOVOS CAMPOS DE CLIENTE (Apenas para isNewClient ou Cliente Profile)
  razao_social: textOptional,
  nome_fantasia: textOptional,
  documento: textOptional,
  cnpj: textOptional,
  plano_id: z.string().optional(),
  
  // NOVOS CAMPOS DE ASSINATURA (Apenas para Cliente Profile)
  assinatura_proprietario_nome: textOptional,
  assinatura_proprietario_url: textOptional,
  
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
  isNewClient?: boolean;
  isReadOnly?: boolean;
  planos?: Plano[];
}

// Type guard para verificar se o perfil é UsuarioProfile
const isUsuarioProfile = (profile: AnyProfile): profile is UsuarioProfile => {
    return !!profile && 'cliente_id' in profile && profile.cliente_id !== null;
};

// Type guard para verificar se o perfil é AdminUsuarioProfile
const isAdminUsuarioProfile = (profile: AnyProfile): profile is AdminUsuarioProfile => {
    return !!profile && 'admin_id' in profile && profile.admin_id !== null;
};

// Type guard para verificar se o perfil é ClienteProfile
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
        nome: '',
        email: '',
        senha: '',
        permissoes: {},
        limite_usuarios: 5,
        plano_id: undefined,
        data_fim_acesso: undefined,
    },
  });
  
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const { watch, setValue } = form;
  const cepValue = watch('cep');
  const isAddressLoading = watch('endereco') === 'Buscando...';
  
  const handleCepLookup = useCallback(async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) {
      return;
    }
    
    // Bloqueia a edição dos campos enquanto busca
    setValue('endereco', 'Buscando...');
    setValue('bairro', 'Buscando...');
    setValue('cidade', 'Buscando...');
    setValue('estado', 'Buscando...');
    
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();

      if (data.erro) {
        showError('CEP não encontrado.');
        setValue('endereco', '');
        setValue('bairro', '');
        setValue('cidade', '');
        setValue('estado', '');
        return;
      }

      // Preenche os campos
      setValue('endereco', data.logradouro || '');
      setValue('bairro', data.bairro || '');
      setValue('cidade', data.localidade || '');
      setValue('estado', data.uf || '');
      
    } catch (error) {
      console.error('Erro ao consultar ViaCEP:', error);
      showError('Falha ao consultar o CEP.');
      setValue('endereco', '');
      setValue('bairro', '');
      setValue('cidade', '');
      setValue('estado', '');
    }
  }, [setValue]);
  
  // Monitora a mudança do CEP para buscar o endereço
  useEffect(() => {
    const cleanCep = cepValue?.replace(/\D/g, '');
    
    if (cleanCep && cleanCep.length === 8) {
      handleCepLookup(cleanCep);
    } else if (cleanCep && cleanCep.length > 0 && cleanCep.length < 8) {
      // Limpa os campos de endereço se o CEP estiver incompleto
      setValue('endereco', '');
      setValue('bairro', '');
      setValue('cidade', '');
      setValue('estado', '');
    }
  }, [cepValue, handleCepLookup, setValue]);


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
        nome: profileToEdit?.nome || '',
        email: profileToEdit?.email || '',
        senha: '',
        permissoes: defaultPermissoes,
        
        // Dados de Cliente Profile
        limite_usuarios: clientProfile?.limite_usuarios || 5,
        plano_id: clientProfile?.plano_id || undefined,
        data_fim_acesso: parseDate(clientProfile?.data_fim_acesso),
        razao_social: clientProfile?.razao_social || '',
        nome_fantasia: clientProfile?.nome_fantasia || '',
        documento: clientProfile?.documento || '',
        cnpj: clientProfile?.cnpj || '',
        assinatura_proprietario_nome: clientProfile?.assinatura_proprietario_nome || clientProfile?.nome || '',
        assinatura_proprietario_url: clientProfile?.assinatura_proprietario_url || clientProfile?.logo_url || '',
        
        // Dados de Usuário Profile
        dias_folga_fixos: userProfile?.dias_folga_fixos || ['Saturday', 'Sunday'],
        folga_domingo_obrigatoria: userProfile?.folga_domingo_obrigatoria ?? true,
        salario: userProfile?.salario || 0,
        horas_semanais: userProfile?.horas_semanais || 44,
        horas_mensais: userProfile?.horas_mensais || 220,
        data_inicio_contrato: parseDate(userProfile?.data_inicio_contrato),
        data_fim_contrato: parseDate(userProfile?.data_fim_contrato),
        data_inicio_aviso: parseDate(userProfile?.data_inicio_aviso),
        tipo_aviso: (userProfile?.tipo_aviso || 'Nenhum') as FormValues['tipo_aviso'],
        
        // Dados Cadastrais (Comum)
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
        
        // Documentos (URLs)
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

    form.reset(resetValues);
  }, [profileToEdit, isNewClient]);

  const handleSelectAll = (select: boolean) => {
    PERMISSOES_DISPONIVEIS.forEach((p: Permissao) => {
      form.setValue(`permissoes.${p.key}`, select, { shouldDirty: true });
    });
  };
  
  const handleTagToggle = useCallback(() => {
      refetchStatus();
  }, [refetchStatus]);
  
  // NOVO HANDLER: Sincroniza a URL da Logo com o campo de assinatura
  const handleLogoUploadComplete = useCallback(async (url: string | null) => {
      // Atualiza o campo de URL da assinatura com a nova URL da logo
      form.setValue('assinatura_proprietario_url', url || '');
      // Se for Cliente Profile, atualiza o logo_url também
      if (isEditingClientProfile) {
          await supabase.from('tbl_clientes').update({ logo_url: url || null }).eq('id', clientProfile!.id);
      }
  }, [form, isEditingClientProfile, clientProfile]);
  
  // NOVO HANDLER: Sincroniza a URL da Logo com o campo de assinatura (usado pelo checkbox)
  const handleSyncUrl = useCallback((url: string | null) => {
      form.setValue('assinatura_proprietario_url', url || '');
  }, [form]);
  
  const isContractEditable = criadorRole === 'Admin' || criadorRole === 'Cliente' || criadorRole === 'Usuario';

  const onSubmit = async (values: FormValues) => {
    if (isReadOnly) {
        showError('O perfil está em modo somente leitura.');
        return;
    }
    
    setIsSubmitting(true);
    
    // Determina o proprietarioId baseado no role do criador
    let proprietarioId: string | null = null;
    let isAdminContext = false; // Flag para saber se estamos no contexto de Admin
    
    if (criadorRole === 'Admin') {
        proprietarioId = criadorPerfil?.id || null;
        isAdminContext = true;
    } else if (criadorRole === 'Cliente') {
        proprietarioId = (criadorPerfil as ClienteProfile)?.id || null;
        isAdminContext = false;
    } else if (criadorRole === 'Usuario') {
        // Funcionário do Admin ou Cliente
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
        
        // 1. Handle New User Creation (Auth) - USANDO EDGE FUNCTION
        if (!isEditing) {
            if (!values.senha) {
                showError('A senha é obrigatória para novos usuários.');
                return;
            }
            
            const { data: emailDisponivel, error: emailError } = await supabase.rpc('email_disponivel', { p_email: values.email });
            if (emailError) {
                showError('Erro ao verificar email: ' + emailError.message);
                setIsSubmitting(false);
                return;
            }
            if (!emailDisponivel) {
                showError('Este email já está cadastrado no sistema. Utilize outro email.');
                setIsSubmitting(false);
                return;
            }
            
            const targetRole = isNewClient ? 'Cliente' : 'Usuario';
            const metadata: Record<string, any> = { 
                role: targetRole, 
                nome: values.nome, 
            };
            
            if (targetRole === 'Usuario') {
                if (criadorRole === 'Admin') {
                    metadata.proprietario_id = proprietarioId;
                } else {
                    metadata.proprietario_id = proprietarioId;
                }
            } else if (targetRole === 'Cliente') {
                metadata.aprovado = false;
            }
            
            const { data, error: invokeError } = await supabase.functions.invoke('create-user-admin', {
                body: {
                    email: values.email,
                    password: values.senha,
                    user_metadata: metadata,
                },
            });
            
            if (invokeError) throw invokeError;
            if (data?.error) throw new Error(data.error);
            
            userId = data.userId;
            isNewAuthUser = true;
        }
        
        if (!userId) throw new Error('Falha ao obter ID do usuário.');

        // 2. Prepare Data Payload (tbl_usuarios OU tbl_clientes OU admin_usuarios)
        
        if (isEditingClientProfile || isNewClient) {
            const planoIdAtualizado = values.plano_id ?? clientProfile?.plano_id ?? null;
            const dataFimAcessoIso = values.data_fim_acesso
                ? format(values.data_fim_acesso, 'yyyy-MM-dd') + 'T12:00:00Z'
                : clientProfile?.data_fim_acesso || null;
            const limiteUsuariosAtualizado = values.limite_usuarios ?? clientProfile?.limite_usuarios ?? 5;
            // Edição de Cliente Profile (tbl_clientes)
            const dataToUpdate: Partial<ClienteProfile> = {
                nome: values.nome,
                email: values.email,
                admin_id: isAdminContext ? proprietarioId : (criadorPerfil as ClienteProfile)?.admin_id,
                aprovado: isEditingClientProfile ? clientProfile!.aprovado : false,
                limite_usuarios: limiteUsuariosAtualizado,
                permissoes: values.permissoes,
                plano_id: planoIdAtualizado,
                data_fim_acesso: dataFimAcessoIso,
                
                razao_social: values.razao_social || null,
                nome_fantasia: values.nome_fantasia || null,
                documento: values.documento || null,
                cnpj: values.cnpj || null,
                
                // Dados Cadastrais
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
                
                // Assinatura e Branding
                assinatura_proprietario_nome: values.assinatura_proprietario_nome || null,
                assinatura_proprietario_url: values.assinatura_proprietario_url || null,
                logo_url: values.assinatura_proprietario_url || null,
            };
            
            const { error } = await supabase.from('tbl_clientes').upsert({ ...dataToUpdate, id: userId }, { onConflict: 'id' });
            if (error) throw error;
            
        } else if (isEditingUser || isNewAuthUser) {
            // Edição de Usuário (tbl_usuarios ou admin_usuarios)
            const tabelaDestino = isAdminContext ? 'admin_usuarios' : 'tbl_usuarios';
            
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
                
                // Vinculação (apenas se for novo)
                ...(isNewAuthUser && tabelaDestino === 'tbl_usuarios' && { cliente_id: proprietarioId }),
                ...(isNewAuthUser && tabelaDestino === 'admin_usuarios' && { admin_id: proprietarioId }),
                
                // Se for edição de AdminUsuario, garante que o admin_id seja mantido no payload
                ...(isEditing && tabelaDestino === 'admin_usuarios' && { admin_id: (usuarioInicial as AdminUsuarioProfile)?.admin_id }),
            };
            
            const { error } = await supabase.from(tabelaDestino).upsert({ ...dataToUpdate, id: userId, email: values.email }, { onConflict: 'id' });
            if (error) throw error;
            
            if (isEditing && values.senha) {
                const { error: authError } = await supabase.auth.updateUser({ password: values.senha });
                if (authError) throw authError;
            }
        }

        showSuccess(`${isNewClient ? 'Cliente' : 'Usuário'} ${isEditing ? 'atualizado' : 'criado'} com sucesso!`);
        
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
        const msg = error.message?.toLowerCase() || '';
        if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('duplicate')) {
            showError('Este email já está cadastrado. Utilize outro email ou redefina a senha do usuário existente.');
        } else if (msg.includes('password') && msg.includes('6')) {
            showError('A senha deve ter no mínimo 6 caracteres.');
        } else if (msg.includes('invalid email')) {
            showError('O formato do email é inválido.');
        } else {
            showError(`Falha ao salvar: ${error.message}`);
        }
    } finally {
        setIsSubmitting(false);
    }
  };
  
  // --- Lógica de Read-Only para Tabs ---
  // isSelfEditUsuario: Quando um funcionário está editando seu PRÓPRIO perfil (não criando/editando outro)
  const isSelfEditUsuario = criadorRole === 'Usuario' && isEditing && usuarioInicial?.id === criadorPerfil?.id;
  
  // NOVO HANDLER: Intercepta a mudança de aba para bloquear se estiver desabilitada
  const handleTabChange = (newTab: string) => {
      setActiveTab(newTab);
  };
  
  // Read-Only status para os componentes filhos
  const isChildFormReadOnly = (tabValue: string) => {
      // 1. Se o modo read-only global (passado pelo gestor) estiver ativo, todos os filhos são read-only.
      if (isReadOnly) return true; 
      
      // 2. Se for edição de perfil de funcionário por ele mesmo
      if (isSelfEditUsuario) {
          // Apenas 'cadastrais' deve ser editável. Todos os outros são read-only.
          return tabValue !== 'cadastrais';
      }
      
      return false;
  };
  
  // 3. Controla a visibilidade do botão de salvar
  const shouldShowSaveButton = !isReadOnly && (!isSelfEditUsuario || activeTab === 'cadastrais');
  
  // Se for Cliente Profile, remove as abas de RH
  if (isEditingClientProfile) {
      const clientTabs = [
          { value: 'pessoal', label: 'Geral', component: FormGeral },
          { value: 'identificacao', label: 'Identificação', component: FormIdentificacao },
          { value: 'contato', label: 'Contato', component: FormContato },
          { value: 'endereco', label: 'Endereço', component: FormEndereco },
      ];
      
      return (
        <FormProvider {...form}>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                        <TabsList className="flex flex-wrap justify-start w-full h-auto p-1">
                            {clientTabs.map(tab => (
                                <TabsTrigger key={tab.value} value={tab.value} className="flex-1 md:flex-none md:w-1/4">{tab.label}</TabsTrigger>
                            ))}
                        </TabsList>
                        
                        {/* TAB 1: GERAL (CLIENTE PROFILE) */}
                        <TabsContent value="pessoal" className="mt-4 space-y-4 p-4">
                            <FormField control={form.control} name="nome" render={({ field }) => (
                                <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input placeholder="Nome completo" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="email" render={({ field }) => (
                                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="email@exemplo.com" {...field} disabled /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="senha" render={({ field }) => (
                                <FormItem><FormLabel>Alterar Senha (Opcional)</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} disabled={isReadOnly || isEditingClientProfile} /></FormControl><FormMessage /></FormItem>
                            )} />
                            
                            <Separator />
                            <h3 className="font-semibold text-lg flex items-center"><FileSignature className="w-4 h-4 mr-2" /> Assinatura e Branding</h3>
                            
                            <FormField control={form.control} name="assinatura_proprietario_nome" render={({ field }) => (
                                <FormItem><FormLabel>Nome da Empresa/Pessoa para Assinatura</FormLabel><FormControl><Input placeholder="Ex: Minha Empresa LTDA" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                            )} />
                            
                            <FormField control={form.control} name="assinatura_proprietario_url" render={({ field }) => (
                                <FormItem><FormLabel>URL da Imagem de Assinatura (Logo)</FormLabel><FormControl><Input placeholder="URL da imagem de assinatura" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                            )} />
                            
                            <LogoUpload 
                                ownerId={clientProfile!.id}
                                tableName={'tbl_clientes'}
                                initialLogoUrl={form.watch('assinatura_proprietario_url')}
                                onUploadComplete={handleLogoUploadComplete}
                                onSyncUrl={handleSyncUrl} // NOVO PROP
                                isReadOnly={isSubmitting || isReadOnly}
                            />
                            
                            <Separator />
                            <h3 className="font-semibold text-lg">Configurações da Empresa</h3>
                            <FormField control={form.control} name="limite_usuarios" render={({ field }) => (
                                <FormItem><FormLabel>Limite de Usuários</FormLabel><FormControl><Input type="number" placeholder="5" {...field} disabled={isReadOnly || isClientEditLocked} /></FormControl><FormMessage /></FormItem>
                            )} />
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField control={form.control} name="plano_id" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Plano de Assinatura</FormLabel>
                                        <FormControl>
                                            <Select
                                                onValueChange={(value) => field.onChange(value)}
                                                value={field.value ?? ''}
                                                disabled={isSubmitting || isReadOnly || planos.length === 0 || isClientEditLocked}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder={planos.length ? 'Selecione o plano' : 'Nenhum plano carregado'} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {planos.map((plano) => (
                                                        <SelectItem key={plano.id} value={plano.id}>
                                                            {plano.nome}
                                                            {plano.preco_mensal > 0 ? ` (${formatCurrency(plano.preco_mensal)})` : ' (Grátis)'}
                                                            {!plano.visivel_vendas && ' (Interno)'}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <FormField control={form.control} name="data_fim_acesso" render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Data Limite de Acesso</FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button
                                                        variant="outline"
                                                        className={cn(
                                                            'w-full pl-3 text-left font-normal',
                                                            !field.value && 'text-muted-foreground'
                                                        )}
                                                        disabled={isSubmitting || isReadOnly || isClientEditLocked}
                                                    >
                                                        {field.value ? format(field.value as Date, 'PPP', { locale: ptBR }) : <span>Escolha a data</span>}
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
                                )} />
                            </div>
                            
                            <div className="space-y-2 pt-4">
                                <div className="flex justify-between items-center mb-1">
                                    <FormLabel>Permissões de Acesso</FormLabel>
                                    <div className="space-x-2">
                                        <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(true)} className="p-0 h-auto" disabled={isSubmitting || isReadOnly || (isEditingClientProfile && criadorRole !== 'Admin')}>Selecionar Todos</Button>
                                        <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(false)} className="p-0 h-auto text-destructive" disabled={isSubmitting || isReadOnly || (isEditingClientProfile && criadorRole !== 'Admin')}>Desmarcar Todos</Button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                                    {PERMISSOES_DISPONIVEIS.filter((p: Permissao) => p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto').map((p: Permissao) => (
                                        <FormField key={p.key} control={form.control} name={`permissoes.${p.key}`} render={({ field }) => (
                                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting || isReadOnly || (isEditingClientProfile && criadorRole !== 'Admin')} /></FormControl>
                                                <FormLabel className="font-normal">{p.label}</FormLabel>
                                            </FormItem>
                                        )} />
                                    ))}
                                </div>
                            </div>
                        </TabsContent>
                        
                        {/* TAB 2: IDENTIFICAÇÃO (CLIENTE PROFILE) */}
                        <TabsContent value="identificacao" className="mt-4 space-y-6 p-4">
                            <FormIdentificacao
                                control={form.control as unknown as Control<any>}
                                clienteId={clientProfile?.id}
                                isSubmitting={isSubmitting}
                                tagRefreshKey={refreshKey}
                                onTagToggle={handleTagToggle}
                            />
                        </TabsContent>
                        
                        {/* TAB 3: CONTATO (CLIENTE PROFILE) */}
                        <TabsContent value="contato" className="mt-4 space-y-6 p-4">
                            <FormContato
                                control={form.control as unknown as Control<any>}
                                clienteId={clientProfile?.id}
                                isSubmitting={isSubmitting}
                                tagRefreshKey={refreshKey}
                                onTagToggle={handleTagToggle}
                            />
                        </TabsContent>
                        
                        {/* TAB 4: ENDEREÇO (CLIENTE PROFILE) */}
                        <TabsContent value="endereco" className="mt-4 space-y-6 p-4">
                            <FormEndereco
                                control={form.control as unknown as Control<any>}
                                clienteId={clientProfile?.id}
                                isSubmitting={isSubmitting}
                                tagRefreshKey={refreshKey}
                                onTagToggle={handleTagToggle}
                            />
                        </TabsContent>
                    </Tabs>
                    
                    <Button type="submit" className="w-full" disabled={isSubmitting || isReadOnly}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Salvar Alterações
                    </Button>
                </form>
            </Form>
        </FormProvider>
      );
  }

  // --- RENDERIZAÇÃO PARA USUÁRIO (FUNCIONÁRIO) ---
  return (
    <FormProvider {...form}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="flex flex-wrap justify-start w-full h-auto p-1">
              <TabsTrigger value="pessoal" className="flex-1 md:flex-none md:w-1/6">Geral</TabsTrigger>
              <TabsTrigger value="folgas" className="flex-1 md:flex-none md:w-1/6">Folgas</TabsTrigger>
              <TabsTrigger value="ferias" className="flex-1 md:flex-none md:w-1/6">Férias</TabsTrigger>
              <TabsTrigger value="cadastrais" className="flex-1 md:flex-none md:w-1/6">Dados Cadastrais</TabsTrigger>
              <TabsTrigger value="documentos" className="flex-1 md:flex-none md:w-1/6">Documentos</TabsTrigger>
              <TabsTrigger value="contrato" className="flex-1 md:flex-none md:w-1/6">Contrato (RH)</TabsTrigger>
            </TabsList>
            
            {/* TAB 1: GERAL */}
            <TabsContent value="pessoal" className="mt-4 space-y-4 p-4">
              <FormGeral
                  control={form.control}
                  isSubmitting={isSubmitting}
                  handleSelectAll={handleSelectAll}
                  isReadOnly={isChildFormReadOnly('pessoal')}
              />
              
              {/* Campos de Login (Apenas para criação ou alteração de senha) */}
              <Separator />
              <h3 className="font-semibold text-lg">Acesso e Login</h3>
              <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email (Login)</FormLabel><FormControl><Input type="email" placeholder="email@exemplo.com" {...field} disabled={isEditing || isChildFormReadOnly('pessoal')} /></FormControl><FormMessage /></FormItem>
              )} />
              {!isEditing && <FormField control={form.control} name="senha" render={({ field }) => (
                  <FormItem><FormLabel>Criar Senha</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} disabled={isChildFormReadOnly('pessoal')} /></FormControl><FormMessage /></FormItem>
              )} />}
              {isEditing && <FormField control={form.control} name="senha" render={({ field }) => (
                  <FormItem><FormLabel>Alterar Senha (Opcional)</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} disabled={isChildFormReadOnly('pessoal')} /></FormControl><FormMessage /></FormItem>
              )} />}
            </TabsContent>
            
            {/* TAB 2: FOLGAS FIXAS */}
            <TabsContent value="folgas" className="mt-4 space-y-6 p-4">
                <FormFolgas
                    control={form.control as unknown as Control<any>}
                    isSubmitting={isSubmitting}
                    usuarioInicial={userProfile}
                    isReadOnly={isChildFormReadOnly('folgas')}
                />
            </TabsContent>
            
            {/* TAB 3: FÉRIAS (CRUD) */}
            <TabsContent value="ferias" className="mt-4 space-y-6 p-4">
                <FormFerias
                    usuarioInicial={userProfile}
                    isReadOnly={isChildFormReadOnly('ferias')}
                />
            </TabsContent>

            {/* TAB 4: DADOS CADASTRAIS (EDITÁVEL) */}
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
                    isReadOnly={isChildFormReadOnly('cadastrais')}
                    isClientScope={false} // Escopo de Usuário
                    isAddressLoading={isAddressLoading} // Passa o estado de carregamento
                />
            </TabsContent>
            
            {/* TAB 5: DOCUMENTOS DE ADMISSÃO */}
            <TabsContent value="documentos" className="mt-4 space-y-6 p-4">
                <FormDocumentos
                    control={form.control as unknown as Control<any>}
                    isSubmitting={isSubmitting}
                    resourceId={resourceId}
                    isReadOnly={isChildFormReadOnly('documentos')}
                />
            </TabsContent>

            {/* TAB 6: DADOS CONTRATUAIS (RH) */}
            <TabsContent value="contrato" className="mt-4 space-y-6 p-4">
                <FormDadosContratuais
                    control={form.control as unknown as Control<any>}
                    isSubmitting={isSubmitting}
                    isContractEditable={isContractEditable}
                    isReadOnly={isChildFormReadOnly('contrato')}
                />
            </TabsContent>
          </Tabs>
          
          {/* O botão de salvar só é habilitado se não for read-only globalmente E se for a aba editável para o usuário funcionário */}
          {shouldShowSaveButton && (
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Alterações
              </Button>
          )}
        </form>
      </Form>
    </FormProvider>
  );
};

export default FormUsuario;
