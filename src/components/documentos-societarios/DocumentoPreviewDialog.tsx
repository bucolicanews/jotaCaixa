import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, Printer } from 'lucide-react';
import { usePrint } from '@/hooks/use-print';

interface DocumentoPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conteudoHtml: string;
  titulo: string;
  isHtml: boolean;
}

const DocumentoPreviewDialog: React.FC<DocumentoPreviewDialogProps> = ({ open, onOpenChange, conteudoHtml, titulo, isHtml }) => {
  const { printContent } = usePrint();

  const handlePrint = () => {
    let printHtml = conteudoHtml;
    
    if (!isHtml) {
        printHtml = `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${printHtml}</pre>`;
    }
    
    printContent(printHtml, `Prévia do Documento: ${titulo}`);
  };
  
  const contentToDisplay = isHtml ? (
    <div 
        dangerouslySetInnerHTML={{ __html: conteudoHtml }} 
        // CLASSE CRÍTICA: Aplica os estilos do Quill para formatação (h2, centralização, etc.)
        className="ql-editor"
    />
  ) : (
    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{conteudoHtml}</pre>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-full md:max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Eye className="w-5 h-5 mr-2" /> Prévia do Documento: {titulo}
          </DialogTitle>
          <DialogDescription>
            Visualização do documento com todas as tags preenchidas. Modo: {isHtml ? 'HTML' : 'Texto Simples'}.
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

export default DocumentoPreviewDialog;