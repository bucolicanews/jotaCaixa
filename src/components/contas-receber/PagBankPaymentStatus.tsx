import { Badge } from '@/components/ui/badge';
import type { PagBankChargeStatus } from '@/types/pagbank';

interface PagBankPaymentStatusProps {
  status: PagBankChargeStatus | null;
}

export function PagBankPaymentStatus({ status }: PagBankPaymentStatusProps) {
  if (!status) {
    return null;
  }

  const statusConfig: Record<PagBankChargeStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' }> = {
    WAITING: { label: 'Aguardando', variant: 'warning' },
    PAID: { label: 'Pago', variant: 'success' },
    DECLINED: { label: 'Recusado', variant: 'destructive' },
    CANCELED: { label: 'Cancelado', variant: 'destructive' },
    EXPIRED: { label: 'Expirado', variant: 'secondary' },
  };

  const config = statusConfig[status] || { label: status, variant: 'default' };

  return (
    <Badge variant={config.variant} className="font-normal">
      {config.label}
    </Badge>
  );
}
