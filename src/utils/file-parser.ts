import Papa, { ParseResult } from 'papaparse';
import { ContaCSV, ContaJSON } from '@/types/plano-contas';
import { HistoricoCSV } from '@/types/historico'; // Importando HistoricoCSV

type ParsedData = ContaCSV[] | ContaJSON[] | HistoricoCSV[];

/**
 * Faz o parse de um arquivo CSV.
 */
const parseCSV = (file: File): Promise<ParsedData> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      // PapaParse adivinha o delimitador
      complete: (results: ParseResult<any>) => {
        const headers = results.meta.fields || [];
        
        // Verifica se é Plano de Contas
        if (headers.includes('Conta') && headers.includes('Analítica')) {
            const data = results.data.map((row: any) => ({
              Conta: String(row.Conta || ''),
              'Código reduzido': String(row['Código reduzido'] || ''),
              Descrição: String(row.Descrição || ''),
              Analítica: (row.Analítica === 'Sim' ? 'Sim' : 'Não') as 'Sim' | 'Não',
            })).filter((row: ContaCSV) => row.Conta && row.Descrição);
            return resolve(data as ContaCSV[]);
        }
        
        // Verifica se é Histórico (procura por 'Descrição' ou 'Descricao')
        const descKey = headers.find(h => h.toLowerCase().includes('descri')) || 'Descrição';
        
        if (descKey) {
            const data = results.data.map((row: any) => ({
                Descricao: String(row[descKey] || ''), // Mapeia para a chave sem acento
            })).filter((row: HistoricoCSV) => row.Descricao);
            return resolve(data as HistoricoCSV[]);
        }
        
        // Se não for nenhum dos formatos esperados
        reject(new Error('Formato de arquivo CSV não reconhecido.'));
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
const parseJSON = (file: File): Promise<ParsedData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const json = JSON.parse(content);
        
        if (!Array.isArray(json)) {
            throw new Error('O arquivo JSON deve conter um array de objetos.');
        }
        
        // Tenta determinar o tipo de dados
        const firstRow = json[0];
        
        if (firstRow && 'Conta' in firstRow && 'Analítica' in firstRow) {
            // Plano de Contas JSON
            const data = json.map((row: any) => ({
                Conta: String(row.Conta || ''),
                'Código reduzido': String(row['Código reduzido'] || ''),
                Descrição: String(row.Descrição || ''),
                Analítica: (row.Analítica === 'Sim' ? 'Sim' : 'Não') as 'Sim' | 'Não',
            })).filter((row: ContaJSON) => row.Conta && row.Descrição);
            return resolve(data as ContaJSON[]);
        }
        
        if (firstRow && ('Descricao' in firstRow || 'Descrição' in firstRow)) {
            // Histórico JSON
            const data = json.map((row: any) => ({
                Descricao: String(row.Descricao || row.Descrição || ''),
            })).filter((row: HistoricoCSV) => row.Descricao);
            return resolve(data as HistoricoCSV[]);
        }
        
        reject(new Error('Formato de arquivo JSON não reconhecido.'));
        
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