import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useForm, FormProvider, Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Loader2, FileSignature, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ClienteProfile, AnyProfile, UserRole } from '@/types/usuario';
import { PERMISSOES_DISPONIVEIS, Permissao } from '@/config/permissoes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '../ui/form';
import { Input } from '../ui/input';
import { Separator } from '../ui/separator';
import { Checkbox } from '../ui/checkbox';
import LogoUpload from '../LogoUpload';
import FormIdentificacao from '../cliente-forms/FormIdentificacao';
import FormContato from '../cliente-forms/FormContato';
import FormEndereco from '../cliente-forms/FormEndereco';
import { useBulkTagManager } from '@/hooks/use-bulk-tag-manager';
import { BASE_URL } from '@/config/app-config';

const textOptional = z.string().optional().or(z.literal(''));

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  email: z.string().email('Email inválido.'),
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').optional().or(z.literal('')),
  
  // Campos de Cliente/Admin
  limite_usuarios: z.coerce.number().int().min(1, 'O limite deve ser pelo menos 1.').optional(),
  permissoes: z.record(z.boolean()).optional(),
  
  // NOVOS CAMPOS DE ASSINATURA (Sincronizados com LogoUpload)
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

interface FormClientCompanyProps {
    criadorRole: UserRole;
    criadorPerfil: AnyProfile;
    clientProfile: ClienteProfile | null;
    isNewClient: boolean;
    isReadOnly: boolean;
    onSaveComplete: () => void;
}

