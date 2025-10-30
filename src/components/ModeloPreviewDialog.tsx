import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, Printer } from 'lucide-react';
import { usePrint } from '@/hooks/use-print';

interface ModeloPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conteudoTemplate: string;
  titulo: string;
  isHtml: boolean; // Novo prop
}

const ModeloPreviewDialog: React.FC<ModeloPreviewDialogProps> = ({ open, onOpenChange, conteudoTemplate, titulo, isHtml }) => {
  const { printContent } = usePrint();

  const handlePrint = () => {
    let htmlContent = conteudoTemplate;
    // Substitui as tags por placeholders para a impressão
    htmlContent = htmlContent.replace(/\{\{[A-Z0-9_]+\}\}/g, '[[VALOR DA TAG]]');
    
    if (!isHtml) {
        // Se for texto simples, envolve em <pre> para preservar a formatação na impressão
        htmlContent = `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${htmlContent}</pre>`;
    }
    
    printContent(htmlContent, `Prévia do Modelo: ${titulo}`);
  };
  
  // Conteúdo a ser exibido na tela
  const contentToDisplay = isHtml ? (
    <div dangerouslySetInnerHTML={{ __html: conteudoTemplate }} />
  ) : (
    // Usa white-space: pre-wrap para preservar quebras de linha e espaços
    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{conteudoTemplate}</pre>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Eye className="w-5 h-5 mr-2" /> Prévia do Template: {titulo}
          </DialogTitle>
          <DialogDescription>
            Visualização da formatação do template. Modo: {isHtml ? 'HTML' : 'Texto Simples'}.
          </DialogDescription>
        </DialogHeader>
        
        <div className="border rounded-md p-4 bg-background shadow-inner overflow-y-auto max-h-[60vh]">
          {contentToDisplay}
        </div>
        
        <div className="flex justify-end space-x-2 pt-4">
            <Button onClick={handlePrint} variant="outline">
                <Printer className="w-4 h-4 mr-2" /> Imprimir / PDF
            </Button>
            <Button onClick={() => onOpenChange(false)} variant="secondary">
                Fechar
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModeloPreviewDialog;