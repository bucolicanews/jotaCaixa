import Papa, { ParseResult } from 'papaparse';
import { ContaCSV, ContaJSON } from '@/types/plano-contas';

type ParsedData = ContaCSV[] | ContaJSON[];

/**
 * Faz o parse de um arquivo CSV.
 */
const parseCSV = (file: File): Promise<ContaCSV[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      // PapaParse adivinha o delimitador
      complete: (results: ParseResult<any>) => {
        const data = results.data.map((row: any) => ({
          Conta: String(row.Conta || ''),
          'Código reduzido': String(row['Código reduzido'] || ''),
          Descrição: String(row.Descrição || ''),
          Analítica: (row.Analítica === 'Sim' ? 'Sim' : 'Não') as 'Sim' | 'Não',
        })).filter((row: ContaCSV) => row.Conta && row.Descrição);
        
        resolve(data as ContaCSV[]);
      },
      error: (error: Error) => {
        reject(error);
      },
    });
  });
};

/**
 * Faz o parse de um arquivo JSON.
 */
const parseJSON = (file: File): Promise<ContaJSON[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const json = JSON.parse(content);
        
        if (!Array.isArray(json)) {
            throw new Error('O arquivo JSON deve conter um array de contas.');
        }
        
        // Validação básica e mapeamento
        const data = json.map((row: any) => ({
            Conta: String(row.Conta || ''),
            'Código reduzido': String(row['Código reduzido'] || ''),
            Descrição: String(row.Descrição || ''),
            Analítica: (row.Analítica === 'Sim' ? 'Sim' : 'Não') as 'Sim' | 'Não',
        })).filter((row: ContaJSON) => row.Conta && row.Descrição);
        
        resolve(data);
      } catch (error) {
        reject(new Error('Erro ao processar arquivo JSON: ' + (error as Error).message));
      }
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo JSON.'));
    reader.readAsText(file);
  });
};

/**
 * Função principal para parsear arquivos CSV ou JSON.
 */
export const parseFile = async (file: File): Promise<ParsedData> => {
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.csv')) {
        return parseCSV(file);
    } else if (fileName.endsWith('.json')) {
        return parseJSON(file);
    } else {
        throw new Error('Formato de arquivo não suportado. Use .csv ou .json.');
    }
};