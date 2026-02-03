import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface AditivosContratoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contaReceberId: string | null
}

export function AditivosContratoDialog({
  open,
  onOpenChange,
  contaReceberId,
}: AditivosContratoDialogProps) {
  console.log('DIALOG OPEN:', open, contaReceberId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl z-[9999]"
      >
        <DialogHeader>
          <DialogTitle>Aditivos do Contrato</DialogTitle>
        </DialogHeader>

        <div className="text-sm">
          Conta Receber ID:
          <pre className="mt-2 p-2 bg-muted rounded">
            {contaReceberId}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  )
}
