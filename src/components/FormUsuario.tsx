import React, { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, ClienteProfile, UsuarioProfile, UserRole } from '@/types/usuario';
import { PERMISSOES_DISPONIVEIS, Permissao } from '../config/permissoes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { format } from 'date-fns';
import FormGeral from './usuario-forms/FormGeral';
import FormFolgasFerias from './usuario-forms/FormFolgasFerias';
import FormDadosCadastrais from './usuario-forms/FormDadosCadastrais';
import FormDocumentos from './usuario-forms/FormDocumentos';
import FormDadosContratuais from './usuario-forms/FormDadosContratuais';
import { Input } from './ui/input';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from './ui/form';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ptBR } from 'date-fns/locale';

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
  nome_mae: z.string().min(1, 'O nome da mãe é obrigatório.').optional().or(z.literal('')),
  nome_pai: textOptional,
  telefone: textOptional,
  cep: textOptional,
  endereco: textOptional,
  numero: textOptional,
  complemento: textOptional,
  bairro: textOptional,
  cidade: textOptional,
  estado: textOptional,

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
  const isUserBeingManagedByClient = (criadorRole === 'Cliente' || criadorRole === 'Admin') && usuarioInicial && 'cliente_id' in usuarioInicial;
  const isNewClient = criadorRole === 'Admin' && !isEditing;
  const isNewUser = !isEditing && !isClientBeingManagedByAdmin && !isNewClient;
  
  const profileToEdit = usuarioInicial as UsuarioProfile | ClienteProfile;
  
  const [activeTab, setActiveTab] = useState('pessoal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tagRefreshKey, setTagRefreshKey] = useState(0);

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
      
      // Dados de Salário/Jornada (Apenas Usuário)
      salario: (profileToEdit as UsuarioProfile)?.salario || 0,
      horas_semanais: (profileToEdit as UsuarioProfile)?.horas_semanais || 44,
      horas_mensais: (profileToEdit as UsuarioProfile)?.horas_mensais || 220,

      // Dados Cadastrais (Comum a Cliente e Usuário)
      cpf: (profileToEdit as UsuarioProfile)?.cpf || '',
      rg: (profileToEdit as UsuarioProfile)?.rg || '',
      nome_mae: (profileToEdit as UsuarioProfile)?.nome_mae || '',
      nome_pai: (profileToEdit as UsuarioProfile)?.nome_pai || '',
      telefone: (profileToEdit as UsuarioProfile)?.telefone || '',
      cep: (profileToEdit as UsuarioProfile)?.cep || '',
      endereco: (profileToEdit as UsuarioProfile)?.endereco || '',
      numero: (profileToEdit as UsuarioProfile)?.numero || '',
      complemento: (profileToEdit as UsuarioProfile)?.complemento || '',
      bairro: (profileToEdit as UsuarioProfile)?.bairro || '',
      cidade: (profileToEdit as UsuarioProfile)?.cidade || '',
      estado: (profileToEdit as UsuarioProfile)?.estado || '',

      // Contratuais (Apenas para UsuarioProfile)
      data_inicio_contrato: parseDate((profileToEdit as UsuarioProfile)?.data_inicio_contrato),
      data_fim_contrato: parseDate((profileToEdit as UsuarioProfile)?.data_fim_contrato),
      data_inicio_aviso: parseDate((profileToEdit as UsuarioProfile)?.data_inicio_aviso),
      tipo_aviso: (profileToEdit as UsuarioProfile)?.tipo_aviso as FormValues['tipo_aviso'] || 'Nenhum',

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
      ja_admitido_anteriormente: (profileToEdit as UsuarioProfile)?.ja_admitido_anteriormente || false,
      
      // NOVO CAMPO DE ACESSO
      data_fim_acesso: isClientBeingManagedByAdmin ? parseDate((profileToEdit as ClienteProfile)?.data_fim_acesso) : undefined,
    },
  });
  
  const isClientScope = isClientBeingManagedByAdmin || isNewClient;
  const isContractEditable = criadorRole === 'Admin' || criadorRole === 'Cliente';
  const resourceId = usuarioInicial?.id;

  const handleSelectAll = (select: boolean) => {
    const permissoes = isClientScope ? permissoesClienteAdmin : permissoesVisiveis;
    permissoes.forEach(p => {
      form.setValue(`permissoes.${p.key}`, select, { shouldDirty: true });
    });
  };

  const getTableName = (profile: AnyProfile | null, isNewClient: boolean, isNewUser: boolean): 'tbl_clientes' | 'tbl_usuarios' | null => {
    if (isNewClient) return 'tbl_clientes';
    if (isNewUser) return 'tbl_usuarios';
    if (!profile) return null;
    if ('limite_usuarios' in profile) return 'tbl_clientes';
    if ('cliente_id' in profile) return 'tbl_usuarios';
    return null;
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    
    const tableName = getTableName(usuarioInicial || null, isNewClient, isNewUser);
    if (!tableName) {
        showError('Tabela de perfil não identificada.');
        setIsSubmitting(false);
        return;
    }
    
    try {
      const dataToUpdate: any = { nome: values.nome };
      
      if (isEditing && values.senha) {
        const { error: authError } = await supabase.auth.updateUser({ password: values.senha });
        if (authError) throw authError;
      }

      if (isClientBeingManagedByAdmin || isNewClient) {
        // Edição/Criação de Cliente (Empresa do Sistema)
        
        const clientUpdatePayload: Partial<ClienteProfile> = {
            nome: values.nome,
            email: values.email,
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
        };
        
        if (criadorRole === 'Admin') {
            clientUpdatePayload.limite_usuarios = values.limite_usuarios;
            clientUpdatePayload.permissoes = values.permissoes;
            clientUpdatePayload.data_fim_acesso = values.data_fim_acesso ? format(values.data_fim_acesso, 'yyyy-MM-dd') + 'T12:00:00Z' : null;
        }
        
        if (isNewClient) {
            const { error: authError } = await supabase.auth.signUp({
                email: values.email,
                password: Math.random().toString(36).substring(2, 15),
                options: {
                    emailRedirectTo: `${window.location.origin}/atualizar-senha`,
                    data: { role: 'Cliente', nome: values.nome, cliente_id: null }
                }
            });
            
            if (authError) throw authError;
            
            showSuccess(`Convite enviado para o email ${values.email}. O cliente deve clicar no link para finalizar o cadastro.`);
            onSaveComplete();
            return;
        }
        
        const { error } = await supabase.from('tbl_clientes').update(clientUpdatePayload).eq('id', usuarioInicial!.id);
        if (error) throw error;
        
      } else if (isUserBeingManagedByClient || isNewUser) {
        // Edição/Criação de Usuário (Funcionário)
        
        let targetClienteId: string | null = null;
        if (isNewUser) {
            targetClienteId = criadorPerfil?.id || null;
        } else {
            targetClienteId = (usuarioInicial as UsuarioProfile)?.cliente_id;
        }
        
        if (!targetClienteId) throw new Error('ID do cliente não encontrado para vincular o usuário.');

        dataToUpdate.permissoes = values.permissoes;
        dataToUpdate.dias_folga_fixos = values.dias_folga_fixos || [];
        dataToUpdate.folga_domingo_obrigatoria = values.folga_domingo_obrigatoria;
        dataToUpdate.salario = values.salario;
        dataToUpdate.horas_semanais = values.horas_semanais;
        dataToUpdate.horas_mensais = values.horas_mensais;
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
        dataToUpdate.data_inicio_contrato = values.data_inicio_contrato ? format(values.data_inicio_contrato, 'yyyy-MM-dd') : null;
        dataToUpdate.data_fim_contrato = values.data_fim_contrato ? format(values.data_fim_contrato, 'yyyy-MM-dd') : null;
        dataToUpdate.data_inicio_aviso = values.data_inicio_aviso ? format(values.data_inicio_aviso, 'yyyy-MM-dd') : null;
        dataToUpdate.tipo_aviso = values.tipo_aviso === 'Nenhum' ? null : values.tipo_aviso;
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
        
        if (isNewUser) {
            const { error: authError } = await supabase.auth.signUp({
                email: values.email,
                password: Math.random().toString(36).substring(2, 15),
                options: {
                    emailRedirectTo: `${window.location.origin}/atualizar-senha`,
                    data: { role: 'Usuario', nome: values.nome, cliente_id: targetClienteId }
                }
            });
            
            if (authError) throw authError;
            
            showSuccess(`Convite enviado para o email ${values.email}. O usuário deve clicar no link para definir a senha.`);
            onSaveComplete();
            return;
        }
        
        const { error } = await supabase.from('tbl_usuarios').update(dataToUpdate).eq('id', usuarioInicial!.id);
        if (error) throw error;
      }
      
      showSuccess('Perfil atualizado com sucesso!');
      setTagRefreshKey(prev => prev + 1);
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao salvar: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const permissoesClienteAdmin = PERMISSOES_DISPONIVEIS.filter(p => p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto');
  const permissoesVisiveis = PERMISSOES_DISPONIVEIS.filter(p => {
    if (criadorRole === 'Admin') return true;
    const permissoesCliente = (criadorPerfil as ClienteProfile)?.permissoes || {};
    return permissoesCliente[p.key] === true || p.key === 'visualizar_proprio_ponto' || p.key === 'ponto_eletronico';
  });

  const formMethods = form;

  if (isClientScope) {
    // Renderização para Cliente (Empresa do Sistema)
    return (
      <FormProvider {...formMethods}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormGeral
                control={form.control}
                isEditing={isEditing}
                isUserScope={false}
                isSubmitting={isSubmitting}
                criadorRole={criadorRole!}
                permissoesVisiveis={permissoesClienteAdmin}
                handleSelectAll={handleSelectAll}
            />
            
            {/* Campos de Acesso e Limite (Apenas Admin) */}
            {criadorRole === 'Admin' && (
                <div className="space-y-4 pt-4 border-t">
                    <h4 className="font-semibold">Configurações de Acesso</h4>
                    <FormField
                        control={form.control}
                        name="data_fim_acesso"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel>Data Fim Acesso (Expiração)</FormLabel>
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
                                                {field.value ? format(field.value as Date, "PPP", { locale: ptBR }) : <span>Selecione a data</span>}
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
                    <FormField
                        control={form.control}
                        name="limite_usuarios"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Limite de Usuários da Equipe</FormLabel>
                                <FormControl>
                                    <Input 
                                        type="number" 
                                        placeholder="5" 
                                        {...field} 
                                        disabled={isSubmitting} 
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            )}
            
            <h3 className="font-semibold text-lg mt-6 border-t pt-4">Dados Cadastrais (Tags de Contrato)</h3>
            <p className="text-sm text-muted-foreground mb-4">Estes campos são usados para preencher tags dinâmicas em contratos.</p>
            
            <FormDadosCadastrais 
                control={form.control}
                isSubmitting={isSubmitting}
                resourceId={resourceId}
                tagRefreshKey={tagRefreshKey}
            />

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Salvar Alterações' : 'Enviar Convite de Cadastro'}
            </Button>
          </form>
        </Form>
      </FormProvider>
    );
  }

  // Renderização para Usuário (Funcionário)
  return (
    <FormProvider {...formMethods}>
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
                  isEditing={isEditing}
                  isUserScope={true}
                  isSubmitting={isSubmitting}
                  criadorRole={criadorRole!}
                  permissoesVisiveis={permissoesVisiveis}
                  handleSelectAll={handleSelectAll}
              />
            </TabsContent>
            
            {/* TAB 2: FOLGAS E FÉRIAS */}
            {isUserBeingManagedByClient && (
                <TabsContent value="folgas" className="mt-4 space-y-6 p-4">
                    <FormFolgasFerias
                        control={form.control}
                        isSubmitting={isSubmitting}
                        usuarioInicial={profileToEdit as UsuarioProfile}
                    />
                </TabsContent>
            )}

            {/* TAB 3: DADOS CADASTRAIS */}
            {isUserBeingManagedByClient && (
                <TabsContent value="cadastrais" className="mt-4 space-y-6 p-4">
                    <FormDadosCadastrais
                        control={form.control}
                        isSubmitting={isSubmitting}
                        resourceId={resourceId}
                        tagRefreshKey={tagRefreshKey}
                    />
                </TabsContent>
            )}

            {/* TAB 4: DOCUMENTOS DE ADMISSÃO */}
            {isUserBeingManagedByClient && (
                <TabsContent value="documentos" className="mt-4 space-y-6 p-4">
                    <FormDocumentos
                        control={form.control}
                        isSubmitting={isSubmitting}
                        resourceId={resourceId}
                    />
                </TabsContent>
            )}

            {/* TAB 5: DADOS CONTRATUAIS (RH) */}
            {isUserBeingManagedByClient && (
                <TabsContent value="contrato" className="mt-4 space-y-6 p-4">
                    <FormDadosContratuais
                        control={form.control}
                        isSubmitting={isSubmitting}
                        isContractEditable={isContractEditable}
                    />
                </TabsContent>
            )}
          </Tabs>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Salvar Alterações' : 'Enviar Convite de Cadastro'}
          </Button>
        </form>
      </Form>
    </FormProvider>
  );
};

export default FormUsuario;