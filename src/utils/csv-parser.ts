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
      // Removendo o delimitador fixo para que o PapaParse adivinhe automaticamente (vírgula, ponto e vírgula, etc.)
      complete: (results: ParseResult<any>) => {
        // Mapeamento para garantir que os campos esperados existam e estejam no formato correto
        const data = results.data.map((row: any) => ({
          Conta: String(row.Conta || ''),
          'Código reduzido': String(row['Código reduzido'] || ''), // Usando o cabeçalho exato
          Descrição: String(row.Descrição || ''), // Usando o cabeçalho exato
          Analítica: (row.Analítica === 'Sim' ? 'Sim' : 'Não') as 'Sim' | 'Não', // Usando o cabeçalho exato
        })).filter((row: ContaCSV) => row.Conta && row.Descrição); // Filtra linhas sem dados essenciais
        
        resolve(data as ContaCSV[]);
      },
      error: (error: Error) => {
        reject(error);
      },
    });
  });
};