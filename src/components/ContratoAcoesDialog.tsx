import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, ExternalLink, FileText, Eye, Printer } from 'lucide-react';
import { ContratoGerado } from '@/types/contratos';
import { showSuccess } from '@/utils/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { usePrint } from '@/hooks/use-print'; // Importando usePrint

interface ContratoAcoesDialogProps {
  contrato: ContratoGerado | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ContratoAcoesDialog: React.FC<ContratoAcoesDialogProps> = ({ contrato, open, onOpenChange }) => {
  const [linkAssinatura, setLinkAssinatura] = useState('');
  const { printContent } = usePrint();

  useEffect(() => {
    if (contrato) {
      // Simulação de geração de link externo
      const baseLink = window.location.origin;
      const simulatedLink = `${baseLink}/assinar-contrato/${contrato.id}`;
      setLinkAssinatura(simulatedLink);
    }
  }, [contrato]);

  const handleCopyLink = () => {
    if (linkAssinatura) {
      navigator.clipboard.writeText(linkAssinatura);
      showSuccess('Link de assinatura copiado!');
    }
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
                <TabsTrigger value="link">Link de Assinatura</TabsTrigger>
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
                <div className="space-y-2">
                    <Label>Link para Assinatura Externa (Simulado)</Label>
                    <div className="flex space-x-2">
                        <Input readOnly value={linkAssinatura} className="flex-1" />
                        <Button onClick={handleCopyLink} variant="secondary" size="icon">
                            <Copy className="w-4 h-4" />
                        </Button>
                        <a href={linkAssinatura} target="_blank" rel="noopener noreferrer">
                            <Button variant="default" size="icon">
                                <ExternalLink className="w-4 h-4" />
                            </Button>
                        </a>
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">
                    Envie este link ao cliente para que ele possa visualizar e assinar o contrato eletronicamente.
                </p>
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