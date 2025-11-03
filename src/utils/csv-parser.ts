import Papa, { ParseResult } from 'papaparse';
import { ContaCSV } from '@/types/plano-contas';

/**
 * Faz o parse de um arquivo CSV para um array de objetos.
 * @param file O arquivo CSV a ser processado.
 * @returns Uma Promise que resolve para um array de objetos ContaCSV.
 */
export const parseCSV = (file: File): Promise<ContaCSV[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results: ParseResult<any>) => {
        // Mapeamento para garantir que os campos esperados existam e estejam no formato correto
        const data = results.data.map((row: any) => ({
          Conta: String(row.Conta || ''),
          'Código Reduzido': String(row['Código Reduzido'] || ''), // Novo campo
          Descrição: String(row.Descrição || ''),
          Analítica: (row.Analítica === 'Sim' ? 'Sim' : 'Não') as 'Sim' | 'Não',
        })).filter((row: ContaCSV) => row.Conta && row.Descrição); // Filtra linhas sem dados essenciais
        
        resolve(data as ContaCSV[]);
      },
      error: (error: Error) => {
        reject(error);
      },
    });
  });
};