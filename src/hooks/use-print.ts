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

      // Estilos otimizados para impressão A4 em modo PAISAGEM
      const printStyles = `
        <style>
          @page {
            size: A4 landscape; /* FORÇA MODO PAISAGEM */
            margin: 10mm; /* Margens reduzidas para maximizar o espaço */
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
            margin-bottom: 15px; /* Reduzido */
            page-break-after: avoid;
          }
          .print-section { 
            margin-bottom: 15px; /* Reduzido */
            padding: 0; 
            page-break-inside: avoid; 
          }
          .print-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 5px; /* Reduzido */
            table-layout: fixed; 
          }
          .print-table th, .print-table td { 
            border: 1px solid #ccc; 
            padding: 3px 6px; /* REDUZIDO O PADDING PARA CABER MAIS CONTEÚDO */
            text-align: left; 
            font-size: 8pt; /* REDUZIDO O TAMANHO DA FONTE PARA CABER MAIS */
            word-wrap: break-word; 
            white-space: nowrap; /* Tenta evitar quebra de linha na célula */
            overflow: hidden; /* Esconde o que não couber */
            text-overflow: ellipsis; /* Adiciona reticências se o texto for cortado */
          }
          .print-table th { 
            background-color: #f0f0f0; 
            font-weight: bold;
            white-space: nowrap; /* Garante que o cabeçalho não quebre */
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
            ${contentHtml}
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