import React, { useState, useCallback } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Loader2, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, ClienteProfile, UsuarioProfile, AdminProfile } from '@/types/usuario';
import { PERMISSOES_DISPONIVEIS, Permissao } from '@/config/permissoes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { format } from 'date-fns';
import { useSessao } from '@/hooks/use-sessao';
import FormGeral from '../usuario-forms/FormGeral';
import FormFolgasFerias from '../usuario-forms/FormFolgasFerias';
import FormDadosCadastrais from '../usuario-forms/FormDadosCadastrais';
import FormDocumentos from '../usuario-forms/FormDocumentos';
import FormDadosContratuais from '../usuario-forms/FormDadosContratuais';
import { Form } from '@/components/ui/form';
import { Input } from '../ui/input';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '../ui/form';
import { Separator } from '../ui/separator';
import { useBulkTagManager } from '@/hooks/use-bulk-tag-manager';

// Esquema de validação para os campos de URL (opcional)
const urlSchema = z.string().url('URL inválida.').optional().or(z.literal(''));
const textOptional = z.string().optional().or(z.literal(''));

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
  cnpj: textOptional, // NOVO CAMPO
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

interface FormPerfilProps {
  perfilInicial: AnyProfile; // Garantindo que não é null
  onSaveComplete: () => void;
}

