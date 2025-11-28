import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, ExternalLink, FileText, Eye, Printer, Mail, MessageSquare, Loader2, Lock, Unlock, CheckCircle2, Building2 } from 'lucide-react';
import { ContratoGerado } from '@/types/contratos';
import { showSuccess, showError } from '@/utils/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { usePrint } from '@/hooks/use-print';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';
import { format } from 'date-fns';

interface ContratoAcoesDialogProps {
  contrato: ContratoGerado | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ContratoConfig {
    url_base_assinatura: string;
    template_whatsapp: string;
    template_email: string;
}

const DEFAULT_CONFIG: ContratoConfig = {
    url_base_assinatura: 'http://localhost:8080', // Fallback para dev
    template_whatsapp: 'Olá! Seu contrato está pronto para assinatura. Clique no link abaixo para visualizar e assinar:\n\n{{LINK_ASSINATURA}}',
    template_email: 'Prezado(a) cliente,\n\nSeu contrato está pronto para assinatura. Clique no link abaixo para visualizar e assinar:\n\n{{LINK_ASSINATURA}}\n\nAtenciosamente,\nEquipe Financeira',
};

const ContratoAcoesDialog: React.FC<ContratoAcoesDialogProps> = ({ contrato, open, onOpenChange }) => {
  const { usuario, role } = useSessao();
  const [linkAssinatura, setLinkAssinatura] = useState('');
  const [config, setConfig] = useState<ContratoConfig>(DEFAULT_CONFIG);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [isBlocking, setIsBlocking] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false); // NOVO ESTADO
  const { printContent } = usePrint();
  
  const ownerId = contrato?.proprietario_id; // O proprietário do contrato é quem define a configuração
  const isMyContract = ownerId === usuario?.id || (role === 'Cliente' && ownerId === (usuario as any)?.cliente_id);
  const isCanceledOrBlocked = contrato?.status === 'cancelado' || contrato?.status === 'bloqueado';
  const isAssinado = contrato?.status === 'ativo' || contrato?.status === 'concluido'; // NOVO

