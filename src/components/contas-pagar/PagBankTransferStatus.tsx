import { Badge } from "@/components/ui/badge";

interface PagBankTransferStatusProps {
  status: string;
}

export function PagBankTransferStatus({ status }: PagBankTransferStatusProps) {
  const statusConfig = {
    PENDING: {
      label: "Pendente",
      variant: "warning" as const,
    },
    PROCESSING: {
      label: "Processando",
      variant: "default" as const,
    },
    COMPLETED: {
      label: "Concluído",
      variant: "success" as const,
    },
    FAILED: {
      label: "Falhou",
      variant: "destructive" as const,
    },
    CANCELED: {
      label: "Cancelado",
      variant: "secondary" as const,
    },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || {
    label: status,
    variant: "secondary" as const,
  };

  return (
    <Badge variant={config.variant} className="whitespace-nowrap">
      {config.label}
    </Badge>
  );
}
