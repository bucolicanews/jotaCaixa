import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Loader2, Tag, FileSignature } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, ClienteProfile, AdminProfile } from '@/types/usuario';
import { PERMISSOES_DISPONIVEIS, Permissao } from '@/config/permissoes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Form } from '@/components/ui/form';
import { Input } from '../ui/input';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '../ui/form';
import { Separator } from '../ui/separator';
import { useBulkTagManager } from '@/hooks/use-bulk-tag-manager';
import { Checkbox } from '../ui/checkbox';
import { useSessao } from '@/hooks/use-sessao';
import LogoUpload from '../LogoUpload';
import FormDadosCadastrais from '../usuario-forms/FormDadosCadastrais';

const textOptional = z.string().optional().or(z.literal(''));

// Esquema focado em Admin/Cliente
const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  email: z.string().email('Email inválido.'),
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').optional().or(z.literal('')),
  
  // Campos de Cliente/Admin
  limite_usuarios: z.coerce.number().int().min(1, 'O limite deve ser pelo menos 1.').optional(),
  permissoes: z.record(z.boolean()).optional(),
  
  // NOVOS CAMPOS DE ASSINATURA
  assinatura_proprietario_nome: textOptional,
  assinatura_proprietario_url: textOptional,
  
  // Dados Cadastrais (Comum a Cliente e Admin)
  cpf: textOptional,
  cnpj: textOptional,
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
  
  // Campos específicos de Cliente
  razao_social: textOptional,
  nome_fantasia: textOptional,
  documento: textOptional,
});

type FormValues = z.infer<typeof formSchema>;

interface FormPerfilProps {
  perfilInicial: AnyProfile; // Garantindo que não é null
  onSaveComplete: () => void;
  isReadOnly?: boolean; // NOVO PROP
}

