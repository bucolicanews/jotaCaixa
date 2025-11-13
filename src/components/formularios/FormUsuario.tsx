import React, { useState } from 'react';
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
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '../ui/form';
import { useBulkTagManager } from '@/hooks/use-bulk-tag-manager';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ptBR } from 'date-fns/locale';
import { BASE_URL } from '@/config/app-config';
import { Separator } from '../ui/separator';
import FormGeral from '../usuario-forms/FormGeral';
import FormFolgasFerias from '../usuario-forms/FormFolgasFerias';
import FormDocumentos from '../usuario-forms/FormDocumentos';
import FormDadosContratuais from '../usuario-forms/FormDadosContratuais';
import { Checkbox } from '../ui/checkbox';

const textOptional = z.string().optional().or(z.literal(''));
const urlSchema = z.string().url('URL inválida.').optional().or(z.literal(''));

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  email: z.string().email('Email inválido.'),
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').optional().or(z.literal('')),
  limite_usuarios: z.coerce.number().int().min(1, 'O limite deve ser pelo menos 1.').optional(),
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
  const isClientBeingManagedByAdmin = criadorRole === 'Admin' && usuarioInicial && 'limite_usuarios' in usuarioInicial;
  const isUserBeingManagedByClient = (criadorRole === 'Cliente' || criadorRole === 'Admin') && usuarioInicial && 'proprietario_id' in usuarioInicial;
  
  const isNewClient = criadorRole === 'Admin' && !isEditing;
  const isNewUser = !isEditing && !isClientBeingManagedByAdmin && !isNewClient;
  
  const profileToEdit = usuarioInicial as UsuarioProfile | ClienteProfile;
  
  const [activeTab, setActiveTab] = useState('pessoal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const resourceId = usuarioInicial?.id;
  const { refetchStatus, refreshKey } = useBulkTagManager(resourceId);

  const parseDate = (dateString: string | null | undefined): Date | undefined => {
    if (!dateString) return undefined;
    const date = new Date(dateString + 'T00:00:00');
    return isNaN(date.getTime()) ? undefined : date;
  };

  const defaultPermissoes = PERMISSOES_DISPONIVEIS.reduce((acc: Record<string, boolean>, p: Permissao) => {
    if (profileToEdit && 'permissoes' in profileToEdit && (profileToEdit as any).permissoes) {
      acc[p.key] = (profileToEdit as any).permissoes[p.key] !== false;
    } else {
      acc[p.key] = true;
    }
    return acc;
  }, {} as Record<string, boolean>);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: profileToEdit?.nome || '',
      email: profileToEdit?.email || '',
      senha: '',
      limite_usuarios: isClientBeingManagedByAdmin ? (profileToEdit as ClienteProfile).limite_usuarios : 5,
      permissoes: defaultPermissoes,
      
      // Dados de Folga (Apenas Usuário)
      dias_folga_fixos: (profileToEdit as UsuarioProfile)?.dias_folga_fixos || ['Saturday', 'Sunday'],
      folga_domingo_obrigatoria: (profileToEdit as UsuarioProfile)?.folga_domingo_obrigatoria ?? true,
      
      // Dados de Salário/Jornada
      salario: (profileToEdit as UsuarioProfile)?.salario || 0,
      horas_semanais: (profileToEdit as UsuarioProfile)?.horas_semanais || 44,
      horas_mensais: (profileToEdit as UsuarioProfile)?.horas_mensais || 220,
      
      // Dados Cadastrais (Comum a Cliente e Usuário)
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
      
      // Dados de Cliente
      razao_social: (profileToEdit as ClienteProfile)?.razao_social || '',
      nome_fantasia: (profileToEdit as ClienteProfile)?.nome_fantasia || '',
      documento: (profileToEdit as ClienteProfile)?.documento || '',
      cnpj: (profileToEdit as ClienteProfile)?.cnpj || '',
      
      // Dados Contratuais (Apenas Usuário)
      data_inicio_contrato: parseDate((profileToEdit as UsuarioProfile)?.data_inicio_contrato),
      data_fim_contrato: parseDate((profileToEdit as UsuarioProfile)?.data_fim_contrato),
      data_inicio_aviso: parseDate((profileToEdit as UsuarioProfile)?.data_inicio_aviso),
      tipo_aviso: ((profileToEdit as UsuarioProfile)?.tipo_aviso || 'Nenhum') as FormValues['tipo_aviso'],
      
      // Documentos (URLs)
      rg_url: (profileToEdit as UsuarioProfile)?.rg_url || '',
      cpf_url: (profileToEdit as UsuarioProfile)?.cpf_url || '',
      titulo_eleitor_url: (profileToEdit as UsuarioProfile)?.titulo_eleitor_url || '',
      reservista_url: (profileToEdit as UsuarioProfile)?.reservista_url || '',
      ctps_url: (profileToEdit as UsuarioProfile)?.ctps_url || '',
      certidao_nascimento_url: (profileToEdit as UsuarioProfile)?.certidao_nascimento_url || '',
      certidao_casamento_url: (profileToEdit as UsuarioProfile)?.certidao_casamento_url || '',
      comprovante_residencia_url: (profileToEdit as UsuarioProfile)?.comprovante_residencia_url || '',
      comprovante_escolaridade_url: (profileToEdit as UsuarioProfile)?.comprovante_escolaridade_url || '',
      exame_admissional_url: (profileToEdit as UsuarioProfile)?.exame_admissional_url || '',
      foto_3x4_url: (profileToEdit as UsuarioProfile)?.foto_3x4_url || '',
      cnh_url: (profileToEdit as UsuarioProfile)?.cnh_url || '',
      cartao_pis_url: (profileToEdit as UsuarioProfile)?.cartao_pis_url || '',
      ja_admitido_anteriormente: (profileToEdit as UsuarioProfile)?.ja_admitido_anteriormente ?? false,
      
      // Acesso
      data_fim_acesso: parseDate((profileToEdit as ClienteProfile)?.data_fim_acesso),
    },
  });

  const handleSelectAll = (select: boolean) => {
    const permissoes = isClientBeingManagedByAdmin ? PERMISSOES_DISPONIVEIS.filter((p: Permissao) => p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto') : PERMISSOES_DISPONIVEIS;
    permissoes.forEach((p: Permissao) => {
      form.setValue(`permissoes.${p.key}`, select, { shouldDirty: true });
    });
  };
  
  const handleTagToggle = useCallback(() => {
      refetchStatus();
  }, [refetchStatus]);

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    
    // Determine the target table and owner ID
    let targetTable: 'tbl_usuarios' | 'tbl_clientes' = 'tbl_usuarios';
    let ownerId: string | null = null;
    let isNewAuthUser = false;
    
    if (isClientBeingManagedByAdmin || isNewClient) {
        targetTable = 'tbl_clientes';
        ownerId = criadorPerfil?.id || null; // Admin's ID
    } else if (isUserBeingManagedByClient || isNewUser) {
        targetTable = 'tbl_usuarios';
        ownerId = (criadorPerfil as ClienteProfile)?.id || (criadorPerfil as UsuarioProfile)?.proprietario_id || null; // Client's ID
    }
    
    if (!ownerId) {
        showError('ID do proprietário não pôde ser determinado.');
        setIsSubmitting(false);
        return;
    }

    try {
        let userId = usuarioInicial?.id;
        
        // 1. Handle New User/Client Creation (Auth)
        if (!isEditing) {
            if (!values.senha) {
                showError('A senha é obrigatória para novos usuários.');
                return;
            }
            
            const roleToAssign = targetTable === 'tbl_clientes' ? 'Cliente' : 'Usuario';
            
            const { data: signUpData, error: authError } = await supabase.auth.signUp({
                email: values.email,
                password: values.senha,
                options: {
                    emailRedirectTo: `${BASE_URL}/atualizar-senha`,
                    data: { 
                        role: roleToAssign, 
                        nome: values.nome, 
                        // Passa o proprietario_id para o trigger route_new_user
                        proprietario_id: targetTable === 'tbl_usuarios' ? ownerId : undefined, 
                        plano_id: targetTable === 'tbl_clientes' ? (values as any).plano_id : undefined,
                        aprovado: targetTable === 'tbl_clientes' ? false : true, // Novos clientes precisam de aprovação
                    }
                }
            });

            if (authError) {
                if (authError.message.includes('already registered')) {
                    showError('Este email já está cadastrado. Use a função de convite se for um cliente existente.');
                    return;
                }
                throw authError;
            }
            
            userId = signUpData.user?.id;
            isNewAuthUser = true;
        }
        
        if (!userId) throw new Error('Falha ao obter ID do usuário.');

        // 2. Prepare Data Payload
        const dataToUpdate: any = { nome: values.nome };
        
        if (values.senha && isEditing) {
            const { error: authError } = await supabase.auth.updateUser({ password: values.senha });
            if (authError) throw authError;
        }

        if (targetTable === 'tbl_clientes') {
            // Edição de Cliente (Empresa)
            dataToUpdate.limite_usuarios = values.limite_usuarios;
            dataToUpdate.permissoes = values.permissoes;
            dataToUpdate.data_fim_acesso = values.data_fim_acesso ? format(values.data_fim_acesso, 'yyyy-MM-dd') + 'T12:00:00Z' : null;
            
            dataToUpdate.razao_social = values.razao_social || null;
            dataToUpdate.nome_fantasia = values.nome_fantasia || null;
            dataToUpdate.documento = values.documento || null;
            dataToUpdate.cnpj = values.cnpj || null;
            
            // Campos cadastrais (para tags)
            dataToUpdate.cpf = values.cpf || null;
            dataToUpdate.rg = values.rg || null;
            dataToUpdate.nome_mae = values.nome_mae || null;
            dataToUpdate.nome_pai = values.nome_pai || null;
            dataToUpdate.telefone = values.telefone || null;
            dataToUpdate.cep = values.cep || null;
            dataToUpdate.endereco = values.endereco || null;
            dataToUpdate.numero = values.numero || null;
            dataToUpdate.complemento = values.complemento || null;
            dataToUpdate.bairro = values.bairro || null;
            dataToUpdate.cidade = values.cidade || null;
            dataToUpdate.estado = values.estado || null;
            
            const { error } = await supabase.from('tbl_clientes').update(dataToUpdate).eq('id', userId);
            if (error) throw error;
            
        } else if (targetTable === 'tbl_usuarios') {
            // Edição de Usuário (Funcionário)
            
            // Dados de RH/Contrato (apenas se o criador for Admin/Cliente)
            if (criadorRole === 'Admin' || criadorRole === 'Cliente') {
                dataToUpdate.permissoes = values.permissoes;
                dataToUpdate.dias_folga_fixos = values.dias_folga_fixos || [];
                dataToUpdate.folga_domingo_obrigatoria = values.folga_domingo_obrigatoria;
                dataToUpdate.salario = values.salario;
                dataToUpdate.horas_semanais = values.horas_semanais;
                dataToUpdate.horas_mensais = values.horas_mensais;
                dataToUpdate.data_inicio_contrato = values.data_inicio_contrato ? format(values.data_inicio_contrato, 'yyyy-MM-dd') : null;
                dataToUpdate.data_fim_contrato = values.data_fim_contrato ? format(values.data_fim_contrato, 'yyyy-MM-dd') : null;
                dataToUpdate.data_inicio_aviso = values.data_inicio_aviso ? format(values.data_inicio_aviso, 'yyyy-MM-dd') : null;
                dataToUpdate.tipo_aviso = values.tipo_aviso === 'Nenhum' ? null : values.tipo_aviso;
            }
            
            // Dados Cadastrais e Documentos (editáveis por qualquer um)
            dataToUpdate.cpf = values.cpf || null;
            dataToUpdate.rg = values.rg || null;
            dataToUpdate.nome_mae = values.nome_mae || null;
            dataToUpdate.nome_pai = values.nome_pai || null;
            dataToUpdate.telefone = values.telefone || null;
            dataToUpdate.cep = values.cep || null;
            dataToUpdate.endereco = values.endereco || null;
            dataToUpdate.numero = values.numero || null;
            dataToUpdate.complemento = values.complemento || null;
            dataToUpdate.bairro = values.bairro || null;
            dataToUpdate.cidade = values.cidade || null;
            dataToUpdate.estado = values.estado || null;
            dataToUpdate.rg_url = values.rg_url || null;
            dataToUpdate.cpf_url = values.cpf_url || null;
            dataToUpdate.titulo_eleitor_url = values.titulo_eleitor_url || null;
            dataToUpdate.reservista_url = values.reservista_url || null;
            dataToUpdate.ctps_url = values.ctps_url || null;
            dataToUpdate.certidao_nascimento_url = values.certidao_nascimento_url || null;
            dataToUpdate.certidao_casamento_url = values.certidao_casamento_url || null;
            dataToUpdate.comprovante_residencia_url = values.comprovante_residencia_url || null;
            dataToUpdate.comprovante_escolaridade_url = values.comprovante_escolaridade_url || null;
            dataToUpdate.exame_admissional_url = values.exame_admissional_url || null;
            dataToUpdate.foto_3x4_url = values.foto_3x4_url || null;
            dataToUpdate.cnh_url = values.cnh_url || null;
            dataToUpdate.cartao_pis_url = values.cartao_pis_url || null;
            dataToUpdate.ja_admitido_anteriormente = values.ja_admitido_anteriormente;

            const { error } = await supabase.from('tbl_usuarios').update(dataToUpdate).eq('id', userId);
            if (error) throw error;
        }

        showSuccess(`${targetTable === 'tbl_clientes' ? 'Cliente' : 'Usuário'} ${isEditing ? 'atualizado' : 'criado'} com sucesso!`);
        
        if (isNewAuthUser) {
            // Envia o link de redefinição de senha (convite)
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex flex-wrap justify-start w-full h-auto p-1">
            <TabsTrigger value="pessoal" className="flex-1 md:flex-none md:w-1/5">Geral</TabsTrigger>
            {isUserBeingManagedByClient && <TabsTrigger value="folgas" className="flex-1 md:flex-none md:w-1/5">Folgas/Férias</TabsTrigger>}
            <TabsTrigger value="cadastrais" className="flex-1 md:flex-none md:w-1/5">Dados Cadastrais</TabsTrigger>
            {isUserBeingManagedByClient && <TabsTrigger value="documentos" className="flex-1 md:flex-none md:w-1/5">Documentos</TabsTrigger>}
            {isUserBeingManagedByClient && <TabsTrigger value="contrato" className="flex-1 md:flex-none md:w-1/5">Contrato (RH)</TabsTrigger>}
            {(isClientBeingManagedByAdmin || isNewClient) && <TabsTrigger value="acesso" className="flex-1 md:flex-none md:w-1/5">Acesso</TabsTrigger>}
          </TabsList>
          
          {/* TAB 1: GERAL */}
          <TabsContent value="pessoal" className="mt-4 space-y-4 p-4">
            <FormGeral
                control={form.control}
                isEditing={isEditing}
                isUserScope={targetTable === 'tbl_usuarios'}
                isSubmitting={isSubmitting}
                criadorRole={criadorRole!}
                permissoesVisiveis={targetTable === 'tbl_clientes' ? PERMISSOES_DISPONIVEIS.filter((p: Permissao) => p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto') : PERMISSOES_DISPONIVEIS.filter((p: Permissao) => p.key === 'ponto_eletronico' || p.key === 'visualizar_proprio_ponto')}
                handleSelectAll={handleSelectAll}
            />
          </TabsContent>
          
          {/* TAB 2: FOLGAS E FÉRIAS */}
          {isUserBeingManagedByClient && (
              <TabsContent value="folgas" className="mt-4 space-y-6 p-4">
                  <FormFolgasFerias
                      control={form.control as unknown as Control<any>}
                      isSubmitting={isSubmitting}
                      usuarioInicial={profileToEdit as UsuarioProfile}
                  />
              </TabsContent>
          )}

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
              onTagToggle={refetchStatus}
            />
            
            {/* Campos específicos de Cliente/Admin */}
            {(isClientBeingManagedByAdmin || isNewClient) && (
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold text-lg">Dados da Empresa</h3>
                <FormField control={form.control} name="razao_social" render={({ field }) => (
                  <FormItem><FormLabel>Razão Social</FormLabel><FormControl><Input placeholder="Razão Social LTDA" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="nome_fantasia" render={({ field }) => (
                  <FormItem><FormLabel>Nome Fantasia</FormLabel><FormControl><Input placeholder="Nome Fantasia" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="documento" render={({ field }) => (
                  <FormItem><FormLabel>Documento (CPF/CNPJ)</FormLabel><FormControl><Input placeholder="000.000.000-00 ou 00.000.000/0000-00" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="cnpj" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ (Opcional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="00.000.000/0000-00" 
                        {...field} 
                        value={field.value === null || field.value === undefined ? '' : String(field.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            )}
          </TabsContent>
          
          {/* TAB 4: DOCUMENTOS DE ADMISSÃO */}
          {isUserBeingManagedByClient && (
              <TabsContent value="documentos" className="mt-4 space-y-6 p-4">
                  <FormDocumentos
                      control={form.control as unknown as Control<any>}
                      isSubmitting={isSubmitting}
                      resourceId={resourceId}
                  />
              </TabsContent>
          )}

          {/* TAB 5: DADOS CONTRATUAIS (RH) */}
          {isUserBeingManagedByClient && (
              <TabsContent value="contrato" className="mt-4 space-y-6 p-4">
                  <FormDadosContratuais
                      control={form.control as unknown as Control<any>}
                      isSubmitting={isSubmitting}
                      isContractEditable={criadorRole === 'Admin' || criadorRole === 'Cliente'}
                  />
              </TabsContent>
          )}
          
          {/* TAB 6: ACESSO (Apenas Cliente/Novo Cliente) */}
          {(isClientBeingManagedByAdmin || isNewClient) && (
              <TabsContent value="acesso" className="mt-4 space-y-4 p-4">
                  <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email (Login)</FormLabel><FormControl><Input type="email" placeholder="email@exemplo.com" {...field} disabled={isEditing} /></FormControl><FormMessage /></FormItem>
                  )} />
                  {!isEditing && <FormField control={form.control} name="senha" render={({ field }) => (
                      <FormItem><FormLabel>Criar Senha</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />}
                  {isEditing && <FormField control={form.control} name="senha" render={({ field }) => (
                      <FormItem><FormLabel>Alterar Senha (Opcional)</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />}
                  <FormField control={form.control} name="limite_usuarios" render={({ field }) => (
                      <FormItem><FormLabel>Limite de Usuários</FormLabel><FormControl><Input type="number" placeholder="5" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="data_fim_acesso" render={({ field }) => (
                      <FormItem className="flex flex-col">
                          <FormLabel>Data Fim de Acesso (Deixe vazio para vitalício)</FormLabel>
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
                                          {field.value ? format(field.value as Date, "PPP", { locale: ptBR }) : <span>Vitalício</span>}
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
                  
                  <Separator />
                  
                  <div className="space-y-2">
                      <FormLabel>Permissões de Módulos</FormLabel>
                      <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                          {PERMISSOES_DISPONIVEIS.filter((p: Permissao) => p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto').map((p: Permissao) => (
                              <FormField key={p.key} control={form.control} name={`permissoes.${p.key}`} render={({ field }) => (
                                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                      <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting} /></FormControl>
                                      <FormLabel className="font-normal">{p.label}</FormLabel>
                                  </FormItem>
                              )} />
                          ))}
                      </div>
                  </div>
              </TabsContent>
          )}
          
        </Tabs>
        
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Salvar Alterações' : 'Criar Usuário/Cliente'}
        </Button>
      </form>
    </FormProvider>
  );
};

export default FormUsuario;