const FormPerfil: React.FC<FormPerfilProps> = ({ perfilInicial, onSaveComplete }) => {
  const { role } = useSessao();
  
  if (!perfilInicial) return null; 
    
  const isClient = 'limite_usuarios' in perfilInicial;
  const isUser = 'cliente_id' in perfilInicial;
  const isAdminProfile = role === 'Admin';
  
  const profileToEdit = perfilInicial as UsuarioProfile | ClienteProfile | AdminProfile;
  
  const isLoggedUserAdmin = role === 'Admin';
  
  const [activeTab, setActiveTab] = useState('pessoal');
  const [isSubmitting, setIsSubmitting] = useState(false); // ADICIONADO
  
  // Usamos o ID do perfil logado como resourceId para o bulk manager
  const resourceId = perfilInicial.id; 
  
  // Inicializa o hook de bulk tag (apenas para obter o refreshKey)
  const { refetchStatus, refreshKey } = useBulkTagManager(resourceId);

  const parseDate = (dateString: string | null | undefined) => 
    dateString ? new Date(dateString + 'T00:00:00') : undefined;

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
      limite_usuarios: isClient ? (profileToEdit as ClienteProfile).limite_usuarios : 5,
      permissoes: defaultPermissoes,
      
      // Dados de Folga
      dias_folga_fixos: (profileToEdit as UsuarioProfile)?.dias_folga_fixos || ['Saturday', 'Sunday'],
      folga_domingo_obrigatoria: (profileToEdit as UsuarioProfile)?.folga_domingo_obrigatoria ?? true,
      
      // Dados de Salário/Jornada
      salario: (profileToEdit as UsuarioProfile)?.salario || 0,
      horas_semanais: (profileToEdit as UsuarioProfile)?.horas_semanais || 44,
      horas_mensais: (profileToEdit as UsuarioProfile)?.horas_mensais || 220,

      // Dados Cadastrais
      cpf: (profileToEdit as UsuarioProfile)?.cpf || (profileToEdit as AdminProfile)?.cpf || '',
      cnpj: (profileToEdit as AdminProfile)?.cnpj || '', // NOVO CAMPO
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
    const permissoes = isClient ? PERMISSOES_DISPONIVEIS.filter((p: Permissao) => p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto') : PERMISSOES_DISPONIVEIS;
    permissoes.forEach((p: Permissao) => {
      form.setValue(`permissoes.${p.key}`, select, { shouldDirty: true });
    });
  };
  
  // Função de callback para forçar a atualização do status das tags individuais
  const handleTagToggle = useCallback(() => {
      refetchStatus();
  }, [refetchStatus]);
  
  // FIX: Definindo as variáveis de escopo que estavam faltando
  const isUserBeingManagedByClient = isUser;
  const isContractEditable = role === 'Admin' || role === 'Cliente';

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      
      const dataToUpdate: any = { nome: values.nome };
      
      if (values.senha) {
        const { error: authError } = await supabase.auth.updateUser({ password: values.senha });
        if (authError) throw authError;
      }

      if (isClient) {
        // Edição de Cliente (Empresa)
        
        // Apenas Admin pode alterar limite_usuarios e permissoes
        if (isLoggedUserAdmin) {
            dataToUpdate.limite_usuarios = values.limite_usuarios;
            dataToUpdate.permissoes = values.permissoes;
        }
        
        // Campos de Tags (Dados Cadastrais do Cliente)
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
        
        const { error } = await supabase.from('tbl_clientes').update(dataToUpdate).eq('id', perfilInicial.id);
        if (error) throw error;
        
      } else if (isUser) {
        // Edição de Usuário (Funcionário)
        
        // Permissões e dados de RH não podem ser alterados pelo próprio usuário
        const canEditUserAdminFields = role === 'Admin' || role === 'Cliente';
        
        if (canEditUserAdminFields) {
            dataToUpdate.permissoes = values.permissoes;
            
            // Dados de Folga
            dataToUpdate.dias_folga_fixos = values.dias_folga_fixos || [];
            dataToUpdate.folga_domingo_obrigatoria = values.folga_domingo_obrigatoria;
            
            // Dados de Salário/Jornada
            dataToUpdate.salario = values.salario;
            dataToUpdate.horas_semanais = values.horas_semanais;
            dataToUpdate.horas_mensais = values.horas_mensais;

            // Dados Contratuais
            dataToUpdate.data_inicio_contrato = values.data_inicio_contrato ? format(values.data_inicio_contrato, 'yyyy-MM-dd') : null;
            dataToUpdate.data_fim_contrato = values.data_fim_contrato ? format(values.data_fim_contrato, 'yyyy-MM-dd') : null;
            dataToUpdate.data_inicio_aviso = values.data_inicio_aviso ? format(values.data_inicio_aviso, 'yyyy-MM-dd') : null;
            dataToUpdate.tipo_aviso = values.tipo_aviso === 'Nenhum' ? null : values.tipo_aviso;
        }

        // Dados Cadastrais e Documentos podem ser editados pelo próprio usuário
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

        const { error } = await supabase.from('tbl_usuarios').update(dataToUpdate).eq('id', perfilInicial.id);
        if (error) throw error;
      } else if (isAdminProfile) {
        // Edição de Admin
        
        dataToUpdate.cpf = values.cpf || null;
        dataToUpdate.cnpj = values.cnpj || null; // NOVO CAMPO
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
        
        const { error } = await supabase.from('tbl_admins').update(dataToUpdate).eq('id', perfilInicial.id);
        if (error) throw error;
      }
      
      showSuccess('Perfil atualizado com sucesso!');
      refetchStatus(); // Força a re-busca do status das tags após o salvamento principal
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao salvar: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Permissões visíveis para o próprio usuário (apenas as que ele pode ter)
  const permissoesVisiveis = PERMISSOES_DISPONIVEIS.filter((p: Permissao) => 
    p.key === 'ponto_eletronico' || p.key === 'visualizar_proprio_ponto'
  );
  
  const formMethods = form;

  if (isClient || isAdminProfile) {
    // Renderização para Cliente (Empresa) ou Admin
    return (
      <FormProvider {...formMethods}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Tabs defaultValue="pessoal" className="w-full">
                <TabsList className="flex flex-wrap justify-start w-full h-auto p-1">
                    <TabsTrigger value="pessoal" className="flex-1 md:flex-none md:w-1/3">Geral</TabsTrigger>
                    <TabsTrigger value="cadastrais" className="flex-1 md:flex-none md:w-1/3">Dados Cadastrais</TabsTrigger>
                    {isClient && <TabsTrigger value="documentos" className="flex-1 md:flex-none md:w-1/3">Documentos</TabsTrigger>}
                </TabsList>
                
                {/* TAB 1: GERAL */}
                <TabsContent value="pessoal" className="mt-4 space-y-4 p-4">
                    <FormGeral
                        control={form.control}
                        isEditing={true}
                        isUserScope={false}
                        isSubmitting={isSubmitting}
                        criadorRole={role!}
                        permissoesVisiveis={PERMISSOES_DISPONIVEIS.filter((p: Permissao) => p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto')}
                        handleSelectAll={handleSelectAll}
                    />
                </TabsContent>
                
                {/* TAB 2: DADOS CADASTRAIS */}
                <TabsContent value="cadastrais" className="mt-4 space-y-6 p-4">
                    <div className="flex justify-between items-center">
                        <h3 className="font-semibold text-lg flex items-center"><Tag className="w-5 h-5 mr-2" /> Tags de Contrato</h3>
                        {/* Botões de Marcar/Desmarcar Todos Removidos */}
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">Estes campos são usados para preencher tags dinâmicas em contratos.</p>
                    
                    {/* Campos específicos do Admin (CPF/CNPJ) */}
                    {isAdminProfile && (
                        <div className="space-y-4">
                            <FormField control={form.control} name="cpf" render={({ field }) => (
                                <FormItem><FormLabel>CPF (Opcional)</FormLabel><FormControl><Input placeholder="000.000.000-00" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="cnpj" render={({ field }) => (
                                <FormItem><FormLabel>CNPJ (Opcional)</FormLabel><FormControl><Input placeholder="00.000.000/0000-00" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <Separator />
                        </div>
                    )}
                    
                    <FormDadosCadastrais 
                        control={form.control}
                        isSubmitting={isSubmitting}
                        resourceId={resourceId}
                        tagRefreshKey={refreshKey} // Passando o refreshKey do bulk manager
                        onTagToggle={handleTagToggle}
                    />
                </TabsContent>
                
                {/* TAB 3: DOCUMENTOS (Apenas Cliente) */}
                {isClient && (
                    <TabsContent value="documentos" className="mt-4 space-y-6 p-4">
                        <h3 className="font-semibold text-lg">Documentos da Empresa</h3>
                        <p className="text-sm text-muted-foreground mb-4">Anexe documentos importantes da sua empresa.</p>
                        
                        <FormDocumentos
                            control={form.control}
                            isSubmitting={isSubmitting}
                            resourceId={perfilInicial.id}
                        />
                    </TabsContent>
                )}
            </Tabs>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Alterações
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
                  isEditing={true}
                  isUserScope={true}
                  isSubmitting={isSubmitting}
                  criadorRole={role!}
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
                    <div className="flex justify-between items-center">
                        <h3 className="font-semibold text-lg flex items-center"><Tag className="w-5 h-5 mr-2" /> Tags de Contrato</h3>
                        {/* Botões de Marcar/Desmarcar Todos Removidos */}
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">Dados pessoais e de contato do funcionário.</p>
                    <FormDadosCadastrais
                        control={form.control}
                        isSubmitting={isSubmitting}
                        resourceId={resourceId}
                        tagRefreshKey={refreshKey}
                        onTagToggle={handleTagToggle}
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
            Salvar Alterações
          </Button>
        </form>
      </Form>
    </FormProvider>
  );
};

export default FormPerfil;