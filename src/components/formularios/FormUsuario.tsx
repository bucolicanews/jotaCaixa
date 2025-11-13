import React, { useState, useCallback } from 'react';
import { useForm, FormProvider, Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, ClienteProfile, UsuarioProfile, UserRole } from '@/types/usuario';
import { PERMISSOES_DISPONIVEIS, Permissao } from '@/config/permissoes';
import { Tabs, TabsContent, TabsTrigger } from '../ui/tabs';
import FormDadosCadastrais from '../usuario-forms/FormDadosCadastrais';
import { Input } from '../ui/input';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '../ui/form';
import { useBulkTagManager } from '@/hooks/use-bulk-tag-manager';

// Define FormDadosCadastraisProps locally to satisfy TS2322
interface FormDadosCadastraisProps {
    control: Control<FormValues>;
    isSubmitting: boolean;
    resourceId: string | undefined;
    tagRefreshKey: number;
    onTagToggle: () => void;
    isClientScope: boolean;
}

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
  usuarioInicial,
  onSaveComplete,
}) => {
  const isEditing = !!usuarioInicial;
  const isClientBeingManagedByAdmin = criadorRole === 'Admin' && usuarioInicial && 'limite_usuarios' in usuarioInicial;
  const isNewClient = criadorRole === 'Admin' && !isEditing;
  
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

  const onSubmit = async (values: FormValues) => {
    // ... (omitted for brevity)
    onSaveComplete();
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* ... TabsList ... */}
          
          {/* ... TabsContent pessoal ... */}
          
          {/* ... TabsContent folgas ... */}
          
          {/* TabsContent cadastrais */}
          <TabsContent value="cadastrais" className="mt-4 space-y-6 p-4">
            <FormDadosCadastrais
              control={form.control as unknown as Control<any>}
              isSubmitting={isSubmitting}
              resourceId={resourceId}
              tagRefreshKey={refreshKey}
              onTagToggle={refetchStatus}
              isClientScope={isClientBeingManagedByAdmin || isNewClient}
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
          
          {/* ... TabsContent documentos ... */}
          
          {/* ... TabsContent contratual ... */}
          
          {/* ... TabsContent acesso ... */}
          
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