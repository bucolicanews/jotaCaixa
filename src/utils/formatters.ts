// src/utils/formatters.ts

export const formatCurrency = (value: number | null | undefined, currency: string = 'BRL'): string => {
    if (value === null || value === undefined) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: currency,
    }).format(value);
};

export const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        // Adiciona 3 horas para compensar o fuso horário se a string for ISO sem fuso
        if (dateString.includes('T00:00:00.000Z')) {
            date.setHours(date.getHours() + 3);
        }
        return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    } catch (e) {
        return dateString;
    }
};

export const formatDateTime = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch (e) {
        return dateString;
    }
};