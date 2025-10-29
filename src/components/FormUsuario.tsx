import React, { useState } from 'react';
import { useForm, Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Upload, CalendarIcon, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, ClienteProfile, UserRole, UsuarioProfile } from '@/types/usuario';
import { PERMISSOES_DISPONIVEIS, Permissao } from '../config/permissoes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

// Esquema de validação para os campos de URL (opcional)
const urlSchema = z.string().url('URL inválida.').optional().or(z.literal(''));
const textOptional = z.string().optional().or(z.literal(''));

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  email: z.string().email('Email inválido.'),
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').optional().or(z.literal('')),
  limite_usuarios: z.coerce.number().int().min(1, 'O limite deve ser pelo menos 1.').optional(),
  permissoes: z.record(z.boolean()).optional(),
  
  // Novos Campos de Salário/Jornada
  salario: z.coerce.number().min(0).optional(),
  horas_semanais: z.coerce.number().int().min(1).optional(),
  horas_mensais: z.coerce.number().int().min(1).optional(),
  
  // Novos Dados Cadastrais
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
});

type FormValues = z.infer<typeof formSchema>;

interface FormUsuarioProps {
  criadorRole: UserRole;
  criadorPerfil: AnyProfile;
  clienteId?: string; // ID da empresa se estiver criando um usuário
  usuarioInicial?: AnyProfile | null; // Perfil a ser editado
  onSaveComplete: () => void;
}

