export const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export const formatarData = (dateString: string): string => {
    if (!dateString) return 'N/A';
    try {
        // Se for uma string YYYY-MM-DD (sem T e Z), parseISO a trata como UTC, causando o desvio.
        // Para corrigir, adicionamos 'T00:00:00' para forçar a interpretação como data local.
        if (dateString.length === 10 && !dateString.includes('T')) {
            const date = new Date(dateString + 'T00:00:00');
            return date.toLocaleDateString('pt-BR');
        }
        
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    } catch (e) {
        return dateString;
    }
};

/**
 * Converte uma string de data no formato DD/MM/YYYY para o formato ISO YYYY-MM-DD.
 * @param dateString Data no formato DD/MM/YYYY.
 * @returns Data no formato YYYY-MM-DD ou null se inválida.
 */
export const formatDDMMYYYYToISO = (dateString: string): string | null => {
    const parts = dateString.split(/[\/\-]/);
    if (parts.length === 3) {
        const [day, month, year] = parts.map(Number);
        // Verifica se é um formato DD/MM/YYYY válido
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900) {
            // Cria a data no formato YYYY-MM-DD
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }
    return null;
};

/**
 * Normaliza uma string para comparação (lowercase, trim, remove acentos e caracteres especiais).
 */
export const normalizeString = (str: string | null | undefined): string => {
    if (!str) return '';
    
    // 1. Remove acentos e diacríticos
    const normalized = String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // 2. Converte para minúsculas, remove espaços extras e caracteres não alfanuméricos (exceto espaços)
    return normalized.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
};