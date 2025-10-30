import { useCallback } from 'react';
import { showError } from '@/utils/toast';

/**
 * Hook para gerar e imprimir conteúdo HTML em uma nova janela.
 * @param contentHtml O HTML completo do conteúdo a ser impresso.
 * @param title O título do documento de impressão.
 */
export function usePrint() {
  const printContent = useCallback((contentHtml: string, title: string = 'Documento de Impressão') => {
    try {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        showError('Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-ups está ativo.');
        return;
      }

      // Estilos básicos para impressão (garantindo que o conteúdo seja legível)
      const printStyles = `
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #000; }
          h1, h2, h3 { margin-top: 0; }
          .print-header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
          .print-section { margin-bottom: 20px; border: 1px solid #ccc; padding: 15px; border-radius: 5px; }
          .print-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          .print-table th, .print-table td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 12px; }
          .print-table th { background-color: #f0f0f0; }
          .print-signatures { display: flex; justify-content: space-around; margin-top: 50px; }
          .print-signature-line { width: 40%; border-top: 1px solid #000; padding-top: 5px; text-align: center; font-size: 12px; }
          @media print {
            body { background-color: #fff; }
            .print-table { page-break-inside: auto; }
            .print-table tr { page-break-inside: avoid; page-break-after: auto; }
            .print-table thead { display: table-header-group; }
          }
        </style>
      `;

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${title}</title>
            ${printStyles}
          </head>
          <body>
            ${contentHtml}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      
      // Espera um breve momento para o conteúdo carregar antes de imprimir
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);

    } catch (e) {
      console.error('Erro ao imprimir:', e);
      showError('Falha ao iniciar a impressão.');
    }
  }, []);

  return { printContent };
}