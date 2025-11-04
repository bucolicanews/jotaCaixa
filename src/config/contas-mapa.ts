// Mapeamento padrão de prefixos de contas contábeis (geralmente 1=Ativo, 2=Passivo, 3=Receita, 4=Despesa)
export const NATUREZA_PREFIXO_MAP: Record<string, string> = {
    'Ativo': '1',
    'Passivo': '2',
    'Receita': '3',
    'Despesa': '4',
};

export type NaturezaContabil = 'Ativo' | 'Passivo' | 'Receita' | 'Despesa';