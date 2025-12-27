import Papa, { ParseResult } from 'papaparse';
import { ContaCSV, ContaJSON } from '@/types/plano-contas';
import { HistoricoCSV } from '@/types/historico';

type ParsedData = ContaCSV[] | ContaJSON[] | HistoricoCSV[];

// Função robusta para converter diversos formatos de entrada em booleano real
const toBoolean = (value: any): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    
    const strValue = String(value).toUpperCase().trim();
    return ['TRUE', 'SIM', '1', 'S', 'YES', 'Y', 'VERDADEIRO', 'X'].includes(strValue);
};

// Função auxiliar para encontrar valor ignorando case e acentos nas chaves
const getValueFuzzy = (row: any, keysToCheck: string[]) => {
    const rowKeys = Object.keys(row);
    const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    
    for (const key of keysToCheck) {
        const normalizedKey = normalize(key);
        // Tenta match exato primeiro
        if (row[key] !== undefined) return row[key];
        
        // Tenta encontrar uma chave no objeto que corresponda à normalizada
        const foundKey = rowKeys.find(k => normalize(k) === normalizedKey);
        if (foundKey && row[foundKey] !== undefined) return row[foundKey];
    }
    return undefined;
};

/**
 * Faz o parse de um arquivo CSV.
 */
const parseCSV = (file: File): Promise<ParsedData> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy', // Remove linhas totalmente vazias
      dynamicTyping: true,
      encoding: "UTF-8", // Tenta UTF-8
      complete: (results: ParseResult<any>) => {
        const headers = results.meta.fields || [];
        const normalizedHeaders = headers.map(h => h.toLowerCase());
        
        const hasConta = normalizedHeaders.some(h => h.includes('conta'));
        const hasDescricao = normalizedHeaders.some(h => h.includes('descri'));
        const hasAnalitica = normalizedHeaders.some(h => h.includes('analitica'));

        // Validação mínima: Precisa ter Conta e Descrição
        if (hasConta && hasDescricao) {
            const data = results.data.map((row: any) => {
              const contaCodigo = String(getValueFuzzy(row, ['Conta', 'Código', 'Codigo']) || '').trim();
              const analiticaRaw = String(getValueFuzzy(row, ['Analítica', 'Analitica', 'Tipo']) || '').trim();
              
              // Normaliza Sim/Não
              const isAnalitica = ['sim', 's', 'yes', 'y', 'analitica', 'analítica'].includes(analiticaRaw.toLowerCase()) ? 'Sim' : 'Não';

              return {
                Conta: contaCodigo,
                'Código reduzido': String(getValueFuzzy(row, ['Código reduzido', 'Codigo reduzido', 'Reduzido']) || '').trim(),
                Descrição: String(getValueFuzzy(row, ['Descrição', 'Descricao', 'Nome']) || '').trim(),
                Analítica: isAnalitica,
                
                // Flags Booleanas - Busca flexível
                is_conta_caixa_banco: toBoolean(getValueFuzzy(row, ['is_conta_caixa_banco', 'caixa_banco'])),
                is_conta_patrimonial: toBoolean(getValueFuzzy(row, ['is_conta_patrimonial', 'patrimonial'])),
                is_conta_resultado: toBoolean(getValueFuzzy(row, ['is_conta_resultado', 'resultado'])),
                is_caixa: toBoolean(getValueFuzzy(row, ['is_caixa', 'caixa'])),
                is_banco: toBoolean(getValueFuzzy(row, ['is_banco', 'banco'])),
                is_a_receber: toBoolean(getValueFuzzy(row, ['is_a_receber', 'a_receber', 'receber'])),
                is_a_pagar: toBoolean(getValueFuzzy(row, ['is_a_pagar', 'a_pagar', 'pagar'])),
              };
            }).filter((row: any) => row.Conta && row.Descrição); // Filtra linhas inválidas
            
            return resolve(data as ContaCSV[]);
        }
        
        // Verifica se é Histórico (Código + Descrição)
        const codigoKey = headers.find(h => h.toLowerCase().includes('código') || h.toLowerCase().includes('codigo'));
        
        if (hasDescricao && codigoKey) {
            const data = results.data.map((row: any) => ({
                Descricao: String(getValueFuzzy(row, ['Descrição', 'Descricao']) || '').trim(),
                Código: String(getValueFuzzy(row, ['Código', 'Codigo', 'id']) || '').trim(),
            })).filter((row: HistoricoCSV) => row.Descricao);
            return resolve(data as HistoricoCSV[]);
        }
        
        reject(new Error('Formato de arquivo CSV não reconhecido. Certifique-se de que as colunas "Conta" e "Descrição" existem.'));
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
        
        const firstRow = json[0] || {};
        
        if (getValueFuzzy(firstRow, ['Conta']) && getValueFuzzy(firstRow, ['Descricao', 'Descrição'])) {
            const data = json.map((row: any) => ({
                Conta: String(getValueFuzzy(row, ['Conta']) || '').trim(),
                'Código reduzido': String(getValueFuzzy(row, ['Código reduzido', 'Codigo reduzido', 'Reduzido']) || '').trim(),
                Descrição: String(getValueFuzzy(row, ['Descrição', 'Descricao', 'Nome']) || '').trim(),
                Analítica: (toBoolean(getValueFuzzy(row, ['Analítica', 'Analitica'])) || String(getValueFuzzy(row, ['Analítica', 'Analitica'])).toLowerCase() === 'sim') ? 'Sim' : 'Não',
                
                is_conta_caixa_banco: toBoolean(getValueFuzzy(row, ['is_conta_caixa_banco'])),
                is_conta_patrimonial: toBoolean(getValueFuzzy(row, ['is_conta_patrimonial'])),
                is_conta_resultado: toBoolean(getValueFuzzy(row, ['is_conta_resultado'])),
                is_caixa: toBoolean(getValueFuzzy(row, ['is_caixa'])),
                is_banco: toBoolean(getValueFuzzy(row, ['is_banco'])),
                is_a_receber: toBoolean(getValueFuzzy(row, ['is_a_receber'])),
                is_a_pagar: toBoolean(getValueFuzzy(row, ['is_a_pagar'])),
            })).filter((row: any) => row.Conta && row.Descrição);
            return resolve(data as ContaJSON[]);
        }
        
        if (getValueFuzzy(firstRow, ['Descricao', 'Descrição'])) {
            const data = json.map((row: any) => ({
                Descricao: String(getValueFuzzy(row, ['Descricao', 'Descrição']) || '').trim(),
                Código: String(getValueFuzzy(row, ['Código', 'Codigo']) || '').trim(),
            })).filter((row: HistoricoCSV) => row.Descricao);
            return resolve(data as HistoricoCSV[]);
        }
        
        reject(new Error('JSON inválido: Campos obrigatórios (Conta/Descrição) não encontrados.'));
        
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