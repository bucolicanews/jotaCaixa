import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, Printer } from 'lucide-react';
import { usePrint } from '@/hooks/use-print';
import { stripHtmlTags } from '@/utils/formatters'; // Importando stripHtmlTags

interface ContratoPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conteudoHtml: string;
  titulo: string;
  isHtml: boolean; // Flag que indica se o conteúdo é HTML puro
}

const ContratoPreviewDialog: React.FC<ContratoPreviewDialogProps> = ({ open, onOpenChange, conteudoHtml, titulo, isHtml }) => {
  const { printContent } = usePrint();

  const handlePrint = () => {
    // Passamos o conteúdo, o título e a flag isHtml para o hook de impressão
    printContent(conteudoHtml, `Prévia do Contrato: ${titulo}`, 'portrait', isHtml);
  };
  
  // Conteúdo a ser exibido na tela
  const contentToDisplay = isHtml ? (
    // Se for HTML, renderiza o HTML
    <div 
        className="prose dark:prose-invert max-w-none" // Adiciona classes 'prose' para estilização básica de HTML
        dangerouslySetInnerHTML={{ __html: conteudoHtml }} 
    />
  ) : (
    // Se for Texto Simples, usa <pre> para preservar a formatação
    <pre className="whitespace-pre-wrap font-sans text-base">{conteudoHtml}</pre>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Ajustado para sm:max-w-full e max-h-[95vh] */}
      <DialogContent className="sm:max-w-[90vw] md:max-w-5xl max-h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Eye className="w-5 h-5 mr-2" /> Prévia do Contrato: {titulo}
          </DialogTitle>
          <DialogDescription>
            Esta é a visualização final do contrato com todas as tags preenchidas. Modo: {isHtml ? 'HTML' : 'Texto Simples'}.
          </DialogDescription>
        </DialogHeader>
        
        <div className="border rounded-md p-4 bg-background shadow-inner overflow-y-auto flex-1">
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

export default ContratoPreviewDialog;