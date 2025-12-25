import Papa, { ParseResult } from 'papaparse';
import { ContaCSV, ContaJSON } from '@/types/plano-contas';
import { HistoricoCSV } from '@/types/historico';

type ParsedData = ContaCSV[] | ContaJSON[] | HistoricoCSV[];

// Função robusta para converter diversos formatos de entrada em booleano real
// Aceita: true, "true", "Sim", "1", "S", "Y", "Yes"
const toBoolean = (value: any): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    
    const strValue = String(value).toUpperCase().trim();
    return ['TRUE', 'SIM', '1', 'S', 'YES', 'Y', 'VERDADEIRO'].includes(strValue);
};

/**
 * Faz o parse de um arquivo CSV.
 */
const parseCSV = (file: File): Promise<ParsedData> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      encoding: "UTF-8",
      complete: (results: ParseResult<any>) => {
        const headers = results.meta.fields || [];
        
        const hasConta = headers.some(h => h.toLowerCase() === 'conta');
        const hasAnalitica = headers.some(h => h.toLowerCase().includes('analitica') || h.toLowerCase().includes('analítica'));

        if (hasConta && hasAnalitica) {
            const data = results.data.map((row: any) => {
              const getVal = (keys: string[]) => {
                  const foundKey = keys.find(k => row[k] !== undefined);
                  return foundKey ? row[foundKey] : undefined;
              };

              const contaCodigo = String(getVal(['Conta', 'conta']) || '').trim();
              const analitica = (String(getVal(['Analítica', 'Analitica', 'analitica']) || '').trim().toLowerCase() === 'sim' ? 'Sim' : 'Não') as 'Sim' | 'Não';

              return {
                Conta: contaCodigo,
                'Código reduzido': String(getVal(['Código reduzido', 'Codigo reduzido', 'codigo_reduzido', 'Reduzido']) || '').trim(),
                Descrição: String(getVal(['Descrição', 'Descricao', 'descricao']) || '').trim(),
                Analítica: analitica,
                // Flags Booleanas - Conversão Robusta
                is_conta_caixa_banco: toBoolean(getVal(['is_conta_caixa_banco'])),
                is_conta_patrimonial: toBoolean(getVal(['is_conta_patrimonial'])),
                is_conta_resultado: toBoolean(getVal(['is_conta_resultado'])),
                is_caixa: toBoolean(getVal(['is_caixa'])),
                is_banco: toBoolean(getVal(['is_banco'])),
                is_a_receber: toBoolean(getVal(['is_a_receber'])),
                is_a_pagar: toBoolean(getVal(['is_a_pagar'])),
              };
            }).filter((row: any) => row.Conta && row.Descrição);
            
            return resolve(data as ContaCSV[]);
        }
        
        // Verifica se é Histórico
        const descKey = headers.find(h => h.toLowerCase().includes('descri')) || 'Descrição';
        const codigoKey = headers.find(h => h.toLowerCase().includes('código') || h.toLowerCase().includes('codigo')) || 'Código';
        
        if (descKey) {
            const data = results.data.map((row: any) => ({
                Descricao: String(row[descKey] || '').trim(),
                Código: String(row[codigoKey] || '').trim(),
            })).filter((row: HistoricoCSV) => row.Descricao);
            return resolve(data as HistoricoCSV[]);
        }
        
        reject(new Error('Formato de arquivo CSV não reconhecido. Certifique-se de usar ponto e vírgula ou vírgula como delimitador.'));
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
        
        const firstRow = json[0];
        
        if (firstRow && ('Conta' in firstRow || 'conta' in firstRow)) {
            const data = json.map((row: any) => ({
                Conta: String(row.Conta || row.conta || '').trim(),
                'Código reduzido': String(row['Código reduzido'] || row.codigo_reduzido || '').trim(),
                Descrição: String(row.Descrição || row.Descricao || row.descricao || '').trim(),
                Analítica: (row.Analítica === 'Sim' || row.Analitica === 'Sim' || row.analitica === 'Sim' ? 'Sim' : 'Não') as 'Sim' | 'Não',
                is_conta_caixa_banco: toBoolean(row.is_conta_caixa_banco),
                is_conta_patrimonial: toBoolean(row.is_conta_patrimonial),
                is_conta_resultado: toBoolean(row.is_conta_resultado),
                is_caixa: toBoolean(row.is_caixa),
                is_banco: toBoolean(row.is_banco),
                is_a_receber: toBoolean(row.is_a_receber),
                is_a_pagar: toBoolean(row.is_a_pagar),
            })).filter((row: any) => row.Conta && row.Descrição);
            return resolve(data as ContaJSON[]);
        }
        
        if (firstRow && ('Descricao' in firstRow || 'Descrição' in firstRow || 'descricao' in firstRow)) {
            const data = json.map((row: any) => ({
                Descricao: String(row.Descricao || row.Descrição || row.descricao || '').trim(),
                Código: String(row.Código || row.Código || row.codigo || '').trim(),
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