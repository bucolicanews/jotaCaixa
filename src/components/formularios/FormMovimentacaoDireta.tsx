import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Loader2, ArrowUpCircle, ArrowDownCircle, Upload, X } from 'lucide-react';
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
import { DialogDescription } from '@/components/ui/dialog';
import { formatCurrency } from '@/utils/formatters';
import { format } from 'date-fns';
import { useSessao } from '@/hooks/use-sessao';
import { v4 as uuidv4 } from 'uuid';
import { Checkbox } from '@/components/ui/checkbox';

// Interface for the primary launch (linked to the bank account)
interface LancamentoPrimario {
    id: string;
    data_movimentacao: string;
    descricao: string;
    valor: number;
    tipo: 'Entrada' | 'Saida';
    conta_bancaria_id: string;
    historico_id: string | null;
    conta_contabil_id: string; // This is the DRE account ID (Resultado)
    conta_resultado_id: string; // ID do lançamento emparelhado
    anexo_id?: string | null;
}
export type { LancamentoPrimario };

const formSchema = z.object({
  tipo_movimentacao: z.enum(['Entrada', 'Saida'], { required_error: 'Selecione o tipo de movimentação.' }),
  valor: z.coerce.number().positive('O valor deve ser maior que zero.'),
  conta_bancaria_id: z.string().uuid('Selecione a conta de destino/origem.'),
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  
  // Contas de Partida Dobrada (Resultado ou Ativo se for transferência)
  conta_resultado_id: z.string().uuid('Selecione a conta de contrapartida.'),
  
  // Novo: Transferência
  is_transferencia: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

interface FormMovimentacaoDiretaProps {
  onSaveComplete: () => void;
  lancamentoInicial?: LancamentoPrimario | null;
}

const FormMovimentacaoDireta: React.FC<FormMovimentacaoDiretaProps> = ({ onSaveComplete, lancamentoInicial }) => {
  const { usuario, role, perfil } = useSessao();
  const { configMap } = useContabilConfig();
  
  const isEditing = !!lancamentoInicial;
  
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [contasContrapartida, setContasContrapartida] = useState<PlanoContas[]>([]);
  const [loadingContasContrapartida, setLoadingContasContrapartida] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Estado para o arquivo de comprovante
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const [dreLaunchId, setDreLaunchId] = useState<string | null>(lancamentoInicial?.conta_resultado_id || null); 
  
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

  // Busca apenas contas de Ativo (Debito) e escopo 'bancos'
  const { contas: contasAtivo, carregando: loadingContas, refetch: refetchSaldos } = useSaldoContaCalculado('Debito', 'todos', '', 'bancos');
  
  const contasCaixa = contasAtivo.filter(c => c.plano_contas?.is_caixa);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tipo_movimentacao: lancamentoInicial?.tipo || 'Entrada',
      valor: Math.abs(lancamentoInicial?.valor || 0),
      conta_bancaria_id: lancamentoInicial?.conta_bancaria_id || undefined,
      historico_id: lancamentoInicial?.historico_id || null,
      conta_resultado_id: undefined, 
      is_transferencia: false,
    },
  });
  
  const tipoMovimentacao = form.watch('tipo_movimentacao');
  const isTransferencia = form.watch('is_transferencia');

  useEffect(() => {
    if (isEditing && lancamentoInicial?.id && ownerId) {
        const fetchPairedLaunch = async () => {
            const { data, error } = await supabase
                .from('lancamentos')
                .select('id, conta_contabil_id, conta_bancaria_id')
                .eq('proprietario_id', ownerId)
                .eq('origem', 'movimentacao_direta')
                .eq('conta_resultado_id', lancamentoInicial.id)
                .limit(1)
                .single();
                
            if (error || !data) {
                console.error('Could not find paired launch for editing:', error);
            } else {
                setDreLaunchId(data.id);
                form.setValue('conta_resultado_id', data.conta_contabil_id);
                // Se o lançamento emparelhado tiver conta_bancaria_id, é uma transferência
                if (data.conta_bancaria_id) {
                    form.setValue('is_transferencia', true);
                }
            }
        };
        fetchPairedLaunch();
    }
  }, [isEditing, lancamentoInicial, ownerId, form]);

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
        .select('id, Conta, Descricao, is_conta_resultado')
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

  useEffect(() => {
    if (!isEditing && !form.getValues('conta_bancaria_id') && contasCaixa.length > 0) {
        form.setValue('conta_bancaria_id', contasCaixa[0].id);
    }
  }, [contasCaixa, form, isEditing]);

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
        
      // Criar registro na tabela anexos
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
      showError('Erro ao fazer upload do comprovante: ' + error.message);
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
        showError('A conta bancária selecionada não está vinculada a um Plano de Contas (Ativo).');
        return;
    }
    
    if (values.tipo_movimentacao === 'Saida') {
        let saldoParaVerificar = contaBancaria.saldo_atual;
        if (isEditing && lancamentoInicial) {
            saldoParaVerificar += Math.abs(lancamentoInicial.valor);
        }
        
        if (values.valor > saldoParaVerificar) {
            showError('Saldo insuficiente na conta para realizar a sangria.');
            return;
        }
    }

    setIsSubmitting(true);
    
    try {
      // 1. Upload do comprovante se houver
      const anexoId = await uploadComprovante();
      
      const dataMovimentacao = format(new Date(), 'yyyy-MM-dd') + 'T12:00:00Z';
      const valor = values.valor;
      const historicoId = values.historico_id;
      
      const contaAtivoCaixa = contaBancaria.plano_contas.id;
      const contaContrapartidaId = values.conta_resultado_id;
      
      // Se for transferência, tenta encontrar o saldo_contas correspondente à conta de contrapartida
      let contaBancariaContrapartidaId: string | null = null;
      if (values.is_transferencia) {
          const saldoContaDestino = contasAtivo.find(c => c.plano_contas?.id === contaContrapartidaId);
          if (saldoContaDestino) {
              contaBancariaContrapartidaId = saldoContaDestino.id;
          }
      }

      // 1. Lançamento na Conta de Saldo (Caixa/Banco)
      const lancamentoAtivoPayload: any = {
          proprietario_id: ownerId,
          data_movimentacao: dataMovimentacao,
          descricao: values.is_transferencia 
            ? `Transferência (${values.tipo_movimentacao === 'Entrada' ? 'de' : 'para'}): ${contaContrapartida.Descricao}`
            : `${values.tipo_movimentacao} Direta: ${contaContrapartida.Descricao}`,
          valor: valor,
          tipo: values.tipo_movimentacao,
          conta_bancaria_id: values.conta_bancaria_id,
          conta_contabil_id: contaAtivoCaixa,
          origem: 'movimentacao_direta',
          historico_id: historicoId,
          conciliado: true,
          anexo_id: anexoId || lancamentoInicial?.anexo_id,
          atualizado_em: new Date().toISOString(),
      };
      
      // 2. Lançamento na Conta de Contrapartida (Resultado ou outro Ativo)
      let tipoContrapartida: 'Entrada' | 'Saida';
      
      if (values.tipo_movimentacao === 'Entrada') {
          // Entrada no Caixa (D) -> Saída na Contrapartida (C)
          tipoContrapartida = 'Saida';
      } else {
          // Saída do Caixa (C) -> Entrada na Contrapartida (D)
          tipoContrapartida = 'Entrada';
      }
      
      const lancamentoContrapartidaPayload: any = {
          proprietario_id: ownerId,
          data_movimentacao: dataMovimentacao,
          descricao: values.is_transferencia
            ? `Transferência (${values.tipo_movimentacao === 'Entrada' ? 'para' : 'de'}): ${contaBancaria.nome}`
            : `${values.tipo_movimentacao === 'Entrada' ? 'Reforço de Caixa' : 'Sangria de Caixa'}: ${contaContrapartida.Descricao}`,
          valor: valor,
          tipo: tipoContrapartida,
          conta_bancaria_id: contaBancariaContrapartidaId, // Se for transferência, vincula ao saldo_contas
          conta_contabil_id: contaContrapartidaId,
          origem: 'movimentacao_direta',
          historico_id: historicoId,
          conciliado: true,
          anexo_id: anexoId || lancamentoInicial?.anexo_id,
          atualizado_em: new Date().toISOString(),
      };

      if (isEditing) {
          const launchIdAtivo = lancamentoInicial!.id;
          const launchIdResultado = dreLaunchId;
          
          if (!launchIdResultado) {
              throw new Error('Não foi possível encontrar o lançamento emparelhado para edição.');
          }
          
          lancamentoAtivoPayload.conta_resultado_id = launchIdResultado;
          lancamentoContrapartidaPayload.conta_resultado_id = launchIdAtivo;
          
          const [resAtivo, resResultado] = await Promise.all([
              supabase.from('lancamentos').upsert({ ...lancamentoAtivoPayload, id: launchIdAtivo }),
              supabase.from('lancamentos').upsert({ ...lancamentoContrapartidaPayload, id: launchIdResultado }),
          ]);
          
          if (resAtivo.error) throw resAtivo.error;
          if (resResultado.error) throw resResultado.error;
          
          showSuccess(`Movimentação atualizada com sucesso!`);
          
      } else {
          const idAtivo = uuidv4();
          const idResultado = uuidv4();
          
          lancamentoAtivoPayload.id = idAtivo;
          lancamentoAtivoPayload.conta_resultado_id = idResultado;
          
          lancamentoContrapartidaPayload.id = idResultado;
          lancamentoContrapartidaPayload.conta_resultado_id = idAtivo;
          
          const [resAtivo, resResultado] = await Promise.all([
              supabase.from('lancamentos').insert(lancamentoAtivoPayload),
              supabase.from('lancamentos').insert(lancamentoContrapartidaPayload),
          ]);
          
          if (resAtivo.error) throw resAtivo.error;
          if (resResultado.error) throw resResultado.error;
          
          showSuccess(`${values.is_transferencia ? 'Transferência' : values.tipo_movimentacao + ' direta'} de ${formatCurrency(valor)} registrada com sucesso!`);
      }
      
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao registrar movimentação: ${error.message}`);
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
            // Se for transferência, mostra apenas contas de Ativo (1)
            return prefix === ativoCode;
        } else {
            // Se não for transferência, mostra Receita (4) para Entrada e Despesa (5/6) para Saída
            if (tipoMovimentacao === 'Entrada') {
                return prefix === receitaCode;
            } else {
                return prefix === custoCode || prefix === despesaCode;
            }
        }
    });
  }, [contasContrapartida, isTransferencia, tipoMovimentacao, configMap]);

  return (
    <>
    <DialogDescription className="sr-only">
        Formulário para registrar entradas, saídas ou transferências diretas de caixa/banco.
    </DialogDescription>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        
        <div className="flex items-center justify-between">
            <FormField control={form.control} name="tipo_movimentacao" render={({ field }) => (
            <FormItem className="space-y-1">
                <FormLabel>1. Tipo de Movimentação</FormLabel>
                <FormControl>
                <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex space-x-4 pt-1" disabled={isEditing}>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="Entrada" id="entrada" /><Label htmlFor="entrada" className="flex items-center text-green-600 cursor-pointer"><ArrowUpCircle className="w-4 h-4 mr-1" /> Entrada (Reforço)</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="Saida" id="saida" /><Label htmlFor="saida" className="flex items-center text-red-600 cursor-pointer"><ArrowDownCircle className="w-4 h-4 mr-1" /> Saída (Sangria)</Label></div>
                </RadioGroup>
                </FormControl>
                <FormMessage />
            </FormItem>
            )} />

            <FormField control={form.control} name="is_transferencia" render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 bg-slate-50">
                    <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isEditing} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                        <FormLabel className="cursor-pointer">Transferência?</FormLabel>
                        <FormDescription className="text-[10px]">Entre contas de Ativo</FormDescription>
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
                    <FormLabel>3. Conta {tipoMovimentacao === 'Entrada' ? 'Destino' : 'Origem'} (Caixa)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingContas || isEditing}>
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder={loadingContas ? "Carregando..." : "Selecione"} />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {contasCaixa.map(c => (
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
        
        <FormField control={form.control} name="conta_resultado_id" render={({ field }) => (
            <FormItem>
                <FormLabel>4. {isTransferencia ? 'Conta de Contrapartida (Ativo)' : 'Conta de Partida Dobrada (Resultado)'}</FormLabel>
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
                    <FormLabel>5. Histórico (Opcional)</FormLabel>
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
                <FormLabel>6. Comprovante</FormLabel>
                <div className="flex items-center gap-2">
                    <Input type="file" accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" id="comprovante-upload" />
                    <Button type="button" variant="outline" className="w-full" onClick={() => document.getElementById('comprovante-upload')?.click()}>
                        <Upload className="w-4 h-4 mr-2" /> {comprovanteFile ? 'Trocar Arquivo' : 'Anexar'}
                    </Button>
                    {comprovanteFile && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => setComprovanteFile(null)}>
                            <X className="w-4 h-4 text-red-500" />
                        </Button>
                    )}
                </div>
                {comprovanteFile && <p className="text-[10px] text-muted-foreground mt-1 truncate">{comprovanteFile.name}</p>}
            </FormItem>
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting || isUploading || (isEditing && !dreLaunchId)}>
          {(isSubmitting || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Salvar Alterações' : 'Registrar Movimentação'}
        </Button>
      </form>
    </Form>
    </>
  );
};

export default FormMovimentacaoDireta;