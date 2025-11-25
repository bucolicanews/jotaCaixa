import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Save, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlanoContas } from '@/types/plano-contas';
import { TransacaoExtrato } from '@/types/conciliacao';
import { Card, CardContent } from './ui/card';

// Tipo de Extrato (simplificado para edição)
interface ExtratoRecord extends TransacaoExtrato {
    id: string;
    id_saldo_contas: string;
    empresa_id: string;
}

const formSchema = z.object({
    data: z.string().min(1, 'A data é obrigatória.'),
    descricao: z.string().min(1, 'A descrição é obrigatória.'),
    valor: z.coerce.number().nonnegative('O valor deve ser positivo.'),
    tipo: z.enum(['Entrada', 'Saida']),
    identificacao: z.string().optional().nullable(),
    conta_contabil_id: z.string().uuid('Selecione uma conta contábil válida.').nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface ExtratoFormDialogProps {
    extratoInicial: ExtratoRecord | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaveComplete: () => void;
    contasContabeis: PlanoContas[];
}

const ExtratoFormDialog: React.FC<ExtratoFormDialogProps> = ({ extratoInicial, open, onOpenChange, onSaveComplete, contasContabeis }) => {
    const isEditing = !!extratoInicial;

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            data: '',
            descricao: '',
            valor: 0,
            tipo: 'Entrada',
            identificacao: null,
            conta_contabil_id: null,
        },
    });

    useEffect(() => {
        if (extratoInicial) {
            // A data do extrato é YYYY-MM-DD
            form.reset({
                data: extratoInicial.data,
                descricao: extratoInicial.descricao,
                valor: Math.abs(extratoInicial.valor),
                tipo: extratoInicial.tipo,
                identificacao: extratoInicial.identificacao || null,
                conta_contabil_id: extratoInicial.conta_contabil_id || null,
            });
        }
    }, [extratoInicial, form]);

    const onSubmit = async (values: FormValues) => {
        if (!extratoInicial) return;

        setIsSubmitting(true);
        
        // O valor deve ser salvo com o sinal correto (positivo para Entrada, negativo para Saída)
        const valorComSinal = values.tipo === 'Entrada' ? Math.abs(values.valor) : -Math.abs(values.valor);

        const dataToSave = {
            data: values.data,
            descricao: values.descricao,
            valor: valorComSinal,
            tipo: values.tipo,
            identificacao: values.identificacao || null,
            conciliado: !!values.conta_contabil_id, // Se tiver conta, está conciliado
            conta_contabil_id: values.conta_contabil_id || null,
        };

        try {
            // Atualiza o registro na tabela 'extratos'
            const { error: extratoError } = await supabase
                .from('extratos')
                .update(dataToSave)
                .eq('id', extratoInicial.id);

            if (extratoError) throw extratoError;
            
            // NOTA: A edição do extrato não afeta o lançamento na tabela 'lancamentos'
            // automaticamente. O usuário deve re-conciliar ou ajustar o lançamento manualmente
            // se a conta contábil ou o valor mudarem. Por simplicidade, apenas atualizamos o extrato.

            showSuccess('Extrato atualizado com sucesso!');
            onSaveComplete();
            onOpenChange(false);
        } catch (error: any) {
            showError(`Falha ao salvar extrato: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const { isSubmitting } = form.formState;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'Editar' : 'Novo'} Registro de Extrato</DialogTitle>
                    <DialogDescription>ID: {extratoInicial?.id.substring(0, 8)}...</DialogDescription>
                </DialogHeader>
                
                <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20">
                    <CardContent className="p-3 flex items-start space-x-2">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0 text-yellow-700 dark:text-yellow-300" />
                        <p className="text-xs text-yellow-700 dark:text-yellow-300">
                            Atenção: A edição deste registro de extrato NÃO reverte ou altera automaticamente os lançamentos contábeis já criados. Se o valor ou a conta contábil mudarem, você deve ajustar o lançamento manualmente na página de Bancos.
                        </p>
                    </CardContent>
                </Card>
                
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="data" render={({ field }) => (
                                <FormItem><FormLabel>Data (YYYY-MM-DD)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="tipo" render={({ field }) => (
                                <FormItem><FormLabel>Tipo</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="Entrada">Entrada</SelectItem>
                                            <SelectItem value="Saida">Saída</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>
                        
                        <FormField control={form.control} name="descricao" render={({ field }) => (
                            <FormItem><FormLabel>Descrição</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="valor" render={({ field }) => (
                                <FormItem><FormLabel>Valor (Positivo)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="identificacao" render={({ field }) => (
                                <FormItem><FormLabel>Identificação (Opcional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                        </div>
                        
                        <FormField control={form.control} name="conta_contabil_id" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Conta Contábil (Resultado)</Label>
                                <Select onValueChange={field.onChange} value={field.value || undefined}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione a conta de resultado" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value={null as any}>Nenhum (Não Mapeado)</SelectItem>
                                        {contasContabeis.map(c => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.Conta} - {c.Descricao}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Save className="mr-2 h-4 w-4" /> Salvar Alterações
                        </Button>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};

export default ExtratoFormDialog;