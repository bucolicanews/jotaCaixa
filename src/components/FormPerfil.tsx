import React, { useState } from 'react';
import { useForm, Control, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, User, Upload, CalendarIcon, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, UserRole, UsuarioProfile } from '@/types/usuario';
import UserAvatar from './UserAvatar';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';

// Esquema de validação para os campos de URL (opcional)
const urlSchema = z.string().url('URL inválida.').optional().or(z.literal(''));

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  
  // Dados Contratuais (Admin/Cliente only)
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
  // certidoes_filhos_urls: z.any().optional(), // Manteremos simples por enquanto
});

type FormValues = z.infer<typeof formSchema>;

interface FormPerfilProps {
  perfil: AnyProfile;
  role: UserRole;
  onSaveComplete: () => void;
}

const FormPerfil: React.FC<FormPerfilProps> = ({ perfil, role, onSaveComplete }) => {
  const isUsuario = role === 'Usuario';
  const isManager = role === 'Admin' || role === 'Cliente';
  const usuarioProfile = perfil as UsuarioProfile;

  const parseDate = (dateString: string | null | undefined) => 
    dateString ? new Date(dateString + 'T00:00:00') : null;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: perfil?.nome || '',
      
      // Contratuais
      data_inicio_contrato: parseDate(usuarioProfile?.data_inicio_contrato),
      data_fim_contrato: parseDate(usuarioProfile?.data_fim_contrato),
      data_inicio_aviso: parseDate(usuarioProfile?.data_inicio_aviso),
      // Correção 2: Garantir que o valor padrão seja compatível com o enum ou null
      tipo_aviso: (usuarioProfile?.tipo_aviso as FormValues['tipo_aviso']) || 'Nenhum',

      // Documentos
      rg_url: usuarioProfile?.rg_url || '',
      cpf_url: usuarioProfile?.cpf_url || '',
      titulo_eleitor_url: usuarioProfile?.titulo_eleitor_url || '',
      reservista_url: usuarioProfile?.reservista_url || '',
      ctps_url: usuarioProfile?.ctps_url || '',
      certidao_nascimento_url: usuarioProfile?.certidao_nascimento_url || '',
      certidao_casamento_url: usuarioProfile?.certidao_casamento_url || '',
      comprovante_residencia_url: usuarioProfile?.comprovante_residencia_url || '',
      comprovante_escolaridade_url: usuarioProfile?.comprovante_escolaridade_url || '',
      exame_admissional_url: usuarioProfile?.exame_admissional_url || '',
      foto_3x4_url: usuarioProfile?.foto_3x4_url || '',
      cnh_url: usuarioProfile?.cnh_url || '',
      cartao_pis_url: usuarioProfile?.cartao_pis_url || '',
      ja_admitido_anteriormente: usuarioProfile?.ja_admitido_anteriormente || false,
    },
  });

  const [activeTab, setActiveTab] = useState('pessoal');
  const [uploading, setUploading] = useState(false);

  const getTableName = (currentRole: UserRole) => {
    if (currentRole === 'Admin') return 'tbl_admins';
    if (currentRole === 'Cliente') return 'tbl_clientes';
    if (currentRole === 'Usuario') return 'tbl_usuarios';
    throw new Error('Role inválida.');
  };
  
  // Correção 9: Definir tableName no escopo do componente
  const tableName = role ? getTableName(role) : null;

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    if (!perfil || !role || !tableName) return;

    try {
      
      // 1. Preparar dados para atualização
      const dataToUpdate: any = { nome: values.nome };

      // Se for Usuário, ele só pode atualizar o nome e os campos de documentos
      if (isUsuario) {
        dataToUpdate.rg_url = values.rg_url;
        dataToUpdate.cpf_url = values.cpf_url;
        dataToUpdate.titulo_eleitor_url = values.titulo_eleitor_url;
        dataToUpdate.reservista_url = values.reservista_url;
        dataToUpdate.ctps_url = values.ctps_url;
        dataToUpdate.certidao_nascimento_url = values.certidao_nascimento_url;
        dataToUpdate.certidao_casamento_url = values.certidao_casamento_url;
        dataToUpdate.comprovante_residencia_url = values.comprovante_residencia_url;
        dataToUpdate.comprovante_escolaridade_url = values.comprovante_escolaridade_url;
        dataToUpdate.exame_admissional_url = values.exame_admissional_url;
        dataToUpdate.foto_3x4_url = values.foto_3x4_url;
        dataToUpdate.cnh_url = values.cnh_url;
        dataToUpdate.cartao_pis_url = values.cartao_pis_url;
        dataToUpdate.ja_admitido_anteriormente = values.ja_admitido_anteriormente;
        // Não atualiza campos contratuais
      }
      
      // Se for Admin/Cliente, ele pode atualizar todos os campos do Usuário
      if (isManager && tableName === 'tbl_usuarios') {
        dataToUpdate.data_inicio_contrato = values.data_inicio_contrato ? format(values.data_inicio_contrato, 'yyyy-MM-dd') : null;
        dataToUpdate.data_fim_contrato = values.data_fim_contrato ? format(values.data_fim_contrato, 'yyyy-MM-dd') : null;
        dataToUpdate.data_inicio_aviso = values.data_inicio_aviso ? format(values.data_inicio_aviso, 'yyyy-MM-dd') : null;
        dataToUpdate.tipo_aviso = values.tipo_aviso === 'Nenhum' ? null : values.tipo_aviso;
        
        // Permite que o manager edite os campos de documentos também, se necessário
        dataToUpdate.rg_url = values.rg_url;
        dataToUpdate.cpf_url = values.cpf_url;
        dataToUpdate.titulo_eleitor_url = values.titulo_eleitor_url;
        dataToUpdate.reservista_url = values.reservista_url;
        dataToUpdate.ctps_url = values.ctps_url;
        dataToUpdate.certidao_nascimento_url = values.certidao_nascimento_url;
        dataToUpdate.certidao_casamento_url = values.certidao_casamento_url;
        dataToUpdate.comprovante_residencia_url = values.comprovante_residencia_url;
        dataToUpdate.comprovante_escolaridade_url = values.comprovante_escolaridade_url;
        dataToUpdate.exame_admissional_url = values.exame_admissional_url;
        dataToUpdate.foto_3x4_url = values.foto_3x4_url;
        dataToUpdate.cnh_url = values.cnh_url;
        dataToUpdate.cartao_pis_url = values.cartao_pis_url;
        dataToUpdate.ja_admitido_anteriormente = values.ja_admitido_anteriormente;
      }

      // 2. Atualizar a tabela de perfil
      const { error: profileError } = await supabase
        .from(tableName)
        .update(dataToUpdate)
        .eq('id', perfil.id);

      if (profileError) throw profileError;

      // 3. Atualizar o nome no auth.users
      await supabase.auth.updateUser({ data: { nome: values.nome } });

      showSuccess('Perfil atualizado com sucesso!');
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao salvar perfil: ${error.message}`);
    }
  };

  // --- Funções de Upload ---

  const handleFileUpload = async (file: File, fieldName: keyof FormValues) => {
    if (!perfil) return;
    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${perfil.id}/${fieldName}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documentos-admissao')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('documentos-admissao').getPublicUrl(filePath);
      
      // Atualiza o campo do formulário com a URL pública
      form.setValue(fieldName, publicUrlData.publicUrl as any, { shouldDirty: true });
      showSuccess('Documento anexado com sucesso!');

    } catch (error: any) {
      console.error('Erro de upload:', error);
      showError('Falha ao anexar documento: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  // Correção 3, 5, 7, 8, 10: Tipagem correta do control e field.value
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
                // Correção 4: Garantir que o valor seja string para o input
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
                    // TODO: Implementar exclusão do arquivo no storage
                    form.setValue(fieldName, '' as any, { shouldDirty: true });
                    showSuccess('Link do documento removido. Salve para confirmar.');
                  } else {
                    // Simular clique no input file
                    document.getElementById(`file-upload-${fieldName}`)?.click();
                  }
                }}
                disabled={isSubmitting}
              >
                {isUploaded ? <XCircle className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
              </Button>
              <input
                id={`file-upload-${fieldName}`}
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Gerenciar Perfil</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 h-auto">
                <TabsTrigger value="pessoal">Dados Pessoais</TabsTrigger>
                <TabsTrigger value="documentos">Documentos</TabsTrigger>
                {isManager && <TabsTrigger value="contrato">Contrato (RH)</TabsTrigger>}
              </TabsList>

              {/* TAB 1: DADOS PESSOAIS */}
              <TabsContent value="pessoal" className="mt-4 space-y-4">
                <div className="flex flex-col items-center space-y-4">
                  <UserAvatar profile={perfil} className="h-20 w-20" />
                  <Button variant="outline" size="sm" disabled>
                    <User className="w-4 h-4 mr-2" />
                    Alterar Foto (Em Breve)
                  </Button>
                </div>

                <FormField
                  control={form.control as unknown as Control<FormValues>}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo</FormLabel>
                      <FormControl>
                        <Input placeholder="Seu nome" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <Input value={perfil?.email || ''} disabled className="bg-muted/50" />
                </FormItem>
              </TabsContent>

              {/* TAB 2: DOCUMENTOS DE ADMISSÃO */}
              <TabsContent value="documentos" className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">Anexe os documentos obrigatórios. O link será gerado automaticamente após o upload.</p>
                
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
                            {/* TODO: Implementar upload de certidões de filhos (JSONB) */}
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

              {/* TAB 3: DADOS CONTRATUAIS (APENAS ADMIN/CLIENTE) */}
              {isManager && tableName === 'tbl_usuarios' && (
                <TabsContent value="contrato" className="mt-4 space-y-4">
                    <p className="text-sm text-muted-foreground">Estes campos são usados para gestão de RH e só podem ser editados por administradores ou gestores da empresa.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderDateField('data_inicio_contrato', 'Início do Contrato', !isManager)}
                        {renderDateField('data_fim_contrato', 'Fim do Contrato', !isManager)}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderDateField('data_inicio_aviso', 'Início do Aviso Prévio', !isManager)}
                        <FormField
                            control={form.control as unknown as Control<FormValues>}
                            name="tipo_aviso"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Tipo de Aviso</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value || 'Nenhum'} disabled={!isManager}>
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
              Salvar Alterações
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default FormPerfil;