import { useCallback } from 'react';
import { showError } from '@/utils/toast';

/**
 * Hook para gerar e imprimir conteúdo HTML em uma nova janela.
 * @param contentHtml O HTML completo do conteúdo a ser impresso.
 * @param title O título do documento de impressão.
 * @param orientation Define a orientação da impressão ('portrait' ou 'landscape').
 */
export function usePrint() {
  const printContent = useCallback((contentHtml: string, title: string = 'Documento de Impressão', orientation: 'portrait' | 'landscape' = 'portrait') => {
    try {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        showError('Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-ups está ativo.');
        return;
      }

      // Estilos otimizados para impressão A4
      const printStyles = `
        <style>
          /* Configuração A4 padrão (Retrato) */
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          
          /* Sobrescreve para Paisagem se a classe 'landscape' estiver presente */
          .print-container.landscape {
              width: 297mm; /* Largura A4 em paisagem */
              height: 210mm; /* Altura A4 em paisagem */
          }
          .print-container.landscape @page {
              size: A4 landscape; /* FORÇA MODO PAISAGEM */
          }
          
          body { 
            font-family: Arial, sans-serif; 
            margin: 0; 
            padding: 0; 
            color: #000; 
            font-size: 10pt; 
          }
          h1, h2, h3 { margin-top: 0; page-break-after: avoid; }
          .print-header { 
            border-bottom: 2px solid #000; 
            padding-bottom: 10px; 
            margin-bottom: 15px; 
            page-break-after: avoid;
          }
          .print-section { 
            margin-bottom: 15px; 
            padding: 0; 
            page-break-inside: avoid; 
          }
          .print-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 5px; 
            table-layout: fixed; 
          }
          .print-table th, .print-table td { 
            border: 1px solid #ccc; 
            padding: 4px 8px; 
            text-align: left; 
            font-size: 9pt; 
            word-wrap: break-word; 
            white-space: normal;
            overflow: visible; 
            text-overflow: clip; 
          }
          .print-table th { 
            background-color: #f0f0f0; 
            font-weight: bold;
            white-space: nowrap; 
          }
          
          /* Estilos para a linha de total */
          .print-table tfoot tr, .print-table tbody tr:last-child.total-row {
              font-weight: bold;
              border-top: 2px solid #000;
              background-color: #e0e0e0;
          }

          .print-signatures { 
            display: flex; 
            justify-content: space-around; 
            margin-top: 40px; 
            page-break-before: avoid;
          }
          .print-signature-line { 
            width: 40%; 
            border-top: 1px solid #000; 
            padding-top: 5px; 
            text-align: center; 
            font-size: 9pt; 
          }
          
          /* Regras de quebra de página para tabelas */
          @media print {
            .print-table { page-break-inside: auto; }
            .print-table tr { page-break-inside: avoid; page-break-after: auto; }
            .print-table thead { display: table-header-group; } 
            .no-print { display: none; }
          }
        </style>
      `;
      
      const containerClass = orientation === 'landscape' ? 'print-container landscape' : 'print-container';

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${title}</title>
            ${printStyles}
          </head>
          <body>
            <div class="no-print" style="padding: 20px; text-align: center; background: #ffffe0; border: 1px solid #ccc;">
                <p style="font-size: 14pt; color: #333;">Documento pronto para impressão. Use <strong>Ctrl+P</strong> (ou Cmd+P) para imprimir.</p>
                <button onclick="window.print()" style="padding: 10px 20px; margin-top: 10px; cursor: pointer;">Imprimir Agora</button>
            </div>
            <div class="${containerClass}">
                ${contentHtml}
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      
    } catch (e) {
      console.error('Erro ao imprimir:', e);
      showError('Falha ao iniciar a impressão.');
    }
  }, []);

  return { printContent };
}