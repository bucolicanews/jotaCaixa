import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Loader2, ArrowUpCircle, ArrowDownCircle, Upload, X, FileText, CheckCircle2, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Separator } from '../ui/separator';
import { Historico } from '@/types/historico';
import { PlanoContas } from '@/types/plano-contas';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/utils/formatters';
import { format } from 'date-fns';
import { useSessao } from '@/hooks/use-sessao';
import { v4 as uuidv4 } from 'uuid';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';

const formSchema = z.object({
  tipo_movimentacao: z.enum(['Entrada', 'Saida'], { required_error: 'Selecione o tipo de movimentação.' }),
  valor: z.coerce.number().positive('O valor deve ser maior que zero.'),
  conta_bancaria_id: z.string().uuid('Selecione a conta bancária.'),
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  
  // Dados do Extrato
  descricao_extrato: z.string().min(1, 'A descrição do extrato é obrigatória.'),
  identificacao: z.string().optional().or(z.literal('')),
  codigo_transacao: z.string().optional().or(z.literal('')), // Campo PagBank
  
  // Conta de Contrapartida (Resultado ou Ativo se for transferência)
  conta_resultado_id: z.string().uuid('Selecione a conta de contrapartida.'),
  
  // Campo de Transferência
  is_transferencia: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

interface FormExtratoDiretoProps {
  onSaveComplete: () => void;
}

const FormExtratoDireto: React.FC<FormExtratoDiretoProps> = ({ onSaveComplete }) => {
  const { usuario, role, perfil } = useSessao();
  const { configMap } = useContabilConfig();
  
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [contasContrapartida, setContasContrapartida] = useState<PlanoContas[]>([]);
  const [loadingContasContrapartida, setLoadingContasContrapartida] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const getOwnerId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as any)?.id || null;
    if (role === 'Usuario') {
      const user = perfil as any;
      if (user?.admin_id) return user.admin_id;
      if (user?.cliente_id) return user.cliente_id;
    }
    return null;
  };
  
  const ownerId = getOwnerId();

  // Busca contas de Ativo (Debito) para o seletor principal e para transferências
  const { contas: contasAtivo, carregando: loadingContas, refetch: refetchSaldos } = useSaldoContaCalculado('todos', 'todos', '', 'bancos', true);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tipo_movimentacao: 'Entrada',
      valor: undefined,
      conta_bancaria_id: undefined,
      historico_id: null,
      descricao_extrato: '',
      identificacao: '',
      codigo_transacao: '',
      conta_resultado_id: undefined, 
      is_transferencia: false,
    },
  });
  
  const tipoMovimentacao = form.watch('tipo_movimentacao');
  const isTransferencia = form.watch('is_transferencia');

  const fetchHistoricos = useCallback(async () => {
    if (!ownerId) return;
    const { data, error } = await supabase
        .from('historicos')
        .select('id, descricao, codigo')
        .eq('proprietario_id', ownerId)
        .order('descricao');
        
    if (error) {
        console.error('Erro ao carregar históricos:', error);
        setHistoricos([]);
    } else {
        setHistoricos(data as Historico[]);
    }
  }, [ownerId]);
  
  const fetchContasContrapartida = useCallback(async () => {
    if (!ownerId) return;
    setLoadingContasContrapartida(true);
    
    const ativoCode = configMap.Ativo || '1';
    const receitaCode = configMap.Receita || '4';
    const custoCode = configMap.Custo || '5';
    const despesaCode = configMap.Despesa || '6';
    
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, is_conta_resultado, is_conta_patrimonial, is_caixa, is_banco')
        .eq('proprietario_id', ownerId)
        .eq('Analitica', 'Sim')
        .or(`Conta.like.${ativoCode}.%,Conta.like.${receitaCode}.%,Conta.like.${custoCode}.%,Conta.like.${despesaCode}.%`)
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar contas: ' + error.message);
        setContasContrapartida([]);
    } else {
        setContasContrapartida(data as PlanoContas[]);
    }
    setLoadingContasContrapartida(false);
  }, [ownerId, configMap]);

  useEffect(() => {
      if (ownerId) {
          refetchSaldos();
          fetchHistoricos();
          fetchContasContrapartida();
      }
  }, [ownerId, refetchSaldos, fetchHistoricos, fetchContasContrapartida]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setComprovanteFile(e.target.files[0]);
    }
  };

  const uploadComprovante = async (): Promise<string | null> => {
    if (!comprovanteFile || !ownerId) return null;
    
    setIsUploading(true);
    try {
      const fileExt = comprovanteFile.name.split('.').pop();
      const fileName = `${ownerId}/${uuidv4()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('comprovantes-financeiros')
        .upload(fileName, comprovanteFile);
        
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('comprovantes-financeiros')
        .getPublicUrl(fileName);
        
      const { data: anexoData, error: anexoError } = await supabase
        .from('anexos')
        .insert({
          empresa_id: ownerId,
          nome_arquivo: comprovanteFile.name,
          tipo_mime: comprovanteFile.type,
          url_armazenamento: publicUrl,
        })
        .select('id')
        .single();
        
      if (anexoError) throw anexoError;
      
      return anexoData.id;
    } catch (error: any) {
      showError('Falha ao fazer upload do comprovante: ' + error.message);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!ownerId) {
        showError('ID do proprietário não encontrado.');
        return;
    }
    
    const contaBancaria = contasAtivo.find(c => c.id === values.conta_bancaria_id);
    const contaContrapartida = contasContrapartida.find(c => c.id === values.conta_resultado_id);
    
    if (!contaBancaria || !contaContrapartida) {
        showError('Conta bancária ou conta de contrapartida não encontrada.');
        return;
    }
    
    if (!contaBancaria.plano_contas?.id) {
        showError('A conta selecionada não está vinculada a um Plano de Contas.');
        return;
    }

    setIsSubmitting(true);
    
    try {
      const anexoId = await uploadComprovante();
      const dataMovimentacao = format(new Date(), 'yyyy-MM-dd') + 'T12:00:00Z';
      const valor = values.valor;
      const historicoId = values.historico_id;
      
      const contaAtivoPrincipal = contaBancaria.plano_contas.id;
      const contaContrapartidaId = values.conta_resultado_id;
      
      let contaBancariaContrapartidaId: string | null = null;
      if (values.is_transferencia) {
          const saldoContaDestino = contasAtivo.find(c => c.plano_contas?.id === contaContrapartidaId);
          if (saldoContaDestino) {
              contaBancariaContrapartidaId = saldoContaDestino.id;
          }
      }

      // 1. Lançamento na Conta Principal (Ativo)
      const idAtivo = uuidv4();
      const idResultado = uuidv4();
      
      const lancamentoAtivoPayload = {
          id: idAtivo,
          proprietario_id: ownerId,
          data_movimentacao: dataMovimentacao,
          descricao: values.descricao_extrato,
          valor: valor,
          tipo: values.tipo_movimentacao,
          conta_bancaria_id: values.conta_bancaria_id,
          conta_contabil_id: contaAtivoPrincipal,
          origem: 'conciliacao_extrato',
          historico_id: historicoId,
          conciliado: true,
          anexo_id: anexoId,
          conta_resultado_id: idResultado,
          documento: values.codigo_transacao || values.identificacao || null,
      };
      
      // 2. Lançamento na Conta de Contrapartida
      let tipoContrapartida: 'Entrada' | 'Saida';
      if (values.tipo_movimentacao === 'Entrada') {
          tipoContrapartida = 'Saida';
      } else {
          tipoContrapartida = 'Entrada';
      }
      
      const lancamentoContrapartidaPayload = {
          id: idResultado,
          proprietario_id: ownerId,
          data_movimentacao: dataMovimentacao,
          descricao: values.descricao_extrato,
          valor: valor,
          tipo: tipoContrapartida,
          conta_bancaria_id: contaBancariaContrapartidaId,
          conta_contabil_id: contaContrapartidaId,
          origem: 'conciliacao_extrato',
          historico_id: historicoId,
          conciliado: true,
          anexo_id: anexoId,
          conta_resultado_id: idAtivo,
          documento: values.codigo_transacao || values.identificacao || null,
      };

      // 3. Registro na tabela 'extratos'
      const extratoPayload = {
          empresa_id: ownerId,
          id_saldo_contas: values.conta_bancaria_id,
          data: format(new Date(), 'yyyy-MM-dd'),
          descricao: values.descricao_extrato,
          valor: values.tipo_movimentacao === 'Entrada' ? valor : -valor,
          tipo: values.tipo_movimentacao,
          identificacao: values.identificacao || values.codigo_transacao || null,
          conciliado: true,
          conta_contabil_id: contaContrapartidaId,
      };

      // Executa as inserções
      const [resAtivo, resResultado, resExtrato] = await Promise.all([
          supabase.from('lancamentos').insert(lancamentoAtivoPayload),
          supabase.from('lancamentos').insert(lancamentoContrapartidaPayload),
          supabase.from('extratos').insert(extratoPayload),
      ]);
      
      if (resAtivo.error) throw resAtivo.error;
      if (resResultado.error) throw resResultado.error;
      if (resExtrato.error) throw resExtrato.error;
      
      showSuccess('Movimentação e extrato registrados com sucesso!');
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao registrar: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredContasContrapartida = useMemo(() => {
    const ativoCode = configMap.Ativo || '1';
    const receitaCode = configMap.Receita || '4';
    const custoCode = configMap.Custo || '5';
    const despesaCode = configMap.Despesa || '6';

    return contasContrapartida.filter(c => {
        const prefix = c.Conta.split('.')[0];
        if (isTransferencia) {
            return prefix === ativoCode;
        } else {
            if (tipoMovimentacao === 'Entrada') {
                return prefix === receitaCode;
            } else {
                return prefix === custoCode || prefix === despesaCode;
            }
        }
    });
  }, [contasContrapartida, isTransferencia, tipoMovimentacao, configMap]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        
        <div className="flex items-center justify-between">
            <FormField control={form.control} name="tipo_movimentacao" render={({ field }) => (
            <FormItem className="space-y-1">
                <FormLabel>1. Tipo de Movimentação</FormLabel>
                <FormControl>
                <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex space-x-4 pt-1">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="Entrada" id="entrada" /><Label htmlFor="entrada" className="flex items-center text-green-600 cursor-pointer"><ArrowUpCircle className="w-4 h-4 mr-1" /> Entrada</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="Saida" id="saida" /><Label htmlFor="saida" className="flex items-center text-red-600 cursor-pointer"><ArrowDownCircle className="w-4 h-4 mr-1" /> Saída</Label></div>
                </RadioGroup>
                </FormControl>
                <FormMessage />
            </FormItem>
            )} />

            <FormField control={form.control} name="is_transferencia" render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 bg-slate-50 dark:bg-slate-900">
                    <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                        <FormLabel className="cursor-pointer">Transferência?</FormLabel>
                    </div>
                </FormItem>
            )} />
        </div>
        
        <Separator />
        
        <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="valor" render={({ field }) => (
                <FormItem>
                    <FormLabel>2. Valor (R$)</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl><FormMessage />
                </FormItem>
            )} />
            
            <FormField control={form.control} name="conta_bancaria_id" render={({ field }) => (
                <FormItem>
                    <FormLabel>3. Conta Bancária</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingContas}>
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder={loadingContas ? "Carregando..." : "Selecione"} />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {contasAtivo.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                    {c.nome} ({formatCurrency(c.saldo_atual)})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />
        </div>
        
        <Separator />
        
        <FormField control={form.control} name="descricao_extrato" render={({ field }) => (
            <FormItem>
                <FormLabel>4. Descrição do Extrato</FormLabel>
                <FormControl><Input placeholder="Ex: Recebimento PIX Cliente X" {...field} /></FormControl>
                <FormMessage />
            </FormItem>
        )} />

        <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="identificacao" render={({ field }) => (
                <FormItem>
                    <FormLabel>Identificação (Opcional)</FormLabel>
                    <FormControl><Input placeholder="Ex: NF 123" {...field} /></FormControl>
                    <FormMessage />
                </FormItem>
            )} />
            <FormField control={form.control} name="codigo_transacao" render={({ field }) => (
                <FormItem>
                    <FormLabel>Cód. Transação (PagBank)</FormLabel>
                    <FormControl><Input placeholder="Ex: 858BDE28..." {...field} /></FormControl>
                    <FormMessage />
                </FormItem>
            )} />
        </div>
        
        <Separator />
        
        <FormField control={form.control} name="conta_resultado_id" render={({ field }) => (
            <FormItem>
                <FormLabel>5. {isTransferencia ? 'Conta de Contrapartida (Ativo)' : 'Conta de Partida Dobrada (Resultado)'}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingContasContrapartida}>
                    <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder={loadingContasContrapartida ? "Carregando..." : `Selecione a conta`} />
                        </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                        {filteredContasContrapartida.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.Conta} - {c.Descricao}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <FormMessage />
            </FormItem>
        )} />
        
        <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="historico_id" render={({ field }) => (
                <FormItem>
                    <FormLabel>6. Histórico (Opcional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value={null as any}>Nenhum</SelectItem>
                            {historicos.map(h => (
                                <SelectItem key={h.id} value={h.id}>
                                    {h.codigo && `[${h.codigo}] `}{h.descricao}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />

            <FormItem>
                <FormLabel>7. Comprovante</FormLabel>
                <div className="flex items-center gap-2">
                    <Input type="file" accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" id="extrato-comprovante-upload" />
                    <Button type="button" variant="outline" className="w-full" onClick={() => document.getElementById('extrato-comprovante-upload')?.click()}>
                        <Upload className="w-4 h-4 mr-2" /> {comprovanteFile ? 'Trocar' : 'Anexar'}
                    </Button>
                    {comprovanteFile && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => setComprovanteFile(null)}>
                            <X className="w-4 h-4 text-red-500" />
                        </Button>
                    )}
                </div>
            </FormItem>
        </div>

        <Button type="submit" className="w-full h-12" disabled={isSubmitting || isUploading}>
          {(isSubmitting || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Registrar Movimentação e Extrato
        </Button>
      </form>
    </Form>
  );
};

export default FormExtratoDireto;