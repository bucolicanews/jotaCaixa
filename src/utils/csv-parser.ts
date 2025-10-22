import Papa, { ParseResult, ParseError } from 'papaparse';
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
        // O PapaParse pode retornar strings vazias ou nulls, garantimos que o tipo seja o esperado
        const data = results.data.map((row: any) => ({
          Conta: String(row.Conta || ''),
          Analítica: (row.Analítica === 'Sim' ? 'Sim' : 'Não') as 'Sim' | 'Não',
          'C.R.': String(row['C.R.'] || ''),
          Descrição: String(row.Descrição || ''),
          'SPED ECD/ECF': (row['SPED ECD/ECF'] === 'Sim' ? 'Sim' : 'Não') as 'Sim' | 'Não',
        })).filter((row: ContaCSV) => row.Conta && row.Descrição); // Filtra linhas sem dados essenciais
        
        resolve(data as ContaCSV[]);
      },
      error: (error: ParseError) => {
        reject(error);
      },
    });
  });
};