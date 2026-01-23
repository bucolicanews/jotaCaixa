import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, QrCode, Send, Mail, Loader2, RefreshCw, Terminal, Search, AlertCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface VisualizarLinkPagBankDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentLink: string | null;
  checkoutLink?: string | null;
  qrCode: string | null;
  qrCodeText: string | null;
  valorParcela: number;
  descricao: string;
  status: string | null;
  parcelaId?: string;
  clienteNome?: string;
  clienteTelefone?: string;
  clienteEmail?: string;
}

export function VisualizarLinkPagBankDialog({
  open,
  onOpenChange,
  paymentLink,
  checkoutLink,
  qrCode,
  qrCodeText,
  valorParcela,
  descricao,
  status,
  parcelaId,
  clienteNome,
  clienteTelefone,
  clienteEmail,
}) {
  const { ownerId } = useSessao();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [manualOrderId, setManualOrderId] = useState('');
  const [whatsappTemplate, setWhatsappTemplate] = useState('Olá {nome}! Segue o link para pagamento de R$ {valor} referente a {descricao}: {link}');
  const [confirmForceDialog, setConfirmForceDialog] = useState<{
    open: boolean;
    status?: string;
    valorBruto?: number;
    valorLiquido?: number;
    taxa?: number;
    codigoTransacao?: string;
    manualInput?: boolean;
  } | null>(null);

  const linkToUse = checkoutLink || paymentLink;

  useEffect(() => {
    const fetchTemplate = async () => {
      if (!ownerId) return;
      
      const { data } = await supabase
        .from('configuracoes_pagbank')
        .select('whatsapp_template')
        .eq('proprietario_id', ownerId)
        .maybeSingle();
        
      if (data?.whatsapp_template) {
        setWhatsappTemplate(data.whatsapp_template);
      }
    };
    
    if (open) {
      fetchTemplate();
    }
  }, [open, ownerId]);

  const handleSyncStatus = async (forceId?: string) => {
    if (!parcelaId) return;
    
    try {
      setSyncing(true);
      
      if (forceId) {
        const { data, error: invokeError } = await supabase.functions.invoke('forcar-baixa-pagbank', {
          body: { 
            parcela_id: parcelaId,
            codigo_transacao: forceId.trim(),
            force: false
          }
        });

        if (invokeError) {
          let errorMsg = 'Falha na comunicação com o servidor.';
          try {
            const errorContext = await invokeError.context?.json();
            errorMsg = errorContext?.error || invokeError.message;
          } catch (e) {
            errorMsg = invokeError.message;
          }
          throw new Error(errorMsg);
        }

        if (data?.not_found) {
          const taxaEstimada = valorParcela * 0.0099;
          const valorLiquidoEstimado = valorParcela - taxaEstimada;
          
          setConfirmForceDialog({
            open: true,
            status: 'PAID',
            valorBruto: valorParcela,
            valorLiquido: parseFloat(valorLiquidoEstimado.toFixed(2)),
            taxa: parseFloat(taxaEstimada.toFixed(2)),
            codigoTransacao: forceId.trim(),
            manualInput: true
          });
          return;
        }

        if (data?.not_paid) {
          const valorBrutoFinal = data.valor_bruto > 0 ? data.valor_bruto : valorParcela;
          const taxaEstimada = valorBrutoFinal * 0.0099;
          const valorLiquidoFinal = data.valor_liquido > 0 ? data.valor_liquido : (valorBrutoFinal - taxaEstimada);
          const taxaFinal = data.taxa > 0 ? data.taxa : (valorBrutoFinal - valorLiquidoFinal);
          
          setConfirmForceDialog({
            open: true,
            status: data.status,
            valorBruto: valorBrutoFinal,
            valorLiquido: parseFloat(valorLiquidoFinal.toFixed(2)),
            taxa: parseFloat(taxaFinal.toFixed(2)),
            codigoTransacao: forceId.trim(),
            manualInput: true
          });
          return;
        }

        if (data?.success) {
          toast.success(data.message || 'Baixa realizada com sucesso!');
          setTimeout(() => onOpenChange(false), 2000);
          return;
        }

        throw new Error(data?.error || 'Erro ao forçar baixa');
      }

      const { data, error: invokeError } = await supabase.functions.invoke('sync-pagbank-transactions', {
        body: { 
            parcelaId,
            manualOrderId: forceId || null
        }
      });

      if (invokeError) {
          let errorMsg = 'Falha na comunicação com o servidor.';
          try {
              const errorContext = await invokeError.context?.json();
              errorMsg = errorContext?.error || invokeError.message;
          } catch (e) {
              errorMsg = invokeError.message;
          }
          throw new Error(errorMsg);
      }
      
      if (!data.success) throw new Error(data.error || 'Erro ao sincronizar');
      
      console.log('%c=== 🔍 INVESTIGAÇÃO DE SINCRONIZAÇÃO ===', 'background: #f59e0b; color: #000; font-weight: bold; padding: 4px;');
      console.log('ID Parcela:', parcelaId);
      console.log('Status do Link:', data.status);
      console.log('Pagamento Confirmado?', data.isPaid);
      console.log('Resposta Bruta:', data.rawResponse);
      console.log('%c====================================', 'background: #f59e0b; color: #000; font-weight: bold; padding: 4px;');

      if (data.isPaid) {
          toast.success('Pagamento detectado! A parcela foi baixada com sucesso.');
          setTimeout(() => onOpenChange(false), 2000);
      } else if (forceId) {
          toast.warning(`A transação ${forceId} foi encontrada, mas o status é "${data.status}" (não pago).`);
      } else {
          toast.info(`Status atual: ${data.status}. Nenhum pagamento confirmado encontrado.`);
      }
      
    } catch (error: any) {
      console.error('Erro ao sincronizar:', error);
      toast.error(error.message, {
          icon: <AlertTriangle className="text-red-500" />,
          duration: 5000
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleConfirmForce = async () => {
    if (!confirmForceDialog || !parcelaId) return;
    
    try {
      setSyncing(true);
      
      const requestBody: any = { 
        parcela_id: parcelaId,
        codigo_transacao: confirmForceDialog.codigoTransacao,
        force: true
      };
      
      if (confirmForceDialog.manualInput) {
        requestBody.valor_bruto_manual = confirmForceDialog.valorBruto;
        requestBody.valor_liquido_manual = confirmForceDialog.valorLiquido;
        requestBody.taxa_manual = confirmForceDialog.taxa;
      }
      
      const { data, error: invokeError } = await supabase.functions.invoke('forcar-baixa-pagbank', {
        body: requestBody
      });
      
      setConfirmForceDialog(null);
      
      if (invokeError) {
        let errorMsg = 'Falha na comunicação com o servidor.';
        try {
          const errorContext = await invokeError.context?.json();
          errorMsg = errorContext?.error || invokeError.message;
        } catch (e) {
          errorMsg = invokeError.message;
        }
        throw new Error(errorMsg);
      }

      if (data?.success) {
        toast.success(data.message || 'Baixa forçada realizada com sucesso!');
        setTimeout(() => onOpenChange(false), 2000);
      } else {
        toast.error(data?.error || 'Erro ao forçar baixa');
      }
    } catch (error: any) {
      console.error('Erro ao forçar baixa:', error);
      toast.error(error.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleCopyLink = async (text: string, type: 'link' | 'pix') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'link') setCopiedLink(true); else setCopiedPix(true);
      toast.success('Copiado!');
      setTimeout(() => { setCopiedLink(false); setCopiedPix(false); }, 2000);
    } catch (error) {
      toast.error('Erro ao copiar');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Link de Pagamento PagBank</DialogTitle>
            <DialogDescription>
              Valor: R$ {valorParcela.toFixed(2)} - {descricao}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Status e Sync Automático */}
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Badge variant={status === 'PAID' ? 'success' : 'warning'}>
                      {status || 'Ativo'}
                  </Badge>
              </div>
              <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleSyncStatus()} 
                  disabled={syncing || status === 'PAID'}
                  className="h-8 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700"
              >
                  {syncing && !manualOrderId ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <RefreshCw className="h-3 w-3 mr-2" />}
                  Sync Automático
              </Button>
            </div>

            {/* NOVO: Busca Manual via ID */}
            {status !== 'PAID' && (
                <div className="space-y-2 p-3 border border-amber-200 rounded-lg bg-amber-50/50">
                    <Label className="text-xs font-bold text-amber-800 flex items-center gap-1">
                        <Search className="w-3 h-3" /> NÃO CONCILIOU AUTOMATICAMENTE?
                    </Label>
                    <p className="text-[10px] text-amber-700 leading-tight mb-2">
                        Se o cliente pagou mas o status não mudou, cole o <b>ID da Transação</b> (Ex: ORDE_..., CHAR_..., CHEC_...) abaixo:
                    </p>
                    <div className="flex gap-2">
                        <Input 
                          placeholder="ID da Transação (Order ID)" 
                          value={manualOrderId}
                          onChange={(e) => setManualOrderId(e.target.value)}
                          className="h-8 text-xs border-amber-300"
                        />
                        <Button 
                          size="sm" 
                          variant="warning"
                          onClick={() => handleSyncStatus(manualOrderId)}
                          disabled={syncing || !manualOrderId}
                          className="h-8 text-xs"
                        >
                            {syncing && manualOrderId ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Forçar Baixa'}
                        </Button>
                    </div>
                </div>
            )}

            {qrCode && (
              <div className="flex flex-col items-center space-y-2 py-2">
                <img src={qrCode} alt="QR Code PIX" className="w-40 h-40 border rounded-lg bg-white p-2" />
                <Button variant="outline" size="sm" onClick={() => handleCopyLink(qrCodeText || '', 'pix')}>
                  {copiedPix ? <Check className="h-3 w-3 mr-2" /> : <QrCode className="h-3 w-3 mr-2" />}
                  Copiar Código PIX
                </Button>
              </div>
            )}

            {linkToUse && (
              <div className="space-y-2">
                <Label className="text-xs">Link de Checkout</Label>
                <div className="flex gap-2">
                  <Input readOnly value={linkToUse} className="h-9 text-xs bg-muted truncate" />
                  <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => handleCopyLink(linkToUse, 'link')}>
                      {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            {/* Rodapé de Envio */}
            <div className="border-t pt-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => {
                      const telefone = clienteTelefone?.replace(/\D/g, '');
                      const msg = whatsappTemplate
                        .replace('{nome}', clienteNome || 'Cliente')
                        .replace('{valor}', valorParcela.toFixed(2))
                        .replace('{descricao}', descricao)
                        .replace('{link}', linkToUse || '');
                      window.open(`https://wa.me/55${telefone}?text=${encodeURIComponent(msg)}`, '_blank');
                  }} disabled={!clienteTelefone}>
                    <Send className="h-4 w-4 mr-2" /> WhatsApp
                  </Button>
                  <Button variant="outline" onClick={async () => {
                      setSendingEmail(true);
                      try {
                          const { data } = await supabase.functions.invoke('send-payment-email', { body: { parcela_id: parcelaId, admin_id: ownerId } });
                          if (data.success) toast.success('E-mail enviado!');
                      } catch (e) { toast.error('Falha ao enviar e-mail'); }
                      finally { setSendingEmail(false); }
                  }} disabled={sendingEmail || !clienteEmail}>
                    {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />} Email
                  </Button>
                </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmForceDialog?.open || false} onOpenChange={() => setConfirmForceDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmForceDialog?.manualInput ? 'Informar Valores Manualmente' : 'Confirmar Baixa com Status Não-Pago'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {confirmForceDialog?.manualInput ? (
                  <div>
                    <p className="mb-4 text-sm">
                      A transação não foi encontrada automaticamente. Informe os valores do extrato bancário:
                    </p>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Valor Bruto (R$)</Label>
                        <Input 
                          type="number" 
                          step="0.01"
                          value={confirmForceDialog?.valorBruto || 0}
                          onChange={(e) => setConfirmForceDialog(prev => prev ? {
                            ...prev,
                            valorBruto: parseFloat(e.target.value) || 0,
                            taxa: (prev.valorBruto || 0) - (prev.valorLiquido || 0)
                          } : null)}
                          className="h-9 text-sm mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Valor Líquido / Total (R$)</Label>
                        <Input 
                          type="number" 
                          step="0.01"
                          value={confirmForceDialog?.valorLiquido || 0}
                          onChange={(e) => {
                            const liquido = parseFloat(e.target.value) || 0;
                            setConfirmForceDialog(prev => prev ? {
                              ...prev,
                              valorLiquido: liquido,
                              taxa: (prev.valorBruto || 0) - liquido
                            } : null);
                          }}
                          className="h-9 text-sm mt-1"
                        />
                      </div>
                      <div className="flex justify-between p-2 bg-muted rounded">
                        <span className="text-sm">Taxa Calculada:</span>
                        <span className="text-sm font-semibold text-red-600">
                          - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
                            .format(confirmForceDialog?.taxa || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="mb-4">
                      A transação foi encontrada no PagBank, mas o status atual é:
                      <strong className="text-yellow-600"> {confirmForceDialog?.status}</strong>
                    </p>
                    
                    <div className="mt-4 space-y-2 border-t pt-4">
                      <div className="flex justify-between">
                        <span>Valor Bruto:</span>
                        <span className="font-semibold">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
                            .format(confirmForceDialog?.valorBruto || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Taxa PagBank:</span>
                        <span className="font-semibold text-red-600">
                          - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
                            .format(confirmForceDialog?.taxa || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span>Valor Líquido:</span>
                        <span className="font-bold text-green-600">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
                            .format(confirmForceDialog?.valorLiquido || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                
                <p className="mt-4 text-sm">
                  Deseja forçar a baixa desta parcela? Os lançamentos contábeis serão realizados normalmente.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={syncing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmForce} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sim, Forçar Baixa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}