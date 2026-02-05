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
  linkExpiraEm?: string | null;
  pagbankTransactionId?: string | null;
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
  linkExpiraEm,
  pagbankTransactionId,
}) {
  const { ownerId } = useSessao();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [manualOrderId, setManualOrderId] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [whatsappTemplatePix, setWhatsappTemplatePix] = useState('Olá {nome}!\n\nSegue o PIX para pagamento:\n💰 Valor: {valor}\n\n📱 Código PIX (Copie e Cole no seu banco):\n{codigo_pix}');
  const [whatsappTemplateLink, setWhatsappTemplateLink] = useState('Olá {nome}!\n\nSegue o link para pagamento:\n💰 Valor: {valor}\n\n🔗 {link}');
  const [confirmForceDialog, setConfirmForceDialog] = useState<{
    open: boolean;
    status?: string;
    valorBruto?: number;
    valorLiquido?: number;
    taxa?: number;
    codigoTransacao?: string;
    manualInput?: boolean;
  } | null>(null);

  useEffect(() => {
    const fetchTemplate = async () => {
      if (!ownerId) return;
      
      const { data } = await supabase
        .from('configuracoes_pagbank')
        .select('whatsapp_template_pix, whatsapp_template_link')
        .eq('proprietario_id', ownerId)
        .maybeSingle();
        
      if (data?.whatsapp_template_pix) {
        setWhatsappTemplatePix(data.whatsapp_template_pix);
      }
      if (data?.whatsapp_template_link) {
        setWhatsappTemplateLink(data.whatsapp_template_link);
      }
    };
    
    if (open) {
      fetchTemplate();
    }
  }, [open, ownerId]);

  const handleSyncStatus = async (forceId?: string) => {
    if (!parcelaId) return;
    
    setSyncing(true);
    const toastId = toast.loading('Sincronizando com PagBank...');

    try {
      // Chama a função atualizada sync-pagbank-transactions
      const { data, error } = await supabase.functions.invoke('sync-pagbank-transactions', {
        body: { 
            parcelaId,
            manualOrderId: forceId || null
        }
      });

      if (error) {
        throw new Error(error.message || 'Erro de comunicação com o servidor.');
      }

      if (!data.success) {
        throw new Error(data.error || 'Erro desconhecido na sincronização.');
      }

      toast.dismiss(toastId);

      if (data.isPaid) {
          toast.success('Pagamento confirmado! A parcela foi baixada.');
          setTimeout(() => onOpenChange(false), 1500);
      } else {
          const statusMsg = data.status ? `Status atual: ${data.status}` : 'Pagamento ainda não confirmado.';
          toast.info(statusMsg);
      }
      
    } catch (error: any) {
      toast.dismiss(toastId);
      console.error('Erro ao sincronizar:', error);
      toast.error('Falha na sincronização: ' + error.message);
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
      
      if (invokeError) throw new Error(invokeError.message);

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

  const handleRegenerateLink = async () => {
    if (!parcelaId || !ownerId) return;
    
    try {
      setRegenerating(true);
      
      const { data, error } = await supabase.functions.invoke('create-pagbank-checkout', {
        body: { 
          parcela_id: parcelaId,
          admin_id: ownerId
        }
      });
      
      if (error) throw error;
      
      if (data?.success) {
        toast.success('Link gerado com sucesso!');
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        throw new Error(data?.error || 'Erro ao gerar link');
      }
    } catch (error: any) {
      console.error('Erro ao regenerar link:', error);
      toast.error(error.message || 'Falha ao gerar novo link');
    } finally {
      setRegenerating(false);
      setShowRegenerateConfirm(false);
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
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-[500px] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Link de Pagamento PagBank</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Valor: R$ {valorParcela.toFixed(2)} - {descricao}
              {linkExpiraEm && (
                <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                  Link válido até: {new Date(linkExpiraEm).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 sm:space-y-6">
            {/* Status e Sync Automático */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">Status:</span>
                  {linkExpiraEm && new Date(linkExpiraEm) < new Date() ? (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Expirado
                    </Badge>
                  ) : (
                    <Badge variant={status === 'PAID' ? 'success' : 'warning'}>
                        {status || 'Ativo'}
                    </Badge>
                  )}
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

            {/* Botão Regenerar Link */}
            <div className="p-3 border border-blue-200 rounded-lg bg-blue-50/50">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <Label className="text-xs sm:text-sm font-bold text-blue-800">Regenerar Link</Label>
                  <p className="text-[10px] sm:text-xs text-blue-700 mt-0.5">
                    {linkExpiraEm && new Date(linkExpiraEm) < new Date() 
                      ? 'Link expirado! Gere um novo.' 
                      : 'Crie um novo link com prazo renovado'}
                  </p>
                </div>
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={() => setShowRegenerateConfirm(true)}
                  disabled={regenerating || status === 'PAID'}
                  className="h-8 text-xs w-full sm:w-auto"
                >
                  {regenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-2" />
                  )}
                  Gerar Novo Link
                </Button>
              </div>
            </div>

            {/* Busca Manual via ID */}
            {status !== 'PAID' && (
                <div className="space-y-2 p-3 border border-amber-200 rounded-lg bg-amber-50/50">
                    <Label className="text-xs font-bold text-amber-800 flex items-center gap-1">
                        <Search className="w-3 h-3" /> NÃO CONCILIOU AUTOMATICAMENTE?
                    </Label>
                    
                    {pagbankTransactionId ? (
                        <div className="p-2 bg-green-50 border border-green-200 rounded">
                            <Label className="text-xs text-green-800 font-semibold">Código da Transação (Salvo):</Label>
                            <div className="flex items-center gap-2 mt-1">
                                <code className="text-xs bg-white px-2 py-1 rounded border flex-1 font-mono">{pagbankTransactionId}</code>
                                <Button 
                                    size="icon" 
                                    variant="outline" 
                                    className="h-7 w-7" 
                                    onClick={() => {
                                        navigator.clipboard.writeText(pagbankTransactionId);
                                        toast.success('Código copiado!');
                                    }}
                                >
                                    <Copy className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <p className="text-[10px] text-amber-700 leading-tight mb-2">
                                Se o cliente pagou, cole o <b>Código da Transação</b> (ex: 858BDE28...) para forçar a baixa:
                            </p>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <Input 
                                  placeholder="Código da Transação" 
                                  value={manualOrderId}
                                  onChange={(e) => setManualOrderId(e.target.value)}
                                  className="h-8 text-xs border-amber-300"
                                />
                                <Button 
                                  size="sm" 
                                  variant="warning"
                                  onClick={() => handleSyncStatus(manualOrderId)}
                                  disabled={syncing || !manualOrderId}
                                  className="h-8 text-xs w-full sm:w-auto whitespace-nowrap"
                                >
                                    {syncing && manualOrderId ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Forçar Baixa'}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Links e QR Code */}
            {qrCode && (
              <div className="flex flex-col items-center space-y-2 py-2">
                <img src={qrCode} alt="QR Code PIX" className="w-32 h-32 sm:w-40 sm:h-40 border rounded-lg bg-white p-2" />
                <Button variant="outline" size="sm" onClick={() => handleCopyLink(qrCodeText || '', 'pix')} className="text-xs">
                  {copiedPix ? <Check className="h-3 w-3 mr-2" /> : <QrCode className="h-3 w-3 mr-2" />}
                  Copiar Código PIX
                </Button>
              </div>
            )}

            {paymentLink && (
              <div className="space-y-2">
                <Label className="text-xs">Link de Pagamento PIX</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input readOnly value={paymentLink} className="h-9 text-xs bg-muted truncate" />
                  <Button size="icon" variant="outline" className="h-9 w-full sm:w-9" onClick={() => handleCopyLink(paymentLink, 'link')}>
                      {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      <span className="sm:hidden ml-2">Copiar Link</span>
                  </Button>
                </div>
              </div>
            )}

            {checkoutLink && (
              <div className="space-y-2">
                <Label className="text-xs">Link de Checkout</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input readOnly value={checkoutLink} className="h-9 text-xs bg-muted truncate" />
                  <Button size="icon" variant="outline" className="h-9 w-full sm:w-9" onClick={() => handleCopyLink(checkoutLink, 'link')}>
                      {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      <span className="sm:hidden ml-2">Copiar Link</span>
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Dialog de Confirmação para Forçar Baixa */}
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
                            taxa: (parseFloat(e.target.value) || 0) - (prev.valorLiquido || 0)
                          } : null)}
                          className="h-9 text-sm mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Valor Líquido (R$)</Label>
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
                  <p className="mt-4 text-sm">
                    Status Atual: <strong className="text-yellow-600">{confirmForceDialog?.status}</strong>. 
                    Deseja forçar a baixa desta parcela mesmo assim?
                  </p>
                )}
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

      {/* Dialog de Confirmação para Regenerar Link */}
      <AlertDialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar Novo Link de Pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {(paymentLink || checkoutLink) ? (
                <div className="space-y-2">
                  <p>Já existe um link ativo para esta parcela.</p>
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Ao gerar um novo link, o anterior continuará funcionando, mas o novo terá 
                      prazo de validade renovado.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <p>Será criado um novo link de pagamento com prazo de validade atualizado.</p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerateLink}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}