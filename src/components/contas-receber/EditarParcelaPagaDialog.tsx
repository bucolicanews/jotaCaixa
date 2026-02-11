import React, { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, CalendarIcon, Upload, FileText, XCircle, CheckCircle2, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import { Historico } from '@/types/historico';
import { PlanoContas } from '@/types/plano-contas';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Separator } from '../ui/separator';

const COMPROVANTE_BUCKET = 'comprovantes-financeiros';

const formSchema = z.object({
  valor_recebido: z.coerce.number().positive('O valor deve ser maior que zero.'),
  taxa_bancaria: z.coerce.number().min(0, 'A taxa não pode ser negativa.').optional(),
  data_pagamento: z.date({ required_error: 'A data é obrigatória.' }),
  forma_pagamento: z.string().min(1, 'A forma de pagamento é obrigatória.'),
  observacao: z.string().optional(),
  codigo_transacao: z.string().optional(),
  conta_id: z.string().uuid('Selecione a conta de destino.').nullable(),
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  conta_patrimonial_id: z.string().uuid('Selecione a conta patrimonial válida.').nullable(),
  anexo_url: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface EditarParcelaPagaDialogProps {
  parcelaId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveComplete: () => void;
}

const EditarParcelaPagaDialog: React.FC<EditarParcelaPagaDialogProps> = ({ 
  parcelaId, 
  open, 
  onOpenChange, 
  onSaveComplete 
}) => {
  const { role, usuario, perfil } = useSessao();
  const { configMap } = useContabilConfig();

  const isDirectAdmin = role === 'Admin';
  const adminIdFromProfile = (perfil as any)?.admin_id ?? null;
  const isAdminUsuario = role === 'Usuario' && !!adminIdFromProfile;
  const isAdmin = isDirectAdmin || isAdminUsuario;
  
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [loadingHistoricos, setLoadingHistoricos] = useState(true);
  const [contasPatrimoniais, setContasPatrimoniais] = useState<PlanoContas[]>([]);
  const [loadingContasPatrimoniais, setLoadingContasPatrimoniais] = useState(true);
  const [loading, setLoading] = useState(false);
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const tabelaRecebimentos = isAdmin ? 'admin_recebimentos' : 'recebimentos';
  const tabelaContasReceber = isAdmin ? 'admin_contas_receber' : 'contas_receber';
  const tabelaParcelas = isAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
  
  const proprietarioDaSessao = isDirectAdmin ? usuario?.id : (isAdminUsuario ? adminIdFromProfile : ((perfil as any)?.cliente_id || (perfil as any)?.id));

  const { contas: contasDestino, carregando: loadingContas, refetch: refetchSaldos } = useSaldoContaCalculado('todos', 'todos', '', 'bancos');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      valor_recebido: 0,
      taxa_bancaria: 0,
      data_pagamento: new Date(),
      forma_pagamento: 'Pix',
      observacao: '',
      codigo_transacao: '',
      conta_id: null,
      historico_id: null,
      conta_patrimonial_id: null,
      anexo_url: null,
    },
  });
  
  const { reset, watch, setValue } = form;

  const fetchHistoricos = useCallback(async () => {
    if (!proprietarioDaSessao) return;
    setLoadingHistoricos(true);
    const { data, error } = await supabase
        .from('historicos')
        .select('id, descricao, codigo')
        .eq('proprietario_id', proprietarioDaSessao)
        .order('descricao');
        
    if (error) {
        console.error('Erro ao carregar históricos:', error);
        setHistoricos([]);
    } else {
        setHistoricos(data as Historico[]);
    }
    setLoadingHistoricos(false);
  }, [proprietarioDaSessao]);
  
  const fetchContasPatrimoniais = useCallback(async () => {
    if (!proprietarioDaSessao) return;
    setLoadingContasPatrimoniais(true);
    
    const ativoCode = configMap.Ativo || '1';
    
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao')
        .eq('proprietario_id', proprietarioDaSessao)
        .eq('Analitica', 'Sim')
        .eq('is_conta_patrimonial', true)
        .eq('is_a_receber', true)
        .like('Conta', `${ativoCode}.%`)
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar contas patrimoniais: ' + error.message);
        setContasPatrimoniais([]);
    } else {
        setContasPatrimoniais(data as PlanoContas[]);
    }
    setLoadingContasPatrimoniais(false);
  }, [proprietarioDaSessao, configMap.Ativo]);
  
  const fetchRecebimentoData = useCallback(async () => {
    if (!parcelaId || !proprietarioDaSessao) return;
    
    setLoading(true);
    
    // 1. Buscar dados do recebimento
    const { data: recebimento, error: recebimentoError } = await supabase
        .from(tabelaRecebimentos)
        .select('*')
        .eq('parcela_id', parcelaId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
    if (recebimentoError) {
        console.error('Erro ao carregar recebimento:', recebimentoError);
        setLoading(false);
        return;
    }
    
    // 2. Buscar dados da parcela
    const { data: parcela, error: parcelaError } = await supabase
        .from(tabelaParcelas)
        .select('conta_receber_id, data_pagamento')
        .eq('id', parcelaId)
        .single();
        
    if (parcelaError) {
        console.error('Erro ao carregar parcela:', parcelaError);
        setLoading(false);
        return;
    }
    
    // 3. Buscar conta sintética para a conta patrimonial
    const { data: contaSintetica } = await supabase
        .from(tabelaContasReceber)
        .select('id_conta_patrimonial')
        .eq('id', parcela.conta_receber_id)
        .single();
    
    reset({
        valor_recebido: recebimento.valor_recebido || 0,
        taxa_bancaria: recebimento.pagbank_taxa_valor || 0,
        data_pagamento: recebimento.data_recebimento ? new Date(recebimento.data_recebimento + 'T12:00:00') : new Date(),
        forma_pagamento: recebimento.forma_pagamento || 'Pix',
        observacao: recebimento.observacao || '',
        codigo_transacao: recebimento.codigo_transacao || '',
        conta_id: recebimento.conta_id || null,
        historico_id: recebimento.historico_id || null,
        conta_patrimonial_id: contaSintetica?.id_conta_patrimonial || null,
        anexo_url: recebimento.anexo_url || null,
    });
    
    setLoading(false);
    
  }, [parcelaId, proprietarioDaSessao, reset, tabelaRecebimentos, tabelaContasReceber, tabelaParcelas, isAdmin]);

  useEffect(() => {
      if (open && parcelaId) {
          refetchSaldos();
          fetchHistoricos();
          fetchContasPatrimoniais();
          fetchRecebimentoData();
      }
  }, [open, parcelaId, refetchSaldos, fetchHistoricos, fetchContasPatrimoniais, fetchRecebimentoData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setComprovanteFile(e.target.files?.[0] || null);
  };

  const uploadComprovante = async (file: File, pId: string): Promise<string> => {
    setIsUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${proprietarioDaSessao}/${pId}/comprovantes-cr/edit-${Date.now()}.${fileExt}`;
    try {
      const { data, error: uploadError } = await supabase.storage
        .from(COMPROVANTE_BUCKET)
        .upload(fileName, file, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage.from(COMPROVANTE_BUCKET).getPublicUrl(data.path);
      return publicUrlData.publicUrl;
    } finally {
      setIsUploading(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!parcelaId || !proprietarioDaSessao) {
        showError('Dados da parcela ou administrador estão incompletos.');
        return;
    }
    
    setLoading(true);

    try {
        let finalAnexoUrl = values.anexo_url;
        if (comprovanteFile) {
            finalAnexoUrl = await uploadComprovante(comprovanteFile, parcelaId);
        }

        const dataPagamentoISO = format(values.data_pagamento, 'yyyy-MM-dd');
        const valorLiquido = values.valor_recebido - (values.taxa_bancaria || 0);

        // 1. Atualizar o registro de recebimento
        const { error: recebimentoError } = await supabase
            .from(tabelaRecebimentos)
            .update({
                valor_recebido: values.valor_recebido,
                data_recebimento: dataPagamentoISO,
                forma_pagamento: values.forma_pagamento,
                observacao: values.observacao || null,
                codigo_transacao: values.codigo_transacao || null,
                conta_id: values.conta_id,
                historico_id: values.historico_id,
                anexo_url: finalAnexoUrl,
                pagbank_taxa_valor: values.taxa_bancaria || 0,
                pagbank_valor_liquido: valorLiquido,
            })
            .eq('parcela_id', parcelaId);
        
        if (recebimentoError) throw recebimentoError;
        
        // 2. Atualizar a parcela (valor_pago e data_pagamento)
        const { data: parcela, error: parcelaError } = await supabase
            .from(tabelaParcelas)
            .update({
                valor_pago: values.valor_recebido,
                data_pagamento: dataPagamentoISO,
            })
            .eq('id', parcelaId)
            .select('conta_receber_id')
            .single();
            
        if (parcelaError) throw parcelaError;
        
        // 3. Atualizar a conta sintética (conta patrimonial)
        if (parcela.conta_receber_id) {
            const { error: contaError } = await supabase
                .from(tabelaContasReceber)
                .update({
                    id_conta_patrimonial: values.conta_patrimonial_id,
                })
                .eq('id', parcela.conta_receber_id);
                
            if (contaError) throw contaError;
        }
        
        showSuccess('Dados do recebimento atualizados com sucesso!');
        onSaveComplete();
        onOpenChange(false);
    } catch (error: any) {
      showError(`Falha ao atualizar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const currentAnexoUrl = watch('anexo_url');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustar Informações do Recebimento</DialogTitle>
          <DialogDescription>
            Altere os valores, datas e comprovantes deste recebimento para fins de ajuste.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="valor_recebido"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-bold">Valor Recebido (Bruto)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} className="border-primary/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="data_pagamento"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Data do Pagamento</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "dd/MM/yyyy", { locale: ptBR })
                              ) : (
                                <span>Data</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={field.value}
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="forma_pagamento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Forma de Pagamento</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a forma" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                          <SelectItem value="Pix">Pix</SelectItem>
                          <SelectItem value="Cartão">Cartão</SelectItem>
                          <SelectItem value="Boleto">Boleto</SelectItem>
                          <SelectItem value="Transferência">Transferência</SelectItem>
                          <SelectItem value="Bens">Bens</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="taxa_bancaria"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Taxa Bancária (Opcional)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="conta_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Conta/Caixa de Destino (Ativo)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "0"} disabled={loadingContas}>
                        <FormControl><SelectTrigger><SelectValue placeholder={loadingContas ? "Carregando..." : "Selecione a conta"} /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="0" disabled>Selecione a conta</SelectItem>
                          {contasDestino.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.nome} ({c.tipo_saldo})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="conta_patrimonial_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Conta Patrimonial (Direito a Receber)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "0"} disabled={loadingContasPatrimoniais}>
                        <FormControl><SelectTrigger><SelectValue placeholder={loadingContasPatrimoniais ? "Carregando..." : "Selecione a conta"} /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="0">Nenhum (Não Mapear)</SelectItem>
                          {contasPatrimoniais.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.Conta} - {c.Descricao}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="historico_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Histórico do Recebimento</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "0"} disabled={loadingHistoricos}>
                        <FormControl><SelectTrigger><SelectValue placeholder={loadingHistoricos ? "Carregando..." : "Selecione o histórico"} /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="0">Nenhum</SelectItem>
                          {historicos.map((h) => (
                            <SelectItem key={h.id} value={String(h.id)}>{h.codigo && `[${h.codigo}] `}{h.descricao}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="codigo_transacao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código da Transação</FormLabel>
                      <FormControl><Input placeholder="ID da transação externa" {...field} value={field.value ?? ''} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>

            <FormField
              control={form.control}
              name="observacao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observação / Descrição</FormLabel>
                  <FormControl><Textarea placeholder="Detalhes adicionais" {...field} value={field.value ?? ''} rows={2} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <div className="space-y-3">
                <Label className="flex items-center gap-2"><FileText className="w-4 h-4" /> Comprovante de Pagamento</Label>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-3 border rounded-md bg-muted/30">
                    {currentAnexoUrl ? (
                        <div className="flex items-center gap-3 flex-1">
                            <div className="p-2 bg-green-100 rounded-full"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">Comprovante já anexado</p>
                                <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => window.open(currentAnexoUrl, '_blank')}>
                                    <Eye className="w-3 h-3 mr-1" /> Visualizar Atual
                                </Button>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setValue('anexo_url', null)} title="Remover anexo atual">
                                <XCircle className="w-4 h-4 text-red-500" />
                            </Button>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground flex-1 italic">Nenhum comprovante anexado.</p>
                    )}
                    
                    <div className="w-full sm:w-auto">
                        <Input type="file" accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" id="edit-comprovante-upload" />
                        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => document.getElementById('edit-comprovante-upload')?.click()}>
                            <Upload className="w-4 h-4 mr-2" /> {currentAnexoUrl ? 'Trocar Arquivo' : 'Anexar Arquivo'}
                        </Button>
                    </div>
                </div>
                {comprovanteFile && (
                    <p className="text-xs text-blue-600 font-medium flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Novo arquivo selecionado: {comprovanteFile.name}
                    </p>
                )}
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading || isUploading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading || isUploading}>
                {loading || isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Alterações'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default EditarParcelaPagaDialog;