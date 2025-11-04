import Papa, { ParseResult } from 'papaparse';
import { ContaCSV, ContaJSON } from '@/types/plano-contas';

type ParsedData = ContaCSV[] | ContaJSON[] | any[]; // Adicionando 'any[]' para extrato bancário

/**
 * Faz o parse de um arquivo CSV.
 */
const parseCSV = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false, // Manter como string para manipulação de valor
      // PapaParse adivinha o delimitador
      complete: (results: ParseResult<any>) => {
        // Retorna os dados brutos para que o Conciliacao.tsx possa mapear
        resolve(results.data.filter(row => Object.values(row).some(val => val !== null && val !== '')));
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
        
        // Validação básica e mapeamento (mantendo a lógica de Plano de Contas)
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
 * @param file O arquivo a ser parseado.
 * @param isExtrato Indica se o arquivo é um extrato bancário (retorna dados brutos)
 */
export const parseFile = async (file: File, isExtrato: boolean = false): Promise<ParsedData> => {
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.csv')) {
        return parseCSV(file);
    } else if (fileName.endsWith('.json') && !isExtrato) {
        // JSON é usado apenas para Plano de Contas por enquanto
        return parseJSON(file);
    } else if (fileName.endsWith('.json') && isExtrato) {
        throw new Error('Importação de extrato JSON ainda não suportada. Use CSV.');
    } else {
        throw new Error('Formato de arquivo não suportado. Use .csv ou .json.');
    }
};