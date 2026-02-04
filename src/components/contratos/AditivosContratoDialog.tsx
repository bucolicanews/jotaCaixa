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
import { ContratoGerado } from '@/types/contratos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSessao } from '@/hooks/use-sessao'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { showError, showSuccess } from '@/utils/toast'

interface AditivosContratoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contaReceberId: string | null
  contrato: ContratoGerado | null
}

export function AditivosContratoDialog({
  open,
  onOpenChange,
  contaReceberId,
  contrato,
}: AditivosContratoDialogProps) {
  const [parcelas, setParcelas] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [effectiveCRId, setEffectiveCRId] = useState<string | null>(null)

  // Estados do Formulário de Aditivo
  const [selectedParcelas, setSelectedParcelas] = useState<string[]>([])
  const [tipoAditivo, setTipoAditivo] = useState<'acrescimo' | 'reducao'>('acrescimo')
  const [valorAjuste, setValorAjuste] = useState('')
  const [modoDistribuicao, setModoDistribuicao] = useState<'proporcional' | 'fixo'>('proporcional')
  const [motivo, setMotivo] = useState('')
  const [observacao, setObservacao] = useState('')
  const { usuario } = useSessao()
  const [isSaving, setIsSaving] = useState(false)

  const handleParcelaSelect = (parcelaId: string) => {
    setSelectedParcelas((prev) =>
      prev.includes(parcelaId)
        ? prev.filter((id) => id !== parcelaId)
        : [...prev, parcelaId],
    )
  }

  const resetFormState = () => {
    setSelectedParcelas([])
    setTipoAditivo('acrescimo')
    setValorAjuste('')
    setModoDistribuicao('proporcional')
    setMotivo('')
    setObservacao('')
    setIsSaving(false)
  }

  // Efeito 1: Determinar o ID da conta a receber e resetar estados
  useEffect(() => {
    if (open) {
      setParcelas([])
      setLoading(true)
      setError(null)
      setEffectiveCRId(null)
      resetFormState()

      if (contaReceberId) {
        setEffectiveCRId(contaReceberId)
      } else if (contrato?.id) {
        const findContaReceberId = async () => {
          const { data, error: fetchError } = await supabase
            .from('admin_contas_receber')
            .select('id')
            .eq('contrato_gerado_id', contrato.id)
            .maybeSingle()

          if (fetchError || !data?.id) {
            setError('ID do registro financeiro não encontrado para este contrato.')
            setLoading(false)
          } else {
            setEffectiveCRId(data.id)
          }
        }
        findContaReceberId()
      } else {
        setError('Dados do contrato insuficientes para buscar o registro financeiro.')
        setLoading(false)
      }
    }
  }, [open, contaReceberId, contrato])

  // Efeito 2: Buscar parcelas
  useEffect(() => {
    if (effectiveCRId && open) {
      const fetchParcelas = async () => {
        setLoading(true)
        const { data, error: parcelasError } = await supabase
          .from('admin_parcelas_receber')
          .select('*')
          .eq('conta_receber_id', effectiveCRId)
          .neq('status', 'paga')
          .order('numero_parcela', { ascending: true })

        if (parcelasError) {
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
  }, [effectiveCRId, open])

  const handleSaveAditivo = async () => {
    if (!canSubmit) {
      showError('Preencha todos os campos obrigatórios.')
      return
    }
    setIsSaving(true)

    const adminId = usuario?.id
    if (!adminId) {
      showError('Não foi possível identificar o usuário administrador.')
      setIsSaving(false)
      return
    }

    const valorAjusteNum = parseFloat(valorAjuste)
    const parcelasAfetadas = parcelas.filter(p => selectedParcelas.includes(p.id))
    const valorContratoAnterior = parcelas.reduce((sum, p) => sum + p.valor, 0)

    let parcelasAtualizadas: { id: string, novo_valor: number }[] = []

    if (modoDistribuicao === 'fixo') {
      const ajustePorParcela = valorAjusteNum / parcelasAfetadas.length
      parcelasAfetadas.forEach(p => {
        const novoValor = tipoAditivo === 'acrescimo' ? p.valor + ajustePorParcela : p.valor - ajustePorParcela
        parcelasAtualizadas.push({ id: p.id, novo_valor: Math.max(0, novoValor) })
      })
    } else { // Proporcional
      const valorTotalAfetado = parcelasAfetadas.reduce((sum, p) => sum + p.valor, 0)
      if (valorTotalAfetado === 0) {
        showError('Não é possível aplicar ajuste proporcional a parcelas com valor total zero.')
        setIsSaving(false)
        return
      }
      parcelasAfetadas.forEach(p => {
        const proporcao = p.valor / valorTotalAfetado
        const ajusteDaParcela = valorAjusteNum * proporcao
        const novoValor = tipoAditivo === 'acrescimo' ? p.valor + ajusteDaParcela : p.valor - ajusteDaParcela
        parcelasAtualizadas.push({ id: p.id, novo_valor: Math.max(0, novoValor) })
      })
    }
    
    const valorContratoNovo = valorContratoAnterior + (tipoAditivo === 'acrescimo' ? valorAjusteNum : -valorAjusteNum)

    const aditivoData = {
      conta_receber_id: effectiveCRId,
      admin_id: adminId,
      tipo_aditivo: tipoAditivo,
      valor_ajuste: valorAjusteNum,
      modo_distribuicao: modoDistribuicao,
      motivo: motivo,
      observacao: observacao,
      valor_contrato_anterior: valorContratoAnterior,
      valor_contrato_novo: valorContratoNovo,
      quantidade_parcelas_afetadas: parcelasAfetadas.length,
      status: 'ativo'
    }

    const { error: functionError } = await supabase.functions.invoke('criar-aditivo-contratual', {
      body: {
        p_aditivo_data: aditivoData,
        p_parcelas_updates: parcelasAtualizadas,
      },
    })

    if (functionError) {
      console.error('Erro ao criar aditivo contratual:', functionError)
      showError(`Falha ao salvar aditivo: ${functionError.message}`)
    } else {
      showSuccess('Aditivo contratual salvo com sucesso! As parcelas foram atualizadas.')
      onOpenChange(false) // Fecha o dialog
    }

    setIsSaving(false)
  }

  const canSubmit = selectedParcelas.length > 0 && parseFloat(valorAjuste) > 0 && motivo.trim() !== ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl z-[9999]">
        <DialogHeader>
          <DialogTitle>Criar Aditivo do Contrato</DialogTitle>
          <DialogDescription>
            Selecione as parcelas que sofrerão alteração de valor ou
            vencimento. As parcelas já pagas não são exibidas.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Coluna da Esquerda: Parcelas */}
          <div>
            <h3 className="mb-4 text-lg font-medium">Parcelas em Aberto</h3>
            {loading && (
              <div className="flex justify-center items-center h-24">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            )}

            {error && (
              <div className="text-red-500 bg-red-100 p-3 rounded-md">
                <p className="font-bold">Erro:</p>
                {error}
              </div>
            )}

            {!loading && !error && parcelas.length > 0 && (
              <div className="space-y-2 max-h-96 overflow-y-auto border rounded-md p-2">
                {parcelas.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-muted"
                  >
                    <label
                      htmlFor={`parcela-${p.id}`}
                      className="flex items-center gap-3 w-full cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        id={`parcela-${p.id}`}
                        checked={selectedParcelas.includes(p.id)}
                        onChange={() => handleParcelaSelect(p.id)}
                      />
                      <div className="flex justify-between w-full">
                        <span>
                          Parcela {p.numero_parcela} - Venc:{' '}
                          {new Date(p.data_vencimento).toLocaleDateString('pt-BR')}
                        </span>
                        <span className='font-bold'>
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.valor)}
                        </span>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Coluna da Direita: Formulário do Aditivo */}
          <div>
            <h3 className="mb-4 text-lg font-medium">Dados do Aditivo</h3>
            <div className="space-y-4">
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <Label htmlFor="tipoAditivo">Tipo de Aditivo</Label>
                  <Select value={tipoAditivo} onValueChange={(v: any) => setTipoAditivo(v)}>
                    <SelectTrigger id="tipoAditivo">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="acrescimo">Acréscimo</SelectItem>
                      <SelectItem value="reducao">Redução</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="valorAjuste">Valor do Ajuste (R$)</Label>
                  <Input
                    id="valorAjuste"
                    type="number"
                    placeholder="100.00"
                    value={valorAjuste}
                    onChange={(e) => setValorAjuste(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="modoDistribuicao">Modo de Distribuição</Label>
                <Select value={modoDistribuicao} onValueChange={(v: any) => setModoDistribuicao(v)}>
                  <SelectTrigger id="modoDistribuicao">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proporcional">Proporcional ao valor da parcela</SelectItem>
                    <SelectItem value="fixo">Valor fixo dividido igualmente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="motivo">Motivo</Label>
                <Input
                  id="motivo"
                  placeholder="Ex: Adição de novo serviço"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="observacao">Observação</Label>
                <Textarea
                  id="observacao"
                  placeholder="Detalhes adicionais sobre o aditivo (opcional)"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </div>

              <div className='pt-4 border-t'>
                <Button onClick={handleSaveAditivo} disabled={!canSubmit || isSaving} className="w-full">
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Salvar Aditivo'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