const FormClientCompany: React.FC<FormClientCompanyProps> = ({
    criadorRole,
    criadorPerfil,
    clientProfile,
    isNewClient,
    isReadOnly,
    onSaveComplete,
}) => {
    const [activeTab, setActiveTab] = useState('pessoal');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const isEditing = !!clientProfile;
    const resourceId = clientProfile?.id;
    const { refetchStatus, refreshKey } = useBulkTagManager(resourceId);
    
    const defaultPermissoes = useMemo(() => {
        return PERMISSOES_DISPONIVEIS.reduce((acc: Record<string, boolean>, p: Permissao) => {
            if (clientProfile?.permissoes) {
                acc[p.key] = clientProfile.permissoes[p.key] === true;
            } else {
                acc[p.key] = false;
            }
            return acc;
        }, {} as Record<string, boolean>);
    }, [clientProfile]);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            nome: clientProfile?.nome || '',
            email: clientProfile?.email || '',
            senha: '',
            limite_usuarios: clientProfile?.limite_usuarios || 5,
            permissoes: defaultPermissoes,
            
            assinatura_proprietario_nome: clientProfile?.assinatura_proprietario_nome || clientProfile?.nome || '',
            assinatura_proprietario_url: clientProfile?.assinatura_proprietario_url || clientProfile?.logo_url || '',
            
            cpf: clientProfile?.cpf || '',
            cnpj: clientProfile?.cnpj || '',
            rg: clientProfile?.rg || '',
            telefone: clientProfile?.telefone || '',
            cep: clientProfile?.cep || '',
            endereco: clientProfile?.endereco || '',
            numero: clientProfile?.numero || '',
            complemento: clientProfile?.complemento || '',
            bairro: clientProfile?.bairro || '',
            cidade: clientProfile?.cidade || '',
            estado: clientProfile?.estado || '',
            
            razao_social: clientProfile?.razao_social || '',
            nome_fantasia: clientProfile?.nome_fantasia || '',
            documento: clientProfile?.documento || '',
        },
    });
    
    const { watch, setValue } = form;
    const cepValue = watch('cep');
    const isAddressLoading = watch('endereco') === 'Buscando...';

    const handleCepLookup = useCallback(async (cep: string) => {
        const cleanCep = cep.replace(/\D/g, '');
        if (cleanCep.length !== 8) return;
        
        setValue('endereco', 'Buscando...');
        setValue('bairro', 'Buscando...');
        setValue('cidade', 'Buscando...');
        setValue('estado', 'Buscando...');
        
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
            const data = await response.json();

            if (data.erro) {
                showError('CEP não encontrado.');
                setValue('endereco', ''); setValue('bairro', ''); setValue('cidade', ''); setValue('estado', '');
                return;
            }
            setValue('endereco', data.logradouro || '');
            setValue('bairro', data.bairro || '');
            setValue('cidade', data.localidade || '');
            setValue('estado', data.uf || '');
        } catch (error) {
            showError('Falha ao consultar o CEP.');
            setValue('endereco', ''); setValue('bairro', ''); setValue('cidade', ''); setValue('estado', '');
        }
    }, [setValue]);

    useEffect(() => {
        const cleanCep = cepValue?.replace(/\D/g, '');
        if (cleanCep && cleanCep.length === 8) {
            handleCepLookup(cleanCep);
        }
    }, [cepValue, handleCepLookup]);

    const handleSelectAll = (select: boolean) => {
        PERMISSOES_DISPONIVEIS.filter((p: Permissao) => p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto').forEach((p: Permissao) => {
            form.setValue(`permissoes.${p.key}`, select, { shouldDirty: true });
        });
    };
    
    const handleTagToggle = useCallback(() => {
        refetchStatus();
    }, [refetchStatus]);
    
    const handleLogoUploadComplete = useCallback(async (url: string | null) => {
        form.setValue('assinatura_proprietario_url', url || '');
        if (isEditing) {
            await supabase.from('tbl_clientes').update({ logo_url: url || null }).eq('id', clientProfile!.id);
        }
    }, [form, isEditing, clientProfile]);
    
    const handleSyncUrl = useCallback((url: string | null) => {
        form.setValue('assinatura_proprietario_url', url || '');
    }, [form]);

    const onSubmit = async (values: FormValues) => {
        if (isReadOnly) {
            showError('O perfil está em modo somente leitura.');
            return;
        }
        
        setIsSubmitting(true);
        
        const proprietarioId = criadorRole === 'Admin' ? criadorPerfil?.id : (criadorPerfil as ClienteProfile)?.id;
        
        if (!proprietarioId) {
            showError('ID do proprietário não pôde ser determinado.');
            setIsSubmitting(false);
            return;
        }

        try {
            let userId = clientProfile?.id;
            let isNewAuthUser = false;
            
            // 1. Handle New Client Creation (Auth) - USANDO EDGE FUNCTION
            if (isNewClient) {
                if (!values.senha) {
                    showError('A senha é obrigatória para novos clientes.');
                    return;
                }
                
                const metadata: Record<string, any> = { 
                    role: 'Cliente', 
                    nome: values.nome, 
                    aprovado: false,
                };
                
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

            // 2. Prepare Data Payload (tbl_clientes)
            const dataToUpdate: Partial<ClienteProfile> = {
                nome: values.nome,
                email: values.email,
                admin_id: criadorRole === 'Admin' ? proprietarioId : (criadorPerfil as ClienteProfile)?.admin_id,
                aprovado: isEditing ? clientProfile!.aprovado : false,
                limite_usuarios: values.limite_usuarios,
                permissoes: values.permissoes,
                
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
            
            if (isEditing && values.senha) {
                const { error: authError } = await supabase.auth.updateUser({ password: values.senha });
                if (authError) throw authError;
            }

            showSuccess(`Cliente ${isEditing ? 'atualizado' : 'criado'} com sucesso!`);
            
            if (isNewClient) {
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

    const clientTabs = [
        { value: 'pessoal', label: 'Geral' },
        { value: 'identificacao', label: 'Identificação' },
        { value: 'contato', label: 'Contato' },
        { value: 'endereco', label: 'Endereço' },
    ];

    return (
        <FormProvider {...form}>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                                <FormItem><FormLabel>Alterar Senha (Opcional)</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} disabled={isReadOnly || isEditing} /></FormControl><FormMessage /></FormItem>
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
                                ownerId={clientProfile?.id || 'new'}
                                tableName={'tbl_clientes'}
                                initialLogoUrl={form.watch('assinatura_proprietario_url')}
                                onUploadComplete={handleLogoUploadComplete}
                                onSyncUrl={handleSyncUrl}
                                isReadOnly={isSubmitting || isReadOnly}
                            />
                            
                            <Separator />
                            <h3 className="font-semibold text-lg">Configurações da Empresa</h3>
                            <FormField control={form.control} name="limite_usuarios" render={({ field }) => (
                                <FormItem><FormLabel>Limite de Usuários</FormLabel><FormControl><Input type="number" placeholder="5" {...field} disabled={isReadOnly || isEditing} /></FormControl><FormMessage /></FormItem>
                            )} />
                            
                            <div className="space-y-2 pt-4">
                                <div className="flex justify-between items-center mb-1">
                                    <FormLabel>Permissões de Acesso</FormLabel>
                                    <div className="space-x-2">
                                        <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(true)} className="p-0 h-auto" disabled={isSubmitting || isReadOnly || isEditing}>Selecionar Todos</Button>
                                        <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(false)} className="p-0 h-auto text-destructive" disabled={isSubmitting || isReadOnly || isEditing}>Desmarcar Todos</Button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
                                    {PERMISSOES_DISPONIVEIS.filter((p: Permissao) => p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto').map((p: Permissao) => (
                                        <FormField key={p.key} control={form.control} name={`permissoes.${p.key}`} render={({ field }) => (
                                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting || isReadOnly || isEditing} /></FormControl>
                                                <FormLabel className="font-normal">{p.label}</FormLabel>
                                            </FormItem>
                                        ))} />
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
};

export default FormClientCompany;