const FormPerfil: React.FC<FormPerfilProps> = ({ perfilInicial, onSaveComplete, isReadOnly = false }) => {
  const { role, refetch } = useSessao();
  
  if (!perfilInicial) return null; 
    
  const isClient = 'limite_usuarios' in perfilInicial;
  const isAdminProfile = role === 'Admin';
  
  const profileToEdit = perfilInicial as ClienteProfile | AdminProfile;
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const resourceId = perfilInicial.id; 
  const { refetchStatus, refreshKey } = useBulkTagManager(resourceId);

  const defaultPermissoes = useMemo(() => {
      return PERMISSOES_DISPONIVEIS.reduce((acc: Record<string, boolean>, p: Permissao) => {
        if (profileToEdit && 'permissoes' in profileToEdit && (profileToEdit as any).permissoes) {
          acc[p.key] = (profileToEdit as any).permissoes[p.key] !== false;
        } else {
          acc[p.key] = true;
        }
        return acc;
      }, {} as Record<string, boolean>);
  }, [profileToEdit]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: profileToEdit?.nome || '',
      email: profileToEdit?.email || '',
      senha: '',
      limite_usuarios: isClient ? (profileToEdit as ClienteProfile).limite_usuarios : 5,
      permissoes: defaultPermissoes,
      
      // NOVOS CAMPOS DE ASSINATURA
      assinatura_proprietario_nome: (profileToEdit as ContratoGerado)?.assinatura_proprietario_nome || profileToEdit?.nome || '',
      assinatura_proprietario_url: (profileToEdit as ContratoGerado)?.assinatura_proprietario_url || (profileToEdit as AdminProfile)?.logo_url || (profileToEdit as ClienteProfile)?.logo_url || '',
      
      // Dados Cadastrais
      cpf: (profileToEdit as AdminProfile)?.cpf || (profileToEdit as ClienteProfile)?.cpf || '',
      cnpj: (profileToEdit as AdminProfile)?.cnpj || '',
      rg: (profileToEdit as AdminProfile)?.rg || (profileToEdit as ClienteProfile)?.rg || '',
      nome_mae: (profileToEdit as AdminProfile)?.nome_mae || '',
      nome_pai: (profileToEdit as AdminProfile)?.nome_pai || '',
      telefone: (profileToEdit as AdminProfile)?.telefone || (profileToEdit as ClienteProfile)?.telefone || '',
      cep: (profileToEdit as AdminProfile)?.cep || (profileToEdit as ClienteProfile)?.cep || '',
      endereco: (profileToEdit as AdminProfile)?.endereco || (profileToEdit as ClienteProfile)?.endereco || '',
      numero: (profileToEdit as AdminProfile)?.numero || (profileToEdit as ClienteProfile)?.numero || '',
      complemento: (profileToEdit as AdminProfile)?.complemento || (profileToEdit as ClienteProfile)?.complemento || '',
      bairro: (profileToEdit as AdminProfile)?.bairro || (profileToEdit as ClienteProfile)?.bairro || '',
      cidade: (profileToEdit as AdminProfile)?.cidade || (profileToEdit as ClienteProfile)?.cidade || '',
      estado: (profileToEdit as AdminProfile)?.estado || (profileToEdit as ClienteProfile)?.estado || '',
      
      // Campos específicos de Cliente
      razao_social: (profileToEdit as ClienteProfile)?.razao_social || '',
      nome_fantasia: (profileToEdit as ClienteProfile)?.nome_fantasia || '',
      documento: (profileToEdit as ClienteProfile)?.documento || '',
    },
  });
  
  const cepValue = form.watch('cep');
  const isAddressLoading = form.watch('endereco') === 'Buscando...'; // NOVO ESTADO DE CARREGAMENTO
  
  const fetchAddressByCep = useCallback(async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) {
      return;
    }
    
    // Bloqueia a edição dos campos enquanto busca
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

      // Preenche os campos
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
  
  // Monitora a mudança do CEP para buscar o endereço
  useEffect(() => {
    const cleanCep = cepValue?.replace(/\D/g, '');
    if (cleanCep && cleanCep.length === 8) {
      fetchAddressByCep(cleanCep);
    }
  }, [cepValue, fetchAddressByCep]);


  const handleSelectAll = (select: boolean) => {
    if (isClient) return; // Bloqueia se for Cliente
    if (isReadOnly) return; 
    const permissoes = PERMISSOES_DISPONIVEIS.filter((p: Permissao) => p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto');
    permissoes.forEach((p: Permissao) => {
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
      await refetch();
  }, [refetch, form]);
  
  // NOVO HANDLER: Sincroniza a URL da Logo com o campo de assinatura (usado pelo checkbox)
  const handleSyncUrl = useCallback((url: string | null) => {
      form.setValue('assinatura_proprietario_url', url || '');
  }, [form]);

  const onSubmit = async (values: FormValues) => {
    if (isReadOnly) {
        showError('O perfil está em modo somente leitura.');
        return;
    }
    
    setIsSubmitting(true);
    try {
      
      const dataToUpdate: any = { 
          nome: values.nome,
          assinatura_proprietario_nome: values.assinatura_proprietario_nome || null,
          assinatura_proprietario_url: values.assinatura_proprietario_url || null,
      };
      
      // 1. Senha: Bloqueado para Cliente, permitido para Admin
      if (values.senha && !isClient) {
        const { error: authError } = await supabase.auth.updateUser({ password: values.senha });
        if (authError) throw authError;
      }

      if (isClient) {
        // Edição de Cliente (Empresa)
        
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
        
        // Campos específicos de Cliente
        dataToUpdate.razao_social = values.razao_social || null;
        dataToUpdate.nome_fantasia = values.nome_fantasia || null;
        dataToUpdate.documento = values.documento || null;
        
        // Adiciona a URL da logo (que é a mesma da assinatura)
        dataToUpdate.logo_url = values.assinatura_proprietario_url || null;
        
        const { error } = await supabase.from('tbl_clientes').update(dataToUpdate).eq('id', perfilInicial.id);
        if (error) throw error;
        
      } else if (isAdminProfile) {
        // Edição de Admin
        
        dataToUpdate.cpf = values.cpf || null;
        dataToUpdate.cnpj = values.cnpj || null;
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
        
        // Adiciona a URL da logo (que é a mesma da assinatura)
        dataToUpdate.logo_url = values.assinatura_proprietario_url || null;
        
        const { error } = await supabase.from('tbl_admins').update(dataToUpdate).eq('id', perfilInicial.id);
        if (error) throw error;
      }
      
      showSuccess('Perfil atualizado com sucesso!');
      refetchStatus();
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao salvar: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const formMethods = form;

  return (
    <FormProvider {...formMethods}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Tabs defaultValue="pessoal" className="w-full">
              <TabsList className="flex flex-wrap justify-start w-full h-auto p-1">
                  <TabsTrigger value="pessoal" className="flex-1 md:flex-none md:w-1/2">Geral</TabsTrigger>
                  <TabsTrigger value="cadastrais" className="flex-1 md:flex-none md:w-1/2">Dados Cadastrais</TabsTrigger>
              </TabsList>
              
              {/* TAB 1: GERAL */}
              <TabsContent value="pessoal" className="mt-4 space-y-4 p-4">
                  <FormField control={form.control} name="nome" render={({ field }) => (
                      <FormItem><FormLabel>Nome Completo</FormLabel><FormControl><Input placeholder="Nome completo" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="email@exemplo.com" {...field} disabled /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="senha" render={({ field }) => (
                      <FormItem><FormLabel>Alterar Senha (Opcional)</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} disabled={isReadOnly || isClient} /></FormControl><FormMessage /></FormItem>
                  )} />
                  
                  {/* Configurações de Branding e Assinatura */}
                  {(isAdminProfile || isClient) && (
                      <>
                          <Separator />
                          <h3 className="font-semibold text-lg flex items-center"><FileSignature className="w-4 h-4 mr-2" /> Assinatura e Branding</h3>
                          
                          <FormField control={form.control} name="assinatura_proprietario_nome" render={({ field }) => (
                              <FormItem><FormLabel>Nome da Empresa/Pessoa para Assinatura</FormLabel><FormControl><Input placeholder="Ex: Minha Empresa LTDA" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                          )} />
                          
                          <FormField control={form.control} name="assinatura_proprietario_url" render={({ field }) => (
                              <FormItem><FormLabel>URL da Imagem de Assinatura (Logo)</FormLabel><FormControl><Input placeholder="URL da imagem de assinatura" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                          )} />
                          
                          <LogoUpload 
                              ownerId={perfilInicial.id}
                              tableName={isAdminProfile ? 'tbl_admins' : 'tbl_clientes'}
                              initialLogoUrl={form.watch('assinatura_proprietario_url')}
                              onUploadComplete={handleLogoUploadComplete}
                              onSyncUrl={handleSyncUrl} // NOVO PROP
                              isReadOnly={isSubmitting || isReadOnly}
                          />
                      </>
                  )}
                  
                  {isClient && (
                      <>
                          <Separator />
                          <h3 className="font-semibold text-lg">Configurações da Empresa</h3>
                          <FormField control={form.control} name="limite_usuarios" render={({ field }) => (
                              <FormItem><FormLabel>Limite de Usuários</FormLabel><FormControl><Input type="number" placeholder="5" {...field} disabled={isReadOnly || isClient} /></FormControl><FormMessage /></FormItem>
                          )} />
                          
                          <div className="space-y-2 pt-4">
                              <div className="flex justify-between items-center mb-1">
                                  <FormLabel>Permissões de Acesso</FormLabel>
                                  <div className="space-x-2">
                                      <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(true)} className="p-0 h-auto" disabled={isSubmitting || isReadOnly || isClient}>Selecionar Todos</Button>
                                      <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(false)} className="p-0 h-auto text-destructive" disabled={isSubmitting || isReadOnly || isClient}>Desmarcar Todos</Button>
                                  </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                                  {PERMISSOES_DISPONIVEIS.filter((p: Permissao) => p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto').map((p: Permissao) => (
                                      <FormField key={p.key} control={form.control} name={`permissoes.${p.key}`} render={({ field }) => (
                                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                              <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting || isReadOnly || isClient} /></FormControl>
                                              <FormLabel className="font-normal">{p.label}</FormLabel>
                                          </FormItem>
                                      )} />
                                  ))}
                              </div>
                          </div>
                      </>
                  )}
              </TabsContent>
              
              {/* TAB 2: DADOS CADASTRAIS */}
              <TabsContent value="cadastrais" className="mt-4 space-y-6 p-4">
                  <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-lg flex items-center"><Tag className="w-5 h-5 mr-2" /> Tags de Contrato</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">Estes campos são usados para preencher tags dinâmicas em contratos.</p>
                  
                  {/* Campos específicos do Admin (CPF/CNPJ) */}
                  {isAdminProfile && (
                      <div className="space-y-4">
                          <FormField control={form.control} name="cpf" render={({ field }) => (
                              <FormItem><FormLabel>CPF (Opcional)</FormLabel><FormControl><Input placeholder="000.000.000-00" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="cnpj" render={({ field }) => (
                              <FormItem><FormLabel>CNPJ (Opcional)</FormLabel><FormControl><Input placeholder="00.000.000/0000-00" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="rg" render={({ field }) => (
                              <FormItem><FormLabel>RG (Opcional)</FormLabel><FormControl><Input placeholder="00.000.000-0" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <Separator />
                      </div>
                  )}
                  
                  {/* Campos específicos de Cliente */}
                  {isClient && (
                      <div className="space-y-4">
                          <FormField control={form.control} name="razao_social" render={({ field }) => (
                              <FormItem><FormLabel>Razão Social (Opcional)</FormLabel><FormControl><Input placeholder="Razão Social" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="nome_fantasia" render={({ field }) => (
                              <FormItem><FormLabel>Nome Fantasia (Opcional)</FormLabel><FormControl><Input placeholder="Nome Fantasia" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="documento" render={({ field }) => (
                              <FormItem><FormLabel>Documento (CPF/CNPJ)</FormLabel><FormControl><Input placeholder="00.000.000/0000-00" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <Separator />
                      </div>
                  )}
                  
                  {/* Campos de Endereço e Contato (Comum a Admin e Cliente) */}
                  <h3 className="font-semibold text-lg">Endereço e Contato</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="telefone" render={({ field }) => (
                          <FormItem><FormLabel>Telefone</FormLabel><FormControl><Input placeholder="(00) 90000-0000" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="cep" render={({ field }) => (
                          <FormItem><FormLabel>CEP</FormLabel><FormControl><Input placeholder="00000-000" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                      )} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField control={form.control} name="endereco" render={({ field }) => (
                          <FormItem><FormLabel>Logradouro/Rua</FormLabel><FormControl><Input placeholder="Rua Exemplo" {...field} disabled={isReadOnly || isAddressLoading} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="numero" render={({ field }) => (
                          <FormItem><FormLabel>Número</FormLabel><FormControl><Input placeholder="123" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="complemento" render={({ field }) => (
                          <FormItem><FormLabel>Complemento</FormLabel><FormControl><Input placeholder="Apto 101" {...field} disabled={isReadOnly} /></FormControl><FormMessage /></FormItem>
                      )} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField control={form.control} name="bairro" render={({ field }) => (
                          <FormItem><FormLabel>Bairro</FormLabel><FormControl><Input placeholder="Centro" {...field} disabled={isReadOnly || isAddressLoading} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="cidade" render={({ field }) => (
                          <FormItem><FormLabel>Cidade</FormLabel><FormControl><Input placeholder="São Paulo" {...field} disabled={isReadOnly || isAddressLoading} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="estado" render={({ field }) => (
                          <FormItem><FormLabel>Estado (UF)</FormLabel><FormControl><Input placeholder="PA" {...field} disabled={isReadOnly || isAddressLoading} /></FormControl><FormMessage /></FormItem>
                      )} />
                  </div>
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
};

export default FormPerfil;