const FormUsuario: React.FC<FormUsuarioProps> = ({ criadorRole, criadorPerfil, clienteId, usuarioInicial, onSaveComplete }) => {
  const isEditing = !!usuarioInicial;
  const isClient = isEditing && usuarioInicial && 'limite_usuarios' in usuarioInicial;
  const isUser = isEditing && usuarioInicial && 'cliente_id' in usuarioInicial;
  const profileToEdit = usuarioInicial as UsuarioProfile | ClienteProfile;

  const isClientBeingManagedByAdmin = criadorRole === 'Admin' && isClient;
  const isUserBeingManagedByClient = (criadorRole === 'Cliente' || criadorRole === 'Admin') && (isUser || !isEditing);
  
  const [activeTab, setActiveTab] = useState('pessoal');
  const [uploading, setUploading] = useState(false);

  const permissoesDoCriador = (criadorPerfil && 'permissoes' in criadorPerfil)
    ? (criadorPerfil as ClienteProfile).permissoes
    : null;

  const permissoesVisiveis = PERMISSOES_DISPONIVEIS.filter(p => {
    if (criadorRole === 'Admin') return true;
    if (criadorRole === 'Cliente' && permissoesDoCriador) {
      // O Cliente só pode conceder permissões que ele mesmo possui, exceto a permissão de 'visualizar_proprio_ponto'
      // que é uma permissão de controle sobre o usuário, não sobre o módulo.
      if (p.key === 'visualizar_proprio_ponto') return true;
      return permissoesDoCriador[p.key] === true;
    }
    return false;
  });

  const defaultPermissoes = PERMISSOES_DISPONIVEIS.reduce((acc: Record<string, boolean>, p: Permissao) => {
    if (isEditing && profileToEdit && 'permissoes' in profileToEdit && (profileToEdit as any).permissoes) {
      acc[p.key] = (profileToEdit as any).permissoes[p.key] !== false;
    } else {
      // Define 'visualizar_proprio_ponto' como true por padrão para novos usuários
      if (p.key === 'visualizar_proprio_ponto') {
          acc[p.key] = true;
      } else {
          acc[p.key] = true;
      }
    }
    return acc;
  }, {} as Record<string, boolean>);

  const parseDate = (dateString: string | null | undefined) => 
    dateString ? new Date(dateString + 'T00:00:00') : null;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: profileToEdit?.nome || '',
      email: profileToEdit?.email || '',
      senha: '',
      limite_usuarios: isClient ? (profileToEdit as ClienteProfile).limite_usuarios : 5,
      permissoes: defaultPermissoes,
      
      // Dados de Salário/Jornada
      salario: (profileToEdit as UsuarioProfile)?.salario || 0,
      horas_semanais: (profileToEdit as UsuarioProfile)?.horas_semanais || 44,
      horas_mensais: (profileToEdit as UsuarioProfile)?.horas_mensais || 220,

      // Dados Cadastrais
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

      // Contratuais
      data_inicio_contrato: parseDate((profileToEdit as UsuarioProfile)?.data_inicio_contrato),
      data_fim_contrato: parseDate((profileToEdit as UsuarioProfile)?.data_fim_contrato),
      data_inicio_aviso: parseDate((profileToEdit as UsuarioProfile)?.data_inicio_aviso),
      tipo_aviso: (profileToEdit as UsuarioProfile)?.tipo_aviso as FormValues['tipo_aviso'] || 'Nenhum',

      // Documentos
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
    },
  });

  const handleSelectAll = (select: boolean) => {
    permissoesVisiveis.forEach(p => {
      form.setValue(`permissoes.${p.key}`, select, { shouldDirty: true });
    });
  };

  const getTableName = (profile: AnyProfile) => {
    if (!profile) return null;
    if ('limite_usuarios' in profile) return 'tbl_clientes';
    if ('cliente_id' in profile) return 'tbl_usuarios';
    return null;
  };

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEditing && usuarioInicial) {
        const tableName = getTableName(usuarioInicial);
        if (!tableName) throw new Error('Tabela de perfil não identificada.');

        const dataToUpdate: any = { nome: values.nome };

        if (isClient) {
          // Edição de Cliente (Empresa)
          dataToUpdate.limite_usuarios = values.limite_usuarios;
          dataToUpdate.permissoes = values.permissoes;
          const { error } = await supabase.from('tbl_clientes').update(dataToUpdate).eq('id', usuarioInicial.id);
          if (error) throw error;
        } else if (isUser) {
          // Edição de Usuário (Funcionário)
          dataToUpdate.permissoes = values.permissoes;
          
          // Dados de Salário/Jornada
          dataToUpdate.salario = values.salario;
          dataToUpdate.horas_semanais = values.horas_semanais;
          dataToUpdate.horas_mensais = values.horas_mensais;

          // Dados Cadastrais
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

          // Dados Contratuais
          dataToUpdate.data_inicio_contrato = values.data_inicio_contrato ? format(values.data_inicio_contrato, 'yyyy-MM-dd') : null;
          dataToUpdate.data_fim_contrato = values.data_fim_contrato ? format(values.data_fim_contrato, 'yyyy-MM-dd') : null;
          dataToUpdate.data_inicio_aviso = values.data_inicio_aviso ? format(values.data_inicio_aviso, 'yyyy-MM-dd') : null;
          dataToUpdate.tipo_aviso = values.tipo_aviso === 'Nenhum' ? null : values.tipo_aviso;

          // Documentos (URLs)
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

          const { error } = await supabase.from('tbl_usuarios').update(dataToUpdate).eq('id', usuarioInicial.id);
          if (error) throw error;
        }
        showSuccess('Conta atualizada com sucesso!');

      } else {
        // Criação de Novo Usuário (Apenas nome, email, senha, role e cliente_id)
        if (!values.senha) {
          form.setError('senha', { message: 'A senha é obrigatória para novos usuários.' });
          return;
        }
        const roleToCreate = criadorRole === 'Admin' ? 'Cliente' : 'Usuario';
        const { error } = await supabase.auth.signUp({
          email: values.email,
          password: values.senha!,
          options: {
            data: {
              nome: values.nome,
              role: roleToCreate,
              cliente_id: clienteId,
            },
          },
        });
        if (error) throw error;
        
        // Atualiza permissões e dados cadastrais/documentos após a criação
        const { error: userUpdateError } = await supabase.from('tbl_usuarios').update({ 
            permissoes: values.permissoes,
            // Adiciona dados cadastrais básicos na criação
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
            // Adiciona dados de salário/jornada na criação
            salario: values.salario,
            horas_semanais: values.horas_semanais,
            horas_mensais: values.horas_mensais,
        }).eq('email', values.email);
        
        if (userUpdateError) throw new Error('Usuário criado, mas falha ao definir dados iniciais.');

        showSuccess(`Conta criada! Um email de confirmação foi enviado para ${values.email}.`);
      }
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao salvar: ${error.message}`);
    }
  };
  
  // --- Funções de Renderização (Reutilizadas do FormPerfil) ---

  const handleFileUpload = async (file: File, fieldName: keyof FormValues) => {
    if (!usuarioInicial) return;
    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${usuarioInicial.id}/${String(fieldName)}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documentos-admissao')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('documentos-admissao').getPublicUrl(filePath);
      
      form.setValue(fieldName, publicUrlData.publicUrl as any, { shouldDirty: true });
      showSuccess('Documento anexado com sucesso!');

    } catch (error: any) {
      console.error('Erro de upload:', error);
      showError('Falha ao anexar documento: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const renderDocumentField = (fieldName: keyof FormValues, label: string, required: boolean = false) => {
    const url = form.watch(fieldName) as string | undefined;
    const isUploaded = !!url;
    const isSubmitting = form.formState.isSubmitting || uploading;

    return (
      <FormField
        control={form.control as unknown as Control<FormValues>}
        name={fieldName}
        render={({ field }) => (
          <FormItem className="flex flex-col space-y-2">
            <FormLabel className={cn(required && "font-bold")}>{label} {required && <span className="text-red-500">*</span>}</FormLabel>
            <div className="flex items-center space-x-2">
              <Input 
                type="text" 
                placeholder="URL do documento (preenchido automaticamente após upload)" 
                value={(field.value as string) || ''}
                onChange={field.onChange}
                disabled={isSubmitting || isUploaded}
                className="flex-1"
              />
              <Button 
                type="button" 
                variant={isUploaded ? "destructive" : "outline"} 
                size="icon" 
                onClick={() => {
                  if (isUploaded) {
                    form.setValue(fieldName, '' as any, { shouldDirty: true });
                    showSuccess('Link do documento removido. Salve para confirmar.');
                  } else {
                    document.getElementById(`file-upload-${String(fieldName)}`)?.click();
                  }
                }}
                disabled={isSubmitting}
              >
                {isUploaded ? <XCircle className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
              </Button>
              <input
                id={`file-upload-${String(fieldName)}`}
                type="file"
                accept="image/*, application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleFileUpload(e.target.files[0], fieldName);
                  }
                }}
              />
            </div>
            <div className="flex justify-between items-center">
                <FormMessage />
                {isUploaded && (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 flex items-center hover:underline">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Visualizar Anexo
                    </a>
                )}
            </div>
          </FormItem>
        )}
      />
    );
  };

  const renderDateField = (fieldName: keyof FormValues, label: string, disabled: boolean) => (
    <FormField
      control={form.control as unknown as Control<FormValues>}
      name={fieldName}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>{label}</FormLabel>
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full pl-3 text-left font-normal",
                    !field.value && "text-muted-foreground"
                  )}
                  disabled={disabled}
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
  );

  const renderInputField = (fieldName: keyof FormValues, label: string, placeholder: string, required: boolean = false, disabled: boolean = false) => (
    <FormField
      control={form.control as unknown as Control<FormValues>}
      name={fieldName}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label} {required && <span className="text-red-500">*</span>}</FormLabel>
          <FormControl>
            <Input placeholder={placeholder} {...field} name={String(field.name)} value={(field.value as string) || ''} disabled={disabled} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
  
  const renderNumberField = (fieldName: keyof FormValues, label: string, placeholder: string, disabled: boolean = false) => (
    <FormField
      control={form.control as unknown as Control<FormValues>}
      name={fieldName}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input 
              type="number" 
              placeholder={placeholder} 
              {...field} 
              value={field.value === undefined || field.value === null ? '' : String(field.value)}
              onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
              disabled={disabled} 
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  // --- Renderização Principal ---

  if (isClient) {
    // Renderização simplificada para edição de Cliente (Empresa)
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField control={form.control as unknown as Control<FormValues>} name="nome" render={({ field }) => (
            <FormItem><FormLabel>Nome da Empresa</FormLabel><FormControl><Input placeholder="Nome completo" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control as unknown as Control<FormValues>} name="email" render={({ field }) => (
            <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="email@exemplo.com" {...field} disabled /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control as unknown as Control<FormValues>} name="limite_usuarios" render={({ field }) => (
            <FormItem><FormLabel>Limite de Usuários da Equipe</FormLabel><FormControl><Input type="number" placeholder="5" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <div className="space-y-2">
            <div className="flex justify-between items-center mb-1">
              <FormLabel>Permissões de Acesso</FormLabel>
              <div className="space-x-2">
                <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(true)} className="p-0 h-auto">Selecionar Todos</Button>
                <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(false)} className="p-0 h-auto text-destructive">Desmarcar Todos</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
              {permissoesVisiveis.map((p: Permissao) => (
                <FormField key={p.key} control={form.control as unknown as Control<FormValues>} name={`permissoes.${p.key}`} render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <FormLabel className="font-normal">{p.label}</FormLabel>
                  </FormItem>
                )} />
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Alterações
          </Button>
        </form>
      </Form>
    );
  }

  // Renderização completa para Criação de Usuário ou Edição de Usuário (Funcionário)
  const isContractEditable = criadorRole === 'Admin' || criadorRole === 'Cliente';
  const isNewUser = !isEditing;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex flex-wrap justify-start w-full h-auto p-1">
            <TabsTrigger value="pessoal" className="flex-1 md:flex-none md:w-1/4">Geral</TabsTrigger>
            {isUserBeingManagedByClient && <TabsTrigger value="cadastrais" className="flex-1 md:flex-none md:w-1/4">Dados Cadastrais</TabsTrigger>}
            {isUserBeingManagedByClient && <TabsTrigger value="documentos" className="flex-1 md:flex-none md:w-1/4">Documentos</TabsTrigger>}
            {isUserBeingManagedByClient && <TabsTrigger value="contrato" className="flex-1 md:flex-none md:w-1/4">Contrato (RH)</TabsTrigger>}
          </TabsList>

          {/* TAB 1: GERAL (Nome, Email, Senha, Permissões, Salário) */}
          <TabsContent value="pessoal" className="mt-4 space-y-4 p-4">
            <FormField control={form.control as unknown as Control<FormValues>} name="nome" render={({ field }) => (
              <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input placeholder="Nome completo" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control as unknown as Control<FormValues>} name="email" render={({ field }) => (
              <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="email@exemplo.com" {...field} disabled={isEditing} /></FormControl><FormMessage /></FormItem>
            )} />
            {!isEditing && (
              <FormField control={form.control as unknown as Control<FormValues>} name="senha" render={({ field }) => (
                <FormItem><FormLabel>Senha Provisória</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            )}
            
            <h4 className="font-semibold mt-6 border-t pt-4">Remuneração e Jornada</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {renderNumberField('salario', 'Salário Mensal (R$)', '3000.00', isNewUser)}
                {renderNumberField('horas_semanais', 'Horas Semanais', '44', isNewUser)}
                {renderNumberField('horas_mensais', 'Horas Mensais', '220', isNewUser)}
            </div>

            {(isClientBeingManagedByAdmin || isUserBeingManagedByClient) && (
              <div className="space-y-2 pt-4 border-t">
                <div className="flex justify-between items-center mb-1">
                  <FormLabel>Permissões de Acesso</FormLabel>
                  <div className="space-x-2">
                    <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(true)} className="p-0 h-auto">Selecionar Todos</Button>
                    <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(false)} className="p-0 h-auto text-destructive">Desmarcar Todos</Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                  {permissoesVisiveis.map((p: Permissao) => (
                    <FormField key={p.key} control={form.control as unknown as Control<FormValues>} name={`permissoes.${p.key}`} render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormLabel className="font-normal">{p.label}</FormLabel>
                      </FormItem>
                    )} />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* TAB 2: DADOS CADASTRAIS (Apenas para Usuário/Funcionário) */}
          {isUserBeingManagedByClient && (
            <TabsContent value="cadastrais" className="mt-4 space-y-6 p-4">
              <p className="text-sm text-muted-foreground">Dados pessoais e de contato do funcionário.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {renderInputField('cpf', 'CPF', '000.000.000-00', false, isNewUser)}
                  {renderInputField('rg', 'RG', '00.000.000-0', false, isNewUser)}
              </div>

              {renderInputField('nome_mae', 'Nome da Mãe', 'Nome completo da mãe', false, isNewUser)}
              {renderInputField('nome_pai', 'Nome do Pai', 'Nome completo do pai', false, isNewUser)}
              {renderInputField('telefone', 'Telefone de Contato', '(00) 90000-0000', false, isNewUser)}

              <h4 className="font-semibold mt-6 border-t pt-4">Endereço</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {renderInputField('cep', 'CEP', '00000-000', false, isNewUser)}
                  {renderInputField('cidade', 'Cidade', 'São Paulo', false, isNewUser)}
                  {renderInputField('estado', 'Estado (UF)', 'SP', false, isNewUser)}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {renderInputField('endereco', 'Logradouro/Rua', 'Rua Exemplo', false, isNewUser)}
                  {renderInputField('numero', 'Número', '123', false, isNewUser)}
                  {renderInputField('complemento', 'Complemento', 'Apto 101', false, isNewUser)}
              </div>
              {renderInputField('bairro', 'Bairro', 'Centro', false, isNewUser)}
            </TabsContent>
          )}

          {/* TAB 3: DOCUMENTOS DE ADMISSÃO (Apenas para Usuário/Funcionário) */}
          {isUserBeingManagedByClient && (
            <TabsContent value="documentos" className="mt-4 space-y-6 p-4">
              <p className="text-sm text-muted-foreground">Anexos de documentos do funcionário.</p>
              
              <Accordion type="multiple" className="w-full">
                  <AccordionItem value="pessoais">
                      <AccordionTrigger className="font-semibold">Documentos Pessoais</AccordionTrigger>
                      <AccordionContent className="space-y-4 p-2">
                          {renderDocumentField('rg_url', 'Cópia do RG (Frente e Verso)', true)}
                          {renderDocumentField('cpf_url', 'Cópia do CPF', true)}
                          {renderDocumentField('ctps_url', 'Carteira de Trabalho (CTPS)', true)}
                          {renderDocumentField('cartao_pis_url', 'Cartão do PIS', false)}
                          {renderDocumentField('cnh_url', 'CNH (Se for motorista)', false)}
                      </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="militares">
                      <AccordionTrigger className="font-semibold">Obrigações Militares e Eleitorais</AccordionTrigger>
                      <AccordionContent className="space-y-4 p-2">
                          {renderDocumentField('titulo_eleitor_url', 'Título de Eleitor', false)}
                          {renderDocumentField('reservista_url', 'Certidão de Reservista (Homens +18)', false)}
                      </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="estado_civil">
                      <AccordionTrigger className="font-semibold">Estado Civil e Filiação</AccordionTrigger>
                      <AccordionContent className="space-y-4 p-2">
                          {renderDocumentField('certidao_nascimento_url', 'Certidão de Nascimento (Solteiro)', false)}
                          {renderDocumentField('certidao_casamento_url', 'Certidão de Casamento (Casado)', false)}
                          <FormItem>
                              <FormLabel>Certidões de Nascimento dos Filhos (Menores de 14)</FormLabel>
                              <Input type="file" multiple disabled placeholder="Em breve" />
                          </FormItem>
                      </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="outros">
                      <AccordionTrigger className="font-semibold">Outros Documentos</AccordionTrigger>
                      <AccordionContent className="space-y-4 p-2">
                          {renderDocumentField('comprovante_residencia_url', 'Comprovante de Residência', true)}
                          {renderDocumentField('comprovante_escolaridade_url', 'Comprovante de Escolaridade', true)}
                          {renderDocumentField('exame_admissional_url', 'Exame Médico Admissional', true)}
                          {renderDocumentField('foto_3x4_url', 'Foto 3x4', true)}
                          <FormField
                              control={form.control as unknown as Control<FormValues>}
                              name="ja_admitido_anteriormente"
                              render={({ field }) => (
                                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                      <FormControl>
                                          <Checkbox
                                              checked={field.value}
                                              onCheckedChange={field.onChange}
                                          />
                                      </FormControl>
                                      <div className="space-y-1 leading-none">
                                          <FormLabel>
                                              Já foi admitido anteriormente?
                                          </FormLabel>
                                      </div>
                                  </FormItem>
                              )}
                          />
                      </AccordionContent>
                  </AccordionItem>
              </Accordion>
            </TabsContent>
          )}

          {/* TAB 4: DADOS CONTRATUAIS (RH) - Apenas para Usuário/Funcionário */}
          {isUserBeingManagedByClient && (
            <TabsContent value="contrato" className="mt-4 space-y-6 p-4">
                <p className="text-sm text-muted-foreground">Estes campos são usados para gestão de RH.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderDateField('data_inicio_contrato', 'Início do Contrato', !isContractEditable)}
                    {renderDateField('data_fim_contrato', 'Fim do Contrato', !isContractEditable)}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderDateField('data_inicio_aviso', 'Início do Aviso Prévio', !isContractEditable)}
                    <FormField
                        control={form.control as unknown as Control<FormValues>}
                        name="tipo_aviso"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Tipo de Aviso</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value || 'Nenhum'} disabled={!isContractEditable}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione o tipo de aviso" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="Nenhum">Nenhum</SelectItem>
                                        <SelectItem value="Trabalhado">Trabalhado</SelectItem>
                                        <SelectItem value="Indenizado">Indenizado</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            </TabsContent>
          )}
        </Tabs>

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || uploading}>
          {(form.formState.isSubmitting || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Salvar Alterações' : 'Criar Conta'}
        </Button>
      </form>
    </Form>
  );
};

export default FormUsuario;