import React, { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import { Historico } from '@/types/historico';
import { PlanoContas } from '@/types/plano-contas';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import { Textarea } from '@/components/ui/textarea';

const formSchema = z.object({
  observacao: z.string().optional(),
  codigo_transacao: z.string().optional(),
  conta_id: z.string().uuid('Selecione a conta de destino.').nullable(),
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  conta_patrimonial_id: z.string().uuid('Selecione a conta patrimonial válida.').nullable(),
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
  const [descricaoConta, setDescricaoConta] = useState<string>('');
  
  const tabelaRecebimentos = isAdmin ? 'admin_recebimentos' : 'recebimentos';
  const tabelaContasReceber = isAdmin ? 'admin_contas_receber' : 'contas_receber';
  
  const proprietarioDaSessao = isDirectAdmin ? usuario?.id : (isAdminUsuario ? adminIdFromProfile : ((perfil as any)?.cliente_id || (perfil as any)?.id));

  const { contas: contasDestino, carregando: loadingContas, refetch: refetchSaldos } = useSaldoContaCalculado('todos', 'todos', '', 'bancos');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      observacao: '',
      codigo_transacao: '',
      conta_id: null,
      historico_id: null,
      conta_patrimonial_id: null,
    },
  });
  
  const { reset } = form;

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
    
    const { data: recebimento, error: recebimentoError } = await supabase
        .from(tabelaRecebimentos)
        .select('observacao, codigo_transacao, conta_id, historico_id, parcela_id')
        .eq('parcela_id', parcelaId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
    if (recebimentoError) {
        console.error('Erro ao carregar recebimento:', recebimentoError);
        setLoading(false);
        return;
    }
    
    const { data: parcela, error: parcelaError } = await supabase
        .from(isAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber')
        .select('conta_receber_id')
        .eq('id', parcelaId)
        .single();
        
    if (parcelaError) {
        console.error('Erro ao carregar parcela:', parcelaError);
        setLoading(false);
        return;
    }
    
    const { data: contaSintetica, error: contaError } = await supabase
        .from(tabelaContasReceber)
        .select('descricao, id_conta_patrimonial')
        .eq('id', parcela.conta_receber_id)
        .single();
        
    if (contaError) {
        console.error('Erro ao carregar conta a receber:', contaError);
    }
    
    const contaPatrimonialId = contaSintetica?.id_conta_patrimonial || null;
    setDescricaoConta(contaSintetica?.descricao || '');
    
    reset({
        observacao: recebimento?.observacao || '',
        codigo_transacao: recebimento?.codigo_transacao || '',
        conta_id: recebimento?.conta_id || null,
        historico_id: recebimento?.historico_id || null,
        conta_patrimonial_id: contaPatrimonialId,
    });
    
    setLoading(false);
    
  }, [parcelaId, proprietarioDaSessao, reset, tabelaRecebimentos, tabelaContasReceber, isAdmin]);

  useEffect(() => {
      if (open && parcelaId) {
          refetchSaldos();
          fetchHistoricos();
          fetchContasPatrimoniais();
          fetchRecebimentoData();
      }
  }, [open, parcelaId, refetchSaldos, fetchHistoricos, fetchContasPatrimoniais, fetchRecebimentoData]);

  const onSubmit = async (values: FormValues) => {
    if (!parcelaId || !proprietarioDaSessao) {
        showError('Dados da parcela ou administrador estão incompletos.');
        return;
    }
    
    setLoading(true);

    try {
        const { error: recebimentoError } = await supabase
            .from(tabelaRecebimentos)
            .update({
                observacao: values.observacao || null,
                codigo_transacao: values.codigo_transacao || null,
                conta_id: values.conta_id,
                historico_id: values.historico_id,
            })
            .eq('parcela_id', parcelaId);
        
        if (recebimentoError) throw recebimentoError;
        
        const { data: parcela, error: parcelaError } = await supabase
            .from(isAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber')
            .select('conta_receber_id')
            .eq('id', parcelaId)
            .single();
            
        if (parcelaError) throw parcelaError;
        
        const { error: contaError } = await supabase
            .from(tabelaContasReceber)
            .update({
                id_conta_patrimonial: values.conta_patrimonial_id,
            })
            .eq('id', parcela.conta_receber_id);
            
        if (contaError) throw contaError;
        
        showSuccess('Dados atualizados com sucesso!');
        onSaveComplete();
        onOpenChange(false);
    } catch (error: any) {
      showError(`Falha ao atualizar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Informações do Recebimento</DialogTitle>
          <DialogDescription>
            Você pode editar apenas campos específicos de um recebimento já registrado.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="observacao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição / Observação</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Descrição do recebimento" 
                      {...field} 
                      value={field.value ?? ''} 
                      rows={3}
                    />
                  </FormControl>
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
                  <FormControl>
                    <Input 
                      placeholder="ID da transação externa" 
                      {...field} 
                      value={field.value ?? ''} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="conta_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conta/Caixa de Destino (Ativo)</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || "0"}
                    disabled={loadingContas}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingContas
                              ? "Carregando Contas..."
                              : "Selecione a conta"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>

                    <SelectContent>
                      <SelectItem value="0" disabled>
                        Selecione a conta
                      </SelectItem>

                      {contasDestino.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome} ({c.tipo_saldo})
                        </SelectItem>
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
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || "0"}
                    disabled={loadingContasPatrimoniais}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingContasPatrimoniais
                              ? "Carregando Contas..."
                              : `Selecione a conta de Ativo (${configMap.Ativo}.x.x)`
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="0">Nenhum (Não Mapear)</SelectItem>
                      {contasPatrimoniais.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.Conta} - {c.Descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isAdmin && (
              <FormField
                control={form.control}
                name="historico_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Histórico do Recebimento</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || "0"}
                      disabled={loadingHistoricos}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              loadingHistoricos
                                ? "Carregando Históricos..."
                                : "Selecione o histórico"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0">Nenhum</SelectItem>
                        {historicos.map((h) => (
                          <SelectItem key={h.id} value={String(h.id)}>
                            {h.codigo && (
                              <span className="font-mono text-xs mr-2">
                                [{h.codigo}]
                              </span>
                            )}
                            {h.descricao}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="flex gap-3 justify-end pt-4">
              <Button 
                type="button"
                variant="outline" 
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading || form.formState.isSubmitting}
              >
                {loading || form.formState.isSubmitting ? (
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
