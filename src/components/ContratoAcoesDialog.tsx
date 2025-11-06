import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, ExternalLink, FileText, Eye, Printer, Mail, MessageSquare, Loader2 } from 'lucide-react';
import { ContratoGerado } from '@/types/contratos';
import { showSuccess } from '@/utils/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { usePrint } from '@/hooks/use-print';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';

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
  useSessao();
  const [linkAssinatura, setLinkAssinatura] = useState('');
  const [config, setConfig] = useState<ContratoConfig>(DEFAULT_CONFIG);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const { printContent } = usePrint();
  
  const ownerId = contrato?.empresa_id; // O proprietário do contrato é quem define a configuração

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
      // Link real para a nova rota pública, usando a URL base configurada
      const realLink = `${config.url_base_assinatura}/assinar-contrato/${contrato.id}`;
      setLinkAssinatura(realLink);
    }
  }, [contrato, config.url_base_assinatura]);

  const handleCopyLink = () => {
    if (linkAssinatura) {
      navigator.clipboard.writeText(linkAssinatura);
      showSuccess('Link de assinatura copiado!');
    }
  };
  
  const handleSendEmail = () => {
      if (!linkAssinatura) return;
      
      const template = config.template_email.replace('{{LINK_ASSINATURA}}', linkAssinatura);
      const subject = encodeURIComponent(`Contrato para Assinatura: ${contrato?.valores_tags_preenchidos?.titulo || 'Documento'}`);
      const body = encodeURIComponent(template);
      
      // Tenta usar o email do cliente, se disponível nos metadados
      const recipient = contrato?.valores_tags_preenchidos?.['{{CLIENTE_EMAIL}}'] || '';
      
      window.open(`mailto:${recipient}?subject=${subject}&body=${body}`, '_blank');
      showSuccess('Abrindo cliente de e-mail...');
  };
  
  const handleSendWhatsapp = () => {
      if (!linkAssinatura) return;
      
      const template = config.template_whatsapp.replace('{{LINK_ASSINATURA}}', linkAssinatura);
      const message = encodeURIComponent(template);
      
      // Tenta usar o telefone do cliente, se disponível nos metadados
      const phone = contrato?.valores_tags_preenchidos?.['{{CLIENTE_TELEFONE}}']?.replace(/\D/g, '') || '';
      
      // Abre o link do WhatsApp
      window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
      showSuccess('Abrindo WhatsApp...');
  };
  
  const handlePrint = () => {
    if (contrato?.conteudo_renderizado) {
        const isHtml = contrato.valores_tags_preenchidos?.tipo_conteudo === 'html';
        let printHtml = contrato.conteudo_renderizado;
        
        if (!isHtml) {
            // Se for texto simples, envolve em <pre> para preservar a formatação na impressão
            printHtml = `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${printHtml}</pre>`;
        }
        
        printContent(printHtml, `Contrato: ${contrato.id}`);
    }
  };

  if (!contrato) return null;
  
  // Verifica o tipo de conteúdo salvo no contrato
  const isHtml = contrato.valores_tags_preenchidos?.tipo_conteudo === 'html';
  
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
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
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
                            <Label>Link para Assinatura Externa</Label>
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
                    </>
                )}
            </TabsContent>
        </Tabs>
        
        <div className="flex justify-end pt-4">
            <Button onClick={() => onOpenChange(false)} variant="secondary">
                Fechar
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContratoAcoesDialog;