import React, { useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';

const NATUREZAS = [
    { value: 'Ativo', label: 'Ativo (Balanço)' },
    { value: 'Passivo', label: 'Passivo (Balanço)' },
    { value: 'Patrimonio Liquido', label: 'Patrimônio Líquido (Balanço)' },
    { value: 'Receita', label: 'Receita (DRE)' },
    { value: 'Despesa', label: 'Despesa (DRE)' },
    { value: 'Resultado', label: 'Resultado (Lucro/Prejuízo)' },
    { value: 'Nenhum', label: 'Nenhum (Ignorar Nível)' },
];

const NaturezaEnum = z.enum(['Ativo', 'Passivo', 'Patrimonio Liquido', 'Receita', 'Despesa', 'Resultado', 'Nenhum']);
type NaturezaType = z.infer<typeof NaturezaEnum>;

const formSchema = z.object({
    mapeamentos: z.array(z.object({
        codigo_nivel_1: z.string().regex(/^[1-6]$/, 'Código deve ser 1, 2, 3, 4, 5 ou 6.'),
        tipo_natureza: NaturezaEnum,
        id: z.string().optional(), // ID existente no DB
    })).min(6, 'É necessário mapear pelo menos 6 níveis primários (1 a 6).'),
});

type FormValues = z.infer<typeof formSchema>;

interface FormMapeamentoContabilProps {
    proprietarioId: string;
}

const FormMapeamentoContabil: React.FC<FormMapeamentoContabilProps> = ({ proprietarioId }) => {
    const [loadingData, setLoadingData] = useState(true);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            mapeamentos: [
                { codigo_nivel_1: '1', tipo_natureza: 'Ativo' as NaturezaType },
                { codigo_nivel_1: '2', tipo_natureza: 'Passivo' as NaturezaType },
                { codigo_nivel_1: '3', tipo_natureza: 'Patrimonio Liquido' as NaturezaType },
                { codigo_nivel_1: '4', tipo_natureza: 'Receita' as NaturezaType },
                { codigo_nivel_1: '5', tipo_natureza: 'Despesa' as NaturezaType },
                { codigo_nivel_1: '6', tipo_natureza: 'Resultado' as NaturezaType },
            ],
        },
    });
    
    const { fields, replace } = useFieldArray({
        control: form.control,
        name: "mapeamentos",
    });

    const fetchConfig = useCallback(async () => {
        setLoadingData(true);
        
        const { data, error } = await supabase
            .from('configuracao_contabil')
            .select('id, codigo_nivel_1, tipo_natureza')
            .eq('proprietario_id', proprietarioId);

        if (error) {
            showError('Erro ao carregar mapeamento contábil: ' + error.message);
        } else if (data && data.length > 0) {
            const existingMap = data.reduce((acc, item) => {
                acc[item.codigo_nivel_1] = {
                    codigo_nivel_1: item.codigo_nivel_1,
                    tipo_natureza: item.tipo_natureza as NaturezaType,
                    id: item.id,
                };
                return acc;
            }, {} as Record<string, FormValues['mapeamentos'][number]>);
            
            const defaultLevels = ['1', '2', '3', '4', '5', '6'];
            
            const finalMapeamentos = defaultLevels.map(code => {
                if (existingMap[code]) return existingMap[code];
                
                // Define o valor padrão se não existir no DB
                const defaultNatureza = NATUREZAS.find(n => n.value.startsWith(code))?.value || (code === '6' ? 'Resultado' : 'Ativo');
                return { 
                    codigo_nivel_1: code, 
                    tipo_natureza: defaultNatureza as NaturezaType
                };
            });
            
            replace(finalMapeamentos);
        } else {
            // Se não houver dados, usa os defaults
            const defaultMapeamentos = [
                { codigo_nivel_1: '1', tipo_natureza: 'Ativo' as NaturezaType },
                { codigo_nivel_1: '2', tipo_natureza: 'Passivo' as NaturezaType },
                { codigo_nivel_1: '3', tipo_natureza: 'Patrimonio Liquido' as NaturezaType },
                { codigo_nivel_1: '4', tipo_natureza: 'Receita' as NaturezaType },
                { codigo_nivel_1: '5', tipo_natureza: 'Despesa' as NaturezaType },
                { codigo_nivel_1: '6', tipo_natureza: 'Resultado' as NaturezaType },
            ];
            replace(defaultMapeamentos);
        }
        setLoadingData(false);
    }, [proprietarioId, form, replace]);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const onSubmit = async (values: FormValues) => {
        const dataToUpsert = values.mapeamentos.map(m => ({
            id: m.id,
            proprietario_id: proprietarioId,
            codigo_nivel_1: m.codigo_nivel_1,
            // Se for 'Nenhum', salva como NULL no campo tipo_natureza
            tipo_natureza: m.tipo_natureza === 'Nenhum' ? null : m.tipo_natureza,
        }));

        try {
            const { error } = await supabase
                .from('configuracao_contabil')
                .upsert(dataToUpsert, { onConflict: 'proprietario_id, codigo_nivel_1' });

            if (error) throw error;

            showSuccess('Mapeamento contábil salvo com sucesso!');
            fetchConfig();
        } catch (error: any) {
            showError(`Falha ao salvar mapeamento: ${error.message}`);
        }
    };

    if (loadingData) {
        return <div className="flex justify-center items-center h-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    }
    
    const isSubmitting = form.formState.isSubmitting;
    
    const handleToggleNivel = (index: number, currentNatureza: NaturezaType) => {
        const isIgnored = currentNatureza === 'Nenhum';
        const defaultNatureza = NATUREZAS.find(n => n.value.startsWith(fields[index].codigo_nivel_1))?.value || 'Ativo';
        
        const newNatureza = isIgnored ? defaultNatureza : 'Nenhum';
        
        form.setValue(`mapeamentos.${index}.tipo_natureza`, newNatureza as NaturezaType, { shouldDirty: true });
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <p className="text-sm text-muted-foreground">
                    Defina a natureza contábil (Ativo, Passivo, Receita, Despesa, Resultado) para cada código de nível primário (1, 2, 3, 4, 5, 6) do seu Plano de Contas.
                </p>
                
                <div className="p-3 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500 rounded-md text-sm text-yellow-700 dark:text-yellow-300 flex items-start">
                    <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />
                    <p>Clique no código do nível (1, 2, 3...) para alternar rapidamente entre Ativo/Resultado e Ignorar (Nenhum).</p>
                </div>

                <div className="overflow-x-auto border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px]">Nível 1</TableHead>
                                <TableHead>Natureza Contábil</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {fields.map((item, index) => {
                                const currentNatureza = form.watch(`mapeamentos.${index}.tipo_natureza`);
                                const isIgnored = currentNatureza === 'Nenhum';
                                
                                return (
                                    <TableRow key={item.id}>
                                        <TableCell className="w-[100px] font-bold">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleToggleNivel(index, currentNatureza)}
                                                className={cn(
                                                    "w-full font-extrabold text-lg transition-all duration-300",
                                                    isIgnored ? "bg-red-500/20 text-red-600 hover:bg-red-500/30" : "bg-primary/10 text-primary hover:bg-primary/20"
                                                )}
                                                disabled={isSubmitting}
                                            >
                                                {item.codigo_nivel_1}
                                            </Button>
                                        </TableCell>
                                        <TableCell>
                                            <FormField
                                                control={form.control}
                                                name={`mapeamentos.${index}.tipo_natureza`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                                                            <FormControl>
                                                                <SelectTrigger className={cn(isIgnored && 'border-red-500')}>
                                                                    <SelectValue placeholder="Selecione a Natureza" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {NATUREZAS.map(n => (
                                                                    <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" /> Salvar Mapeamento
                </Button>
            </form>
        </Form>
    );
};

export default FormMapeamentoContabil;