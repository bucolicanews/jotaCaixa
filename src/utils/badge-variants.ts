// Definindo um tipo base para status que pode ser usado em ContasPagar e Parcelas
type StatusType = 'pendente' | 'pago' | 'atrasado' | 'cancelado' | 'cancelada' | 'aberta' | 'parcial' | 'reprogramada' | 'paga';
type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';

export const getBadgeVariant = (status: StatusType, dataVencimento: string): BadgeVariant => {
    if (status === 'paga' || status === 'parcial' || status === 'pago') return 'success';
    if (status === 'cancelada' || status === 'cancelado') return 'destructive';
    
    const today = new Date();
    const vencimento = new Date(dataVencimento);
    
    if (vencimento < today) {
        return 'destructive'; // Atrasado
    }
    
    return 'warning'; // Pendente/Aberta/Reprogramada
};