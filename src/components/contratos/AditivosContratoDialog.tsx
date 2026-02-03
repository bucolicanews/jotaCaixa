import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Loader2 } from 'lucide-react'
import { Badge } from '../ui/badge'

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
  const [parcelas, setParcelas] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Reseta o estado ao abrir o diálogo
    if (open) {
      setParcelas([])
      setLoading(true)
      setError(null)

      if (!contaReceberId) {
        console.error(
          '[Aditivo Error] ID da Conta a Receber não fornecido. Não é possível buscar parcelas.',
        )
        setError('ID do registro financeiro não encontrado para este contrato.')
        setLoading(false)
        return
      }

      const fetchParcelas = async () => {
        const { data, error } = await supabase
          .from('admin_parcelas_receber')
          .select('*')
          .eq('conta_receber_id', contaReceberId)
          .neq('status', 'paga') // Garante que parcelas pagas não sejam selecionadas
          .order('numero_parcela', { ascending: true })

        if (error) {
          console.error('Erro ao buscar parcelas:', error)
          setError('Não foi possível carregar as parcelas do contrato.')
        } else {
          if (data.length === 0) {
            setError('Nenhuma parcela em aberto encontrada para este contrato.')
          }
          setParcelas(data)
        }
        setLoading(false)
      }

      fetchParcelas()
    }
  }, [open, contaReceberId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl z-[9999]">
        <DialogHeader>
          <DialogTitle>Criar Aditivo do Contrato</DialogTitle>
          <DialogDescription>
            Selecione as parcelas que sofrerão alteração de valor ou
            vencimento. As parcelas já pagas não são exibidas.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <h3 className="mb-4 text-lg font-medium">
            Parcelas em Aberto
          </h3>
          {loading && (
            <div className="flex justify-center items-center h-24">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
          
          {error && (
            <div className="text-red-500 bg-red-100 p-3 rounded-md">
              <p className='font-bold'>Erro Crítico:</p>
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {parcelas.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2 border rounded-md">
                  <label htmlFor={`parcela-${p.id}`} className="flex items-center gap-3">
                    <input type="checkbox" id={`parcela-${p.id}`} />
                    <span>
                      Parcela {p.numero_parcela} - Venc: {new Date(p.data_vencimento).toLocaleDateString('pt-BR')}
                    </span>
                  </label>
                  <Badge variant={p.status === 'aberta' ? 'default' : 'secondary'}>{p.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
