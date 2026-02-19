import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Copy, Check, Send, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSessao } from '@/hooks/use-sessao';
import { differenceInDays, isPast, parseISO, isToday, format } from 'date-fns';
import { formatCurrency } from '@/utils/formatters';

interface GerarPixDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcelaId: string;
  valorParcela: number;
  dataVencimento: string;
  descricao: string;
  onSuccess?: () => void;
}

interface ClienteInfo {
  nome: string;
  email: string | null;
  telefone: string | null;
}

export function GerarPixDialog({
  open,
  onOpenChange,
  parcelaId,
  valorParcela,
  dataVencimento,
  descricao,
  onSuccess,
}: GerarPixDialogProps) {
  const { ownerId } = useSessao();
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrCodeText, setQrCodeText] = useState<string | null>(null);
  const [pixPaymentPageUrl, setPixPaymentPageUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clienteInfo, setClienteInfo] = useState<ClienteInfo | null>(null);

  const [config, setConfig] = useState<any>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [juros, setJuros] = useState(0);
  const [multa, setMulta] = useState(0);
  const [diasAtraso, setDiasAtraso] = useState(0);
  const [valorTotal, setValorTotal] = useState(valorParcela);

  useEffect(() => {
    const calculateFees = async () => {
      if (!open || !ownerId) return;
      
      setLoadingConfig(true);
      try {
        const { data, error } = await supabase
          .from('configuracoes_pagbank')
          .select('aplica_juros_multa, percentual_multa, percentual_juros_mes')
          .eq('proprietario_id', ownerId)
          .single();

        if (error) throw error;
        setConfig(data);

        const vencimento = parseISO(dataVencimento);
        const hoje = new Date();

        // A base de cálculo é sempre a `valorParcela` que vem da prop (valor original)
        const baseValueForCalc = valorParcela;

        if (data?.aplica_juros_multa && isPast(vencimento) && !isToday(vencimento)) {
          const dias = differenceInDays(hoje, vencimento);
          setDiasAtraso(dias > 0 ? dias : 0);

          const multaCalculada = baseValueForCalc * ((data.percentual_multa || 0) / 100);
          const jurosCalculados = (baseValueForCalc * (((data.percentual_juros_mes || 0) / 100) / 30)) * (dias > 0 ? dias : 0);
          
          setMulta(multaCalculada);
          setJuros(jurosCalculados);
          setValorTotal(baseValueForCalc + multaCalculada + jurosCalculados);
        } else {
          setMulta(0);
          setJuros(0);
          setDiasAtraso(0);
          setValorTotal(baseValueForCalc);
        }
      } catch (err) {
        console.error("Erro ao calcular juros/multa:", err);
        setValorTotal(valorParcela);
      } finally {
        setLoadingConfig(false);
      }
    };

    if (open) {
      calculateFees();
    } else {
      // Reset state when modal closes
      handleResetFull();
    }
  }, [open, ownerId, dataVencimento, valorParcela]);

  const handleGerarPix = async () => {
    try {
      setLoading(true);
      handleReset();

      if (!ownerId) {
        throw new Error('Sessão não encontrada. Por favor, faça login novamente.');
      }

      const { data: currentParcela, error: fetchError } = await supabase
        .from('admin_parcelas_receber')
        .select('valor_parcela, valor_original')
        .eq('id', parcelaId)
        .single();

      if (fetchError) {
        throw new Error(`Falha ao buscar dados da parcela: ${fetchError.message}`);
      }

      const updatePayload: any = {
        valor_multa: multa,
        valor_juros: juros,
        dias_atraso: diasAtraso,
        data_calculo_juros: new Date().toISOString(),
        valor_atualizado: valorTotal,
      };

      if (!currentParcela.valor_original) {
        updatePayload.valor_original = valorParcela;
      }

      const { error: updateError } = await supabase
        .from('admin_parcelas_receber')
        .update(updatePayload)
        .eq('id', parcelaId);
      
      if (updateError) {
        throw new Error(`Falha ao atualizar juros/multa na parcela: ${updateError.message}`);
      }

      const body = {
        parcela_id: parcelaId,
        payment_method: 'pix',
        admin_id: ownerId,
        amount: Math.round(valorTotal * 100),
      };

      const { data, error } = await supabase.functions.invoke('create-pagbank-payment', {
        body,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao gerar PIX');

      const { error: updateLinksError } = await supabase
        .from('admin_parcelas_receber')
        .update({
          pagbank_qr_code: data.qr_code,
          pagbank_qr_code_text: data.qr_code_text,
          pix_payment_page_url: data.pix_payment_page_url,
          pagbank_charge_id: data.charge_id,
          pagbank_status: 'WAITING',
          pagbank_link_expira_em: data.expiration_date,
        })
        .eq('id', parcelaId);

      if (updateLinksError) {
        throw new Error(`Falha ao salvar os dados do PIX na parcela: ${updateLinksError.message}`);
      }

      toast.success('PIX gerado com sucesso!');
      
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Erro ao gerar PIX:', error);
      toast.error(error.message || 'Erro ao gerar PIX');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Erro ao copiar');
    }
  };

  const handleSendWhatsApp = () => {
    if (!clienteInfo?.telefone) {
      toast.error('Telefone do cliente não encontrado');
      return;
    }

    if (!pixPaymentPageUrl) {
      toast.error('Link de pagamento PIX não disponível');
      return;
    }

    const telefone = clienteInfo.telefone.replace(/\D/g, '');
    const telefoneFormatado = telefone.startsWith('55') ? telefone : `55${telefone}`;
    
    const mensagem = `Olá ${clienteInfo.nome}! 👋\n\n📱 *Pagamento PIX Facilitado*\n\n👉 Clique no link para ver o QR Code e copiar o código:\n${pixPaymentPageUrl}\n\n💰 Valor: *${formatCurrency(valorTotal)}*\n📝 ${descricao}\n\n✅ Rápido, fácil e seguro!`;
    
    const url = `https://wa.me/${telefoneFormatado}?text=${encodeURIComponent(mensagem)}`;
    
    window.open(url, '_blank');
    toast.success('Abrindo WhatsApp...');
  };

  const handleSendEmail = async () => {
    if (!parcelaId || !ownerId) {
      toast.error('Dados incompletos para envio de email');
      return;
    }

    try {
      setSendingEmail(true);
      const { data, error } = await supabase.functions.invoke('send-payment-email', {
        body: { parcela_id: parcelaId, admin_id: ownerId },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Erro ao enviar email');
      toast.success(data.message || 'Email enviado com sucesso!');
    } catch (error: any) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar email');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleClose = () => {
    handleResetFull();
    onOpenChange(false);
  };

  const handleReset = () => {
    setQrCode(null);
    setQrCodeText(null);
    setPixPaymentPageUrl(null);
    setCopied(false);
    setClienteInfo(null);
  };

  const handleResetFull = () => {
    handleReset();
    setJuros(0);
    setMulta(0);
    setDiasAtraso(0);
    setValorTotal(valorParcela);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Gerar Pagamento PIX</DialogTitle>
          <DialogDescription>
            {descricao}
          </DialogDescription>
        </DialogHeader>

        {!qrCode ? (
          <div className="space-y-4 py-4">
            {loadingConfig ? (
              <div className="flex justify-center items-center h-20">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="ml-2 text-sm">Calculando valores...</span>
              </div>
            ) : (
              <>
                <Alert>
                  <AlertDescription>
                    Será gerado um QR Code PIX e uma página de pagamento para enviar ao cliente.
                  </AlertDescription>
                </Alert>
                <div className="p-4 border rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valor Principal:</span>
                    <span className="font-medium">{formatCurrency(valorParcela)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Vencimento Original:</span>
                    <span className="font-medium">{format(parseISO(dataVencimento), 'dd/MM/yyyy')}</span>
                  </div>
                  {diasAtraso > 0 && (
                    <>
                      <div className="flex justify-between text-sm text-red-600">
                        <span className="text-muted-foreground">Multa ({config?.percentual_multa}%):</span>
                        <span className="font-medium">{formatCurrency(multa)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-red-600">
                        <span className="text-muted-foreground">Juros ({diasAtraso} dias):</span>
                        <span className="font-medium">{formatCurrency(juros)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
                    <span>Valor Total a Pagar:</span>
                    <span className="text-primary">{formatCurrency(valorTotal)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">
                PIX gerado com sucesso! Compartilhe com o cliente.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="flex justify-center">
                <img src={qrCode} alt="QR Code PIX" className="w-48 h-48 border rounded-lg" />
              </div>

              {pixPaymentPageUrl && (
                <div className="space-y-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <Label className="text-blue-900 font-semibold">🔗 Link de Pagamento PIX</Label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={pixPaymentPageUrl} 
                      readOnly 
                      className="flex-1 p-2 border rounded text-sm text-blue-900 bg-white"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyLink(pixPaymentPageUrl)}
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-600">Envie este link para o cliente</p>
                </div>
              )}

              {qrCodeText && (
                <div className="space-y-2">
                  <Label>PIX Copia e Cola</Label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={qrCodeText} 
                      readOnly 
                      className="flex-1 p-2 border rounded text-sm bg-muted"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyLink(qrCodeText)}
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <Label className="mb-3 block">Enviar para o Cliente</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleSendWhatsApp}
                  disabled={!clienteInfo?.telefone}
                >
                  <Send className="h-4 w-4 mr-2" />
                  WhatsApp
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleSendEmail}
                  disabled={sendingEmail || !clienteInfo?.email || !parcelaId}
                >
                  {sendingEmail ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Email
                </Button>
              </div>
              {clienteInfo && (
                <p className="text-xs text-muted-foreground mt-2">
                  Cliente: {clienteInfo.nome} 
                  {clienteInfo.telefone && ` | Tel: ${clienteInfo.telefone}`}
                  {clienteInfo.email && ` | Email: ${clienteInfo.email}`}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {!qrCode ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={loading || loadingConfig}>
                Cancelar
              </Button>
              <Button onClick={handleGerarPix} disabled={loading || loadingConfig}>
                {(loading || loadingConfig) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gerar PIX
              </Button>
            </>
          ) : (
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={handleReset} className="flex-1">
                Gerar Novamente
              </Button>
              <Button onClick={handleClose} className="flex-1">
                Fechar
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}