  const fetchConfig = useCallback(async () => {
    if (!ownerId) {
        setLoadingConfig(false);
        return;
    }
    
    setLoadingConfig(true);
    
    const { data, error } = await supabase
      .from('configuracao_contratos')
      .select('*')
      .eq('proprietario_id', ownerId)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Erro ao carregar config de contrato:', error);
    } else if (data) {
        setConfig(data as ContratoConfig);
    } else {
        // Se não houver configuração salva, usa o default
        setConfig(DEFAULT_CONFIG);
    }
    setLoadingConfig(false);
  }, [ownerId]);

  useEffect(() => {
    if (open && contrato) {
        fetchConfig();
    }
  }, [open, contrato, fetchConfig]);

  useEffect(() => {
    if (contrato && config.url_base_assinatura) {
      // NOVO LINK: Aponta para a página intermediária /contrato-link/:id
      const realLink = `${config.url_base_assinatura}/contrato-link/${contrato.id}`;
      setLinkAssinatura(realLink);
    }
  }, [contrato, config.url_base_assinatura]);

  const handleCopyLink = () => {
    if (linkAssinatura) {
      navigator.clipboard.writeText(linkAssinatura);
      showSuccess('Link de assinatura copiado!');
    }
  };
  
  // NOVO HANDLER: Enviar Contrato Assinado (Edge Function)
  const handleSendSignedContractEmail = async () => {
      if (!contrato || !isAssinado) return;
      
      const clienteEmail = contrato.valores_tags_preenchidos?.['{{CLIENTE_EMAIL}}'];
      if (!clienteEmail) {
          showError('Email do cliente não encontrado nas tags.');
          return;
      }
      
      setIsSendingEmail(true);
      
      try {
          const { data, error } = await supabase.functions.invoke('send-signed-contract', {
              body: { contratoId: contrato.id, clienteEmail },
          });
          
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          
          showSuccess('Cópia do contrato assinado enviada para o cliente!');
      } catch (error: any) {
          console.error('Erro ao enviar email:', error);
          showError('Falha ao enviar cópia do contrato por email: ' + error.message);
      } finally {
          setIsSendingEmail(false);
      }
  };

  const handleSendEmail = () => {
      if (!linkAssinatura) return;
      
      const template = config.template_email.replace('{{LINK_ASSINATURA}}', linkAssinatura);
      const subject = encodeURIComponent(`Contrato para Assinatura: ${contrato?.valores_tags_preenchidos?.titulo || 'Documento'}`);
      const body = encodeURIComponent(template);
      
      // Tenta usar o email do cliente, se disponível nas tags
      const recipient = contrato?.valores_tags_preenchidos?.['{{CLIENTE_EMAIL}}'] || '';
      
      window.open(`mailto:${recipient}?subject=${subject}&body=${body}`, '_blank');
      showSuccess('Abrindo cliente de e-mail...');
  };
  
  const handleSendWhatsapp = () => {
      if (!linkAssinatura) return;
      
      // 1. Substitui a tag no template
      const template = config.template_whatsapp.replace('{{LINK_ASSINATURA}}', linkAssinatura);
      
      // 2. Codifica a mensagem inteira
      const message = encodeURIComponent(template);
      
      // 3. Tenta usar o telefone do cliente, se disponível nos metadados
      const phone = contrato?.valores_tags_preenchidos?.['{{CLIENTE_TELEFONE}}']?.replace(/\D/g, '') || '';
      
      // Abre o link do WhatsApp
      window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
      showSuccess('Abrindo WhatsApp...');
  };
  
  const handlePrint = () => {
    if (!contrato?.conteudo_renderizado) {
        showError('Conteúdo do contrato não disponível para impressão.');
        return;
    }
    
    // CORREÇÃO CRÍTICA: Inicializa finalContent com o conteúdo renderizado
    let finalContent = contrato.conteudo_renderizado;
    
    const isHtml = contrato.valores_tags_preenchidos?.tipo_conteudo === 'html';
    const isAssinado = contrato.status === 'ativo' || contrato.status === 'concluido';
    
    // Dados do Cliente
    const clienteNome = contrato.assinatura_nome || contrato.valores_tags_preenchidos?.['{{CLIENTE_NOME}}'] || 'Cliente Contratado';
    const clienteDocumento = contrato.valores_tags_preenchidos?.['{{CLIENTE_DOCUMENTO}}'] || contrato.valores_tags_preenchidos?.['{{CLIENTE_CPF}}'] || contrato.valores_tags_preenchidos?.['{{CLIENTE_CNPJ}}'] || 'Documento Não Informado';
    const dataAssinatura = isAssinado ? format(new Date(contrato.updated_at), 'dd/MM/yyyy HH:mm') : 'Pendente';
    
    // --- Lógica de Injeção de Assinaturas ---
    
    // Bloco de Assinatura do Cliente (Detalhado)
    const clienteSignatureBlock = isAssinado ? `
        <div style="text-align: center; margin-top: 20px; font-size: 10pt;">
            ${contrato.assinatura_selfie_url ? `<img src="${contrato.assinatura_selfie_url}" style="max-height: 50px; margin-bottom: 5px;" />` : '_________________________'}
            <div style="border-top: 1px solid #000; padding-top: 5px; font-size: 12px; font-weight: bold;">
                ${clienteNome}
            </div>
            <p style="font-size: 10px; margin: 2px 0;">CPF/CNPJ: ${clienteDocumento}</p>
            <p style="font-size: 10px; margin: 2px 0;">Data Assinatura: ${dataAssinatura}</p>
            <p style="font-size: 10px; margin-top: 5px;">Contratado (Cliente)</p>
        </div>
    ` : `
        <div style="text-align: center; margin-top: 20px; font-size: 10pt;">
            <div style="border-top: 1px solid #000; padding-top: 5px; font-size: 12px; font-weight: bold;">
                ${clienteNome}
            </div>
            <p style="font-size: 10px; margin-top: 5px;">Pendente de Assinatura</p>
        </div>
    `;
    
    // Bloco de Assinatura da Empresa (Contratante)
    const empresaSignatureBlock = `
        <div style="text-align: center; margin-top: 20px; font-size: 10pt;">
            ${contrato.assinatura_proprietario_url ? `<img src="${contrato.assinatura_proprietario_url}" style="max-height: 50px; margin-bottom: 5px;" />` : '_________________________'}
            <div style="border-top: 1px solid #000; padding-top: 5px; font-size: 12px; font-weight: bold;">
                ${contrato.assinatura_proprietario_nome || 'Empresa Contratante'}
            </div>
            <p style="font-size: 10px; margin-top: 5px;">Contratante (Empresa)</p>
        </div>
    `;
    
    // Substituição das tags de assinatura
    finalContent = finalContent.replace(/\{\{ASSINATURA_EMPRESA\}\}/g, empresaSignatureBlock);
    finalContent = finalContent.replace(/\{\{ASSINATURA_CLIENTE\}\}/g, clienteSignatureBlock);
    
    // 2. Se for HTML, injeta a seção de rodapé (data de assinatura)
    if (isHtml) {
        // Adiciona um rodapé de validação eletrônica
        const validationRodape = `
            <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ccc; page-break-before: avoid; text-align: center; font-size: 10px;">
                <p>Documento gerado e assinado eletronicamente. Validade jurídica conforme MP 2.200-2/2001.</p>
            </div>
        `;
        const bodyEndIndex = finalContent.toLowerCase().lastIndexOf('</body>');
        if (bodyEndIndex !== -1) {
            finalContent = finalContent.substring(0, bodyEndIndex) + validationRodape + finalContent.substring(bodyEndIndex);
        } else {
            finalContent += validationRodape;
        }
    } else {
        // Se for texto simples, adiciona o rodapé de assinatura em formato de texto
        finalContent = `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${finalContent}</pre>`;
        finalContent += `\n\n--- Assinaturas ---\nContratante: ${contrato.assinatura_proprietario_nome || 'Empresa'}\nContratado: ${clienteNome}\nDocumento: ${clienteDocumento}\nData: ${dataAssinatura}\n\n(Documento assinado eletronicamente)`;
    }
    
    // --- NOVO: Injeção da Logo no Cabeçalho de Impressão ---
    const logoUrl = contrato.assinatura_proprietario_url;
    const ownerName = contrato.assinatura_proprietario_nome || 'Empresa Contratante';
    
    let headerHtml = '';
    if (logoUrl) {
        // ESTILO CRÍTICO: Garante que a logo fique no canto superior esquerdo
        headerHtml = `
            <div class="print-header" style="display: flex; flex-direction: column; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px;">
                <img src="${logoUrl}" alt="${ownerName}" class="print-logo" style="max-height: 50px; max-width: 150px; object-fit: contain; margin-bottom: 5px;" />
                <h1 style="font-size: 14px; font-weight: bold; margin: 0; text-align: left;">${ownerName}</h1>
            </div>
        `;
    }
    
    // Envolve o conteúdo final com o cabeçalho
    const finalPrintHtml = `
        ${headerHtml}
        <div style="padding-top: 10px;">
            ${finalContent}
        </div>
    `;
    // --- FIM NOVO ---
    
    printContent(finalPrintHtml, `Contrato Assinatura - ${contrato.id}`);
  };
  
  const handleBlockContract = async () => {
    if (!contrato) return;
    setIsBlocking(true);
    
    try {
        // 1. Bloquear parcelas pendentes (RPC cancel_contract_installments agora define o status do contrato como 'bloqueado' e as parcelas como 'cancelada')
        const { error: rpcError } = await supabase.rpc('cancel_contract_installments', {
            p_contrato_id: contrato.id,
            p_motivo: 'Contrato Bloqueado',
        });
        
        if (rpcError) throw rpcError;
        
        showSuccess('Contrato bloqueado e parcelas bloqueadas com sucesso.');
        // Força o recarregamento da página de contratos
        window.location.href = '/contratos';
    } catch (error: any) {
        console.error('Erro ao bloquear contrato:', error);
        showError('Falha ao bloquear contrato: ' + error.message);
    } finally {
        setIsBlocking(false);
    }
  };
  
  const handleReactivateContract = async () => {
    if (!contrato) return;
    setIsBlocking(true);
    
    try {
        // 1. Reativar parcelas
        const { error: rpcError } = await supabase.rpc('reactivate_contract_installments', {
            p_contrato_id: contrato.id,
        });
        
        if (rpcError) throw rpcError;
        
        showSuccess('Contrato desbloqueado e parcelas reativadas com sucesso.');
        // Força o recarregamento da página de contratos
        window.location.href = '/contratos';
    } catch (error: any) {
        console.error('Erro ao desbloquear contrato:', error);
        showError('Falha ao desbloquear contrato: ' + error.message);
    } finally {
        setIsBlocking(false);
    }
  };

  if (!contrato) return null;
  
  // Verifica o tipo de conteúdo salvo no contrato
  const isHtml = contrato.valores_tags_preenchidas?.tipo_conteudo === 'html';
  
  // Conteúdo a ser exibido na aba de prévia
  const contentToDisplay = contrato.conteudo_renderizado ? (
    isHtml ? (
        <div dangerouslySetInnerHTML={{ __html: contrato.conteudo_renderizado }} />
    ) : (
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{contrato.conteudo_renderizado}</pre>
    )
  ) : (
    <p className="text-center text-muted-foreground">Conteúdo não renderizado ou contrato em rascunho.</p>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <FileText className="w-5 h-5 mr-2" /> Ações do Contrato
          </DialogTitle>
          <DialogDescription>
            Contrato gerado em {new Date(contrato.criado_em).toLocaleDateString()}. Status: {contrato.status}.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="preview">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="preview" className="flex items-center"><Eye className="w-4 h-4 mr-1" /> Visualizar Contrato</TabsTrigger>
                <TabsTrigger value="link">Enviar para Assinatura</TabsTrigger>
            </TabsList>
            
            {/* ABA: PRÉVIA RENDERIZADA */}
            <TabsContent value="preview" className="space-y-4 pt-4">
                <div className="border rounded-md p-4 bg-background shadow-inner overflow-y-auto max-h-[50vh]">
                    {contentToDisplay}
                </div>
                <Button onClick={handlePrint} variant="outline" className="w-full">
                    <Printer className="w-4 h-4 mr-2" /> Imprimir / Gerar PDF
                </Button>
            </TabsContent>
            
            <TabsContent value="link" className="space-y-4 pt-4">
                {loadingConfig ? (
                    <div className="flex justify-center items-center h-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : (
                    <>
                        <div className="space-y-2">
                            <Label>Link para Página de Assinatura</Label>
                            <div className="flex space-x-2">
                                <Input readOnly value={linkAssinatura} className="flex-1" />
                                <Button onClick={handleCopyLink} variant="secondary" size="icon" title="Copiar Link">
                                    <Copy className="w-4 h-4" />
                                </Button>
                                <a href={linkAssinatura} target="_blank" rel="noopener noreferrer">
                                    <Button variant="default" size="icon" title="Abrir Link">
                                        <ExternalLink className="w-4 h-4" />
                                    </Button>
                                </a>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            URL Base utilizada: <span className="font-mono text-xs text-primary">{config.url_base_assinatura}</span>
                        </p>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t">
                            <Button onClick={handleSendEmail} variant="outline" className="w-full">
                                <Mail className="w-4 h-4 mr-2" /> Enviar por Email
                            </Button>
                            <Button onClick={handleSendWhatsapp} variant="outline" className="w-full">
                                <MessageSquare className="w-4 h-4 mr-2" /> Enviar por WhatsApp
                            </Button>
                        </div>
                        
                        {/* NOVO BOTÃO: Enviar Contrato Assinado */}
                        {isAssinado && (
                            <div className="pt-4 border-t">
                                <Button 
                                    onClick={handleSendSignedContractEmail} 
                                    variant="default" 
                                    className="w-full bg-green-600 hover:bg-green-700"
                                    disabled={isSendingEmail}
                                >
                                    {isSendingEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                                    Enviar Cópia Assinada ao Cliente
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </TabsContent>
        </Tabs>
        
        <div className="flex justify-between pt-4 border-t">
            {isMyContract && (
                isCanceledOrBlocked ? (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="default" size="sm" disabled={isBlocking}>
                                <Unlock className="w-4 h-4 mr-2" /> Desbloquear Contrato
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Desbloquear Contrato e Reativar Parcelas?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta ação irá reverter o status do contrato para 'pendente de assinatura' (ou 'ativo') e **reabrir todas as parcelas** que foram marcadas como canceladas devido ao bloqueio.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={isBlocking}>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={handleReactivateContract} disabled={isBlocking}>
                                    {isBlocking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Confirmar Desbloqueio'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                ) : (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={isBlocking}>
                                <Lock className="w-4 h-4 mr-2" /> Bloquear Contrato
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Bloquear Contrato e Bloquear Parcelas?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta ação irá marcar o contrato como 'bloqueado' e **BLOQUEAR todas as parcelas pendentes** associadas. Esta ação é reversível através do botão 'Desbloquear'.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={isBlocking}>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={handleBlockContract} disabled={isBlocking}>
                                    {isBlocking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Confirmar Bloqueio'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )
            )}
            
            <Button onClick={() => onOpenChange(false)} variant="secondary" className="ml-auto">
                Fechar
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContratoAcoesDialog;