import React, { useState, useCallback, useEffect } from 'react';
import { useForm, Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Upload, CalendarIcon, CheckCircle2, XCircle, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, ClienteProfile, UsuarioProfile, UserRole } from '@/types/usuario';
import { PERMISSOES_DISPONIVEIS, Permissao } from '../config/permissoes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import GerenciarFerias from './GerenciarFerias';
import { useTagManager } from '@/hooks/use-tag-manager';
import { CAMPOS_CLIENTE_MAPA, CAMPOS_USUARIO_MAPA } from '@/config/contrato-campos-mapeaveis';
import { Label } from '@/components/ui/label';

const textOptional = z.string().optional().or(z.literal(''));
const urlSchema = z.string().url('URL inválida.').optional().or(z.literal(''));

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  email: z.string().email('Email inválido.'),
  // A senha é opcional apenas na edição. Na criação, usaremos inviteUserByEmail.
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
});

type FormValues = z.infer<typeof formSchema>;

interface FormUsuarioProps {
  criadorRole: UserRole;
  criadorPerfil: AnyProfile;
  usuarioInicial?: AnyProfile | null;
  onSaveComplete: () => void;
}

const DIAS_DA_SEMANA = [
    { value: 'Monday', label: 'Segunda-feira' },
    { value: 'Tuesday', label: 'Terça-feira' },
    { value: 'Wednesday', label: 'Quarta-feira' },
    { value: 'Thursday', label: 'Quinta-feira' },
    { value: 'Friday', label: 'Sexta-feira' },
    { value: 'Saturday', label: 'Sábado' },
    { value: 'Sunday', label: 'Domingo' },
];

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
  const isNewUser = !isEditing && !isNewClient;
  
  const profileToEdit = usuarioInicial as UsuarioProfile | ClienteProfile;
  
  const [activeTab, setActiveTab] = useState('pessoal');
  const [uploading, setUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tagRefreshKey, setTagRefreshKey] = useState(0);


  const parseDate = (dateString: string | null | undefined) => 
    dateString ? new Date(dateString + 'T00:00:00') : null;

  const defaultPermissoes = PERMISSOES_DISPONIVEIS.reduce((acc: Record<string, boolean>, p: Permissao) => {
    if (profileToEdit && 'permissoes' in profileToEdit && (profileToEdit as any).permissoes) {
      acc[p.key] = (profileToEdit as any).permissoes[p.key] !== false;
    } else {
      // Padrão para novos usuários/clientes
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

      // Contratuais (Apenas Usuário)
      data_inicio_contrato: parseDate((profileToEdit as UsuarioProfile)?.data_inicio_contrato),
      data_fim_contrato: parseDate((profileToEdit as UsuarioProfile)?.data_fim_contrato),
      data_inicio_aviso: parseDate((profileToEdit as UsuarioProfile)?.data_inicio_aviso),
      tipo_aviso: (profileToEdit as UsuarioProfile)?.tipo_aviso as FormValues['tipo_aviso'] || 'Nenhum',

      // Documentos (Apenas Usuário)
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
  
  const cepValue = form.watch('cep');
  const isClientScope = isClientBeingManagedByAdmin || isNewClient; // Variável de escopo
  
  // --- Funções Auxiliares ---

  const handleSelectAll = (select: boolean) => {
    const permissoes = isClientScope ? PERMISSOES_DISPONIVEIS.filter(p => p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto') : permissoesVisiveis;
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
  
  const fetchAddressByCep = useCallback(async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) return;
    
    form.setValue('endereco', 'Buscando...');
    form.setValue('bairro', 'Buscando...');
    form.setValue('cidade', 'Buscando...');
    form.setValue('estado', 'Buscando...');
    
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();

      if (data.erro) {
        showError('CEP não encontrado.');
        form.setValue('endereco', '');
        form.setValue('bairro', '');
        form.setValue('cidade', '');
        form.setValue('estado', '');
        return;
      }

      form.setValue('endereco', data.logradouro || '');
      form.setValue('bairro', data.bairro || '');
      form.setValue('cidade', data.localidade || '');
      form.setValue('estado', data.uf || '');
      
    } catch (error) {
      console.error('Erro ao consultar ViaCEP:', error);
      showError('Falha ao consultar o CEP.');
      form.setValue('endereco', '');
      form.setValue('bairro', '');
      form.setValue('cidade', '');
      form.setValue('estado', '');
    }
  }, [form]);
  
  useEffect(() => {
    const cleanCep = cepValue?.replace(/\D/g, '');
    if (cleanCep && cleanCep.length === 8) {
      fetchAddressByCep(cleanCep);
    }
  }, [cepValue, fetchAddressByCep]);

  // --- Componente Auxiliar para Campos com Tag ---
  
  interface TaggedFormFieldProps {
    fieldName: keyof FormValues;
    label: string;
    placeholder: string;
    resourceId: string | undefined;
    disabled: boolean;
    isOptional?: boolean;
    mapArray: { field: string, label: string, tag: string }[];
  }

  const TaggedFormField: React.FC<TaggedFormFieldProps> = ({ fieldName, label, placeholder, resourceId, disabled, isOptional = true, mapArray }) => {
    const fieldMap = mapArray.find(m => m.field === fieldName);
    
    // Se o campo não estiver mapeado para uma tag, renderiza o input normal
    if (!fieldMap || !resourceId) {
        return (
            <FormField control={form.control} name={fieldName} render={({ field }) => (
                <FormItem>
                    <FormLabel>{label} {isOptional && <span className="text-muted-foreground">(Opcional)</span>}</FormLabel>
                    <FormControl><Input placeholder={placeholder} {...field} value={(field.value as string) || ''} disabled={disabled} /></FormControl>
                    <FormMessage />
                </FormItem>
            )} />
        );
    }
    
    const { isTagActive, loading, toggleTag } = useTagManager(resourceId, fieldMap, tagRefreshKey);

    return (
        <FormField control={form.control} name={fieldName} render={({ field }) => (
            <FormItem>
                <div className="flex justify-between items-center">
                    <FormLabel>{label} {isOptional && <span className="text-muted-foreground">(Opcional)</span>}</FormLabel>
                    <div className="flex items-center space-x-1">
                        <Checkbox 
                            id={`tag-${fieldName}`}
                            checked={isTagActive}
                            onCheckedChange={(checked) => toggleTag(!!checked)}
                            disabled={loading || disabled}
                        />
                        <Label htmlFor={`tag-${fieldName}`} className={cn("text-xs font-normal flex items-center", isTagActive ? "text-primary" : "text-muted-foreground")}>
                            {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Tag className="w-3 h-3 mr-1" />}
                            Usar como Tag
                        </Label>
                    </div>
                </div>
                <FormControl><Input placeholder={placeholder} {...field} value={(field.value as string) || ''} disabled={disabled} /></FormControl>
                <FormMessage />
            </FormItem>
        )} />
    );
  };

  // --- Funções de Renderização de Campos ---

  const renderDocumentField = (fieldName: keyof FormValues, label: string, required: boolean = false) => {
    const url = form.watch(fieldName) as string | undefined;
    const isUploaded = !!url;
    const isSaving = form.formState.isSubmitting || uploading || isSubmitting; 

    const handleFileUpload = async (file: File) => {
        setUploading(true);

        try {
            const fileExt = file.name.split('.').pop();
            const resourceId = usuarioInicial?.id || criadorPerfil?.id;
            if (!resourceId) throw new Error('ID do recurso não encontrado para upload.');
            
            const filePath = `${resourceId}/documentos/${String(fieldName)}-${Date.now()}.${fileExt}`; 
            
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
                disabled={isSaving || isUploaded}
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
                disabled={isSaving}
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
                    handleFileUpload(e.target.files[0]);
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

  const renderInputField = (fieldName: keyof FormValues, label: string, placeholder: string, required: boolean = false, disabled: boolean = false) => (
    <FormField
      control={form.control}
      name={fieldName}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label} {required && <span className="text-red-500">*</span>}</FormLabel>
          <FormControl><Input placeholder={placeholder} {...field} value={(field.value as string) || ''} disabled={disabled} /></FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  // --- Lógica de Submissão ---

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    
    // 1. Determinar a tabela e o ID do cliente
    const tableName = getTableName(usuarioInicial || null, isNewClient, isNewUser);
    if (!tableName) {
        showError('Tabela de perfil não identificada.');
        setIsSubmitting(false);
        return;
    }
    
    try {
      const dataToUpdate: any = { nome: values.nome };
      
      // Lógica de Edição de Senha (APENAS SE ESTIVER EDITANDO)
      if (isEditing && values.senha) {
        const { error: authError } = await supabase.auth.updateUser({ password: values.senha });
        if (authError) throw authError;
      }

      if (isClientBeingManagedByAdmin || isNewClient) {
        // Edição/Criação de Cliente (Empresa)
        
        // Campos administrativos e de login
        const clientUpdatePayload: Partial<ClienteProfile> = {
            nome: values.nome,
            email: values.email, // Email é parte da identidade de login
            limite_usuarios: values.limite_usuarios,
            permissoes: values.permissoes,
        };
        
        if (isNewClient) {
            // CRIAÇÃO DE NOVO CLIENTE (ADMIN) - USANDO INVITE
            
            const { error: authError } = await (supabase.auth as any).inviteUserByEmail(values.email, {
                redirectTo: `${window.location.origin}/atualizar-senha`,
                data: { role: 'Cliente', nome: values.nome, cliente_id: null }
            });
            
            if (authError) throw authError;
            
            showSuccess(`Convite enviado para o email ${values.email}. O cliente deve clicar no link para finalizar o cadastro.`);
            onSaveComplete();
            return;
        }
        
        // Edição de Cliente (Admin)
        const { error } = await supabase.from('tbl_clientes').update(clientUpdatePayload).eq('id', usuarioInicial!.id);
        if (error) throw error;
        
      } else if (isUserBeingManagedByClient || isNewUser) {
        // Edição/Criação de Usuário (Funcionário)
        
        // Determina o ID do cliente/empresa para vincular o usuário
        let targetClienteId: string | null = null;
        if (isNewUser) {
            // Se for novo usuário, o cliente_id é o ID do criador (Admin ou Cliente)
            targetClienteId = criadorPerfil?.id || null;
        } else {
            // Se for edição, usa o cliente_id existente
            targetClienteId = (usuarioInicial as UsuarioProfile)?.cliente_id;
        }
        
        if (!targetClienteId) throw new Error('ID do cliente não encontrado para vincular o usuário.');

        dataToUpdate.permissoes = values.permissoes;
        
        // Dados de Folga
        dataToUpdate.dias_folga_fixos = values.dias_folga_fixos || [];
        dataToUpdate.folga_domingo_obrigatoria = values.folga_domingo_obrigatoria;
        
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
        
        if (isNewUser) {
            // CRIAÇÃO DE NOVO USUÁRIO (FUNCIONÁRIO) - USANDO INVITE
            
            const { error: authError } = await (supabase.auth as any).inviteUserByEmail(values.email, {
                redirectTo: `${window.location.origin}/atualizar-senha`,
                data: { role: 'Usuario', nome: values.nome, cliente_id: targetClienteId }
            });
            
            if (authError) throw authError;
            
            showSuccess(`Convite enviado para o email ${values.email}. O usuário deve clicar no link para definir a senha.`);
            onSaveComplete();
            return;
        }
        
        // Edição de Usuário
        const { error } = await supabase.from('tbl_usuarios').update(dataToUpdate).eq('id', usuarioInicial!.id);
        if (error) throw error;
      }
      
      showSuccess('Perfil atualizado com sucesso!');
      setTagRefreshKey(prev => prev + 1); // Força a re-busca do status das tags
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao salvar: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // --- Permissões Visíveis (Filtradas pelo Cliente Logado) ---
  const permissoesCliente = criadorRole === 'Cliente' ? (criadorPerfil as ClienteProfile)?.permissoes : {};
  const permissoesVisiveis = PERMISSOES_DISPONIVEIS.filter(p => {
    if (criadorRole === 'Admin') return true;
    // Se for Cliente, só pode gerenciar permissões que ele mesmo tem acesso
    return permissoesCliente[p.key] === true || p.key === 'visualizar_proprio_ponto' || p.key === 'ponto_eletronico';
  });
  
  const isContractEditable = criadorRole === 'Admin' || criadorRole === 'Cliente';
  const resourceId = usuarioInicial?.id;
  
  // Permissões que o Admin pode gerenciar para o Cliente (Empresa)
  const permissoesClienteAdmin = PERMISSOES_DISPONIVEIS.filter(p => p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto');


  // --- Renderização Principal ---

  if (isClientScope) {
    // Renderização para Cliente (Empresa)
    
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <h3 className="font-semibold text-lg">Dados de Identificação</h3>
          
          {/* Nome da Empresa (Mapeável) - AGORA SEM DISABLED NA CRIAÇÃO */}
          <TaggedFormField 
              fieldName="nome" 
              label="Nome da Empresa" 
              placeholder="Nome completo" 
              resourceId={resourceId} 
              disabled={false} // Removido o disabled condicional
              mapArray={CAMPOS_CLIENTE_MAPA}
              isOptional={false}
          />
          
          {/* Email de Login (Mapeável e desabilitado na edição) */}
          <TaggedFormField 
              fieldName="email" 
              label="Email (Login)" 
              placeholder="contato@empresa.com" 
              resourceId={resourceId} 
              disabled={isEditing}
              mapArray={CAMPOS_CLIENTE_MAPA}
              isOptional={false}
          />
          
          {/* SENHA: Apenas na edição */}
          {isEditing && renderInputField('senha', 'Alterar Senha (Opcional)', '••••••••', false, false)}
          
          <h4 className="font-semibold mt-6 border-t pt-4">Configurações e Permissões</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Os dados cadastrais (CPF/CNPJ, endereço, etc.) são gerenciados pelo próprio cliente na seção "Meu Perfil".
          </p>
          
          {renderNumberField('limite_usuarios', 'Limite de Usuários da Equipe', '5', !isEditing)}

          <div className="space-y-2">
            <div className="flex justify-between items-center mb-1">
              <FormLabel>Permissões de Acesso</FormLabel>
              <div className="space-x-2">
                <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(true)} className="p-0 h-auto">Selecionar Todos</Button>
                <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(false)} className="p-0 h-auto text-destructive">Desmarcar Todos</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
              {permissoesClienteAdmin.map((p: Permissao) => (
                <FormField key={p.key} control={form.control as unknown as Control<FormValues>} name={`permissoes.${p.key}`} render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={!isEditing} /></FormControl>
                    <FormLabel className="font-normal">{p.label}</FormLabel>
                  </FormItem>
                )} />
              ))}
            </div>
          </div>
          
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || isSubmitting}>
            {(form.formState.isSubmitting || isSubmitting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Salvar Alterações' : 'Enviar Convite de Cadastro'}
          </Button>
        </form>
      </Form>
    );
  }

  // Renderização para Usuário (Funcionário)
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex flex-wrap justify-start w-full h-auto p-1">
            <TabsTrigger value="pessoal" className="flex-1 md:flex-none md:w-1/5">Geral</TabsTrigger>
            {isUserBeingManagedByClient && <TabsTrigger value="folgas" className="flex-1 md:flex-none md:w-1/5">Folgas/Férias</TabsTrigger>}
            {isUserBeingManagedByClient && <TabsTrigger value="cadastrais" className="flex-1 md:flex-none md:w-1/5">Dados Cadastrais</TabsTrigger>}
            {isUserBeingManagedByClient && <TabsTrigger value="documentos" className="flex-1 md:flex-none md:w-1/5">Documentos</TabsTrigger>}
            {isUserBeingManagedByClient && <TabsTrigger value="contrato" className="flex-1 md:flex-none md:w-1/5">Contrato (RH)</TabsTrigger>}
          </TabsList>

          {/* TAB 1: GERAL (Nome, Email, Senha, Permissões, Salário) */}
          <TabsContent value="pessoal" className="mt-4 space-y-4 p-4">
            <FormField control={form.control as unknown as Control<FormValues>} name="nome" render={({ field }) => (
              <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input placeholder="Nome completo" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control as unknown as Control<FormValues>} name="email" render={({ field }) => (
              <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="email@exemplo.com" {...field} disabled={isEditing} /></FormControl><FormMessage /></FormItem>
            )} />
            {/* SENHA: Apenas na edição */}
            {isEditing && renderInputField('senha', 'Alterar Senha (Opcional)', '••••••••', false, false)}
            
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
          
          {/* TAB 2: FOLGAS E FÉRIAS */}
          {isUserBeingManagedByClient && (
            <TabsContent value="folgas" className="mt-4 space-y-6 p-4">
                <h4 className="font-semibold">Configuração de Folgas Fixas</h4>
                <FormField
                    control={form.control as unknown as Control<FormValues>}
                    name="folga_domingo_obrigatoria"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                            <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    disabled={isNewUser}
                                />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                                <FormLabel>
                                    Considerar Domingo como Folga Obrigatória (Padrão CLT)
                                </FormLabel>
                                <p className="text-sm text-muted-foreground">
                                    Configuração definida pela empresa.
                                </p>
                            </div>
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control as unknown as Control<FormValues>}
                    name="dias_folga_fixos"
                    render={() => (
                        <FormItem>
                            <FormLabel>Dias de Folga Fixos (Além do Domingo)</FormLabel>
                            <div className="grid grid-cols-3 gap-2">
                                {DIAS_DA_SEMANA.map((item) => (
                                    <FormField
                                        key={item.value}
                                        control={form.control as unknown as Control<FormValues>}
                                        name="dias_folga_fixos"
                                        render={({ field: arrayField }) => {
                                            const current = arrayField.value || [];
                                            const isChecked = current.includes(item.value);
                                            return (
                                                <FormItem
                                                    key={item.value}
                                                    className="flex flex-row items-start space-x-3 space-y-0"
                                                >
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={isChecked}
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    arrayField.onChange([...current, item.value]);
                                                                } else {
                                                                    arrayField.onChange(
                                                                        current.filter((value: string) => value !== item.value)
                                                                    );
                                                                }
                                                            }}
                                                            disabled={isNewUser}
                                                        />
                                                    </FormControl>
                                                    <FormLabel className="font-normal">
                                                        {item.label}
                                                    </FormLabel>
                                                </FormItem>
                                            );
                                        }}
                                    />
                                ))}
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                
                {isEditing && isUserBeingManagedByClient && (
                    <div className="pt-6 border-t">
                        <GerenciarFerias 
                            funcionarioId={usuarioInicial!.id} 
                            empresaId={(usuarioInicial as UsuarioProfile).cliente_id!} 
                        />
                    </div>
                )}
            </TabsContent>
          )}

          {/* TAB 3: DADOS CADASTRAIS (Apenas para Usuário/Funcionário) */}
          {isUserBeingManagedByClient && (
            <TabsContent value="cadastrais" className="mt-4 space-y-6 p-4">
              <p className="text-sm text-muted-foreground">Dados pessoais e de contato do funcionário.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TaggedFormField 
                      fieldName="cpf" 
                      label="CPF" 
                      placeholder="000.000.000-00" 
                      resourceId={resourceId} 
                      disabled={isNewUser}
                      mapArray={CAMPOS_USUARIO_MAPA}
                  />
                  <TaggedFormField 
                      fieldName="rg" 
                      label="RG" 
                      placeholder="00.000.000-0" 
                      resourceId={resourceId} 
                      disabled={isNewUser}
                      mapArray={CAMPOS_USUARIO_MAPA}
                  />
              </div>

              <TaggedFormField 
                  fieldName="nome_mae" 
                  label="Nome da Mãe" 
                  placeholder="Nome completo da mãe" 
                  resourceId={resourceId} 
                  disabled={isNewUser}
                  mapArray={CAMPOS_USUARIO_MAPA}
              />
              <TaggedFormField 
                  fieldName="nome_pai" 
                  label="Nome do Pai" 
                  placeholder="Nome completo do pai" 
                  resourceId={resourceId} 
                  disabled={isNewUser}
                  mapArray={CAMPOS_USUARIO_MAPA}
              />
              <TaggedFormField 
                  fieldName="telefone" 
                  label="Telefone de Contato" 
                  placeholder="(00) 90000-0000" 
                  resourceId={resourceId} 
                  disabled={isNewUser}
                  mapArray={CAMPOS_USUARIO_MAPA}
              />

              <h4 className="font-semibold mt-6 border-t pt-4">Endereço</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <TaggedFormField 
                      fieldName="cep" 
                      label="CEP" 
                      placeholder="00000-000" 
                      resourceId={resourceId} 
                      disabled={isNewUser}
                      mapArray={CAMPOS_USUARIO_MAPA}
                  />
                  <TaggedFormField 
                      fieldName="cidade" 
                      label="Cidade" 
                      placeholder="São Paulo" 
                      resourceId={resourceId} 
                      disabled={isNewUser}
                      mapArray={CAMPOS_USUARIO_MAPA}
                  />
                  <TaggedFormField 
                      fieldName="estado" 
                      label="Estado (UF)" 
                      placeholder="SP" 
                      resourceId={resourceId} 
                      disabled={isNewUser}
                      mapArray={CAMPOS_USUARIO_MAPA}
                  />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <TaggedFormField 
                      fieldName="endereco" 
                      label="Logradouro/Rua" 
                      placeholder="Rua Exemplo" 
                      resourceId={resourceId} 
                      disabled={isNewUser}
                      mapArray={CAMPOS_USUARIO_MAPA}
                  />
                  <TaggedFormField 
                      fieldName="numero" 
                      label="Número" 
                      placeholder="123" 
                      resourceId={resourceId} 
                      disabled={isNewUser}
                      mapArray={CAMPOS_USUARIO_MAPA}
                  />
                  <TaggedFormField 
                      fieldName="complemento" 
                      label="Complemento" 
                      placeholder="Apto 101" 
                      resourceId={resourceId} 
                      disabled={isNewUser}
                      mapArray={CAMPOS_USUARIO_MAPA}
                  />
              </div>
              <TaggedFormField 
                  fieldName="bairro" 
                  label="Bairro" 
                  placeholder="Centro" 
                  resourceId={resourceId} 
                  disabled={isNewUser}
                  mapArray={CAMPOS_USUARIO_MAPA}
              />
            </TabsContent>
          )}

          {/* TAB 4: DOCUMENTOS DE ADMISSÃO (Apenas para Usuário/Funcionário) */}
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

          {/* TAB 5: DADOS CONTRATUAIS (RH) - Apenas para Usuário/Funcionário) */}
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

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || uploading || isSubmitting}>
          {(form.formState.isSubmitting || uploading || isSubmitting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Salvar Alterações' : 'Enviar Convite de Cadastro'}
        </Button>
      </form>
    </Form>
  );
};

export default FormUsuario;