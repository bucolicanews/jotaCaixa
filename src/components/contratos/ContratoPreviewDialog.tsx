import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, Printer } from 'lucide-react';
import { usePrint } from '@/hooks/use-print';

interface ContratoPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conteudoHtml: string;
  titulo: string;
  isHtml: boolean;
}

const ContratoPreviewDialog: React.FC<ContratoPreviewDialogProps> = ({ open, onOpenChange, conteudoHtml, titulo, isHtml }) => {
  const { printContent } = usePrint();

  const handlePrint = () => {
    let printHtml = conteudoHtml;
    
    if (!isHtml) {
        // Se for texto simples, envolve em <pre> para preservar a formatação na impressão
        printHtml = `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${printHtml}</pre>`;
    }
    
    printContent(printHtml, `Prévia do Contrato: ${titulo}`);
  };
  
  // Conteúdo a ser exibido na tela com classes de cores resetadas para "modo papel"
  const contentToDisplay = isHtml ? (
    <div 
        dangerouslySetInnerHTML={{ __html: conteudoHtml }} 
        // Adicionado text-zinc-900 para garantir cor escura independente do tema do sistema
        className="ql-editor text-zinc-900" 
    />
  ) : (
    // Forçado text-zinc-900 e font-sans para melhor leitura
    <pre className="text-zinc-900 whitespace-pre-wrap font-sans m-0">
        {conteudoHtml}
    </pre>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-full md:max-w-5xl max-h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Eye className="w-5 h-5 mr-2" /> Prévia do Contrato: {titulo}
          </DialogTitle>
          <DialogDescription>
            Esta é a visualização final do contrato com todas as tags preenchidas. Modo: {isHtml ? 'HTML' : 'Texto Simples'}.
          </DialogDescription>
        </DialogHeader>
        
        {/* Ajuste Principal: 
            1. bg-white dark:bg-white -> Garante fundo branco sempre.
            2. text-zinc-900 -> Garante texto escuro sempre.
            3. ring-1 ring-zinc-200 -> Adiciona uma borda leve para destacar o "papel".
        */}
        <div className="flex-1 border rounded-md p-6 bg-white dark:bg-white text-zinc-900 shadow-inner overflow-y-auto min-h-[400px]">
          <div className="mx-auto max-w-[800px]">
            {contentToDisplay}
          </div>
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