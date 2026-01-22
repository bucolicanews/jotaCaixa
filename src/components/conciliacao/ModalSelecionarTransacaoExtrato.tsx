import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Calendar, DollarSign, User, FileText, Loader2 } from 'lucide-react';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { TransacaoExtratoCandidata } from '@/hooks/conciliacao/useMapeamentoInverso';
import { useState } from 'react';

interface ModalSelecionarTransacaoExtratoProps {
  open: boolean;
  onClose: () => void;
  transacoes: TransacaoExtratoCandidata[];
  parcelaValor: number;
  parcelaVencimento: string;
  parcelaNome: string;
  loading: boolean;
  onConfirmar: (transacaoId: string) => Promise<void>;
}

export default function ModalSelecionarTransacaoExtrato({
  open,
  onClose,
  transacoes,
  parcelaValor,
  parcelaVencimento,
  parcelaNome,
  loading,
  onConfirmar
}: ModalSelecionarTransacaoExtratoProps) {
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const handleConfirmar = async () => {
    if (!selecionado) return;
    
    setConfirmando(true);
    try {
      await onConfirmar(selecionado);
      setSelecionado(null);
    } finally {
      setConfirmando(false);
    }
  };

  const handleClose = () => {
    setSelecionado(null);
    onClose();
  };

  const getBadgeVariant = (compatibilidade: string) => {
    switch (compatibilidade) {
      case 'alta': return 'success';
      case 'media': return 'warning';
      case 'baixa': return 'destructive';
      default: return 'secondary';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Selecionar Transação do Extrato</DialogTitle>
          <DialogDescription>
            Escolha qual transação do extrato bancário corresponde a esta parcela
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/50 p-4 rounded-lg mb-4">
          <h4 className="font-semibold mb-2">Parcela Selecionada:</h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{parcelaNome}</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{formatCurrency(parcelaValor)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{formatarData(parcelaVencimento)}</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : transacoes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma transação de extrato disponível</p>
            <p className="text-sm mt-1">Importe um extrato bancário primeiro</p>
          </div>
        ) : (
          <>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {transacoes.map((transacao) => (
                  <div
                    key={transacao.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-all hover:border-primary ${
                      selecionado === transacao.id ? 'border-primary bg-primary/5 ring-2 ring-primary' : ''
                    }`}
                    onClick={() => setSelecionado(transacao.id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {transacao.compatibilidade === 'alta' && (
                          <Sparkles className="w-4 h-4 text-yellow-500" />
                        )}
                        <Badge variant={getBadgeVariant(transacao.compatibilidade)}>
                          {transacao.compatibilidade === 'alta' ? 'Alta' : 
                           transacao.compatibilidade === 'media' ? 'Média' : 'Baixa'} Compatibilidade
                          {transacao.similaridade_nome !== undefined && transacao.similaridade_nome > 0 && (
                            <span className="ml-1">• {transacao.similaridade_nome.toFixed(0)}% nome</span>
                          )}
                        </Badge>
                        <input
                          type="radio"
                          checked={selecionado === transacao.id}
                          onChange={() => setSelecionado(transacao.id)}
                          className="ml-2"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <span className={`text-lg font-bold ${
                        transacao.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(transacao.valor)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Data:</span>
                        <span className="ml-2 font-medium">{formatarData(transacao.data)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tipo:</span>
                        <span className="ml-2 font-medium">{transacao.tipo}</span>
                      </div>
                      {transacao.identificacao && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Identificação:</span>
                          <span className="ml-2 font-medium">{transacao.identificacao}</span>
                        </div>
                      )}
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Descrição:</span>
                        <span className="ml-2">{transacao.descricao}</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground">
                        {transacao.motivo_compatibilidade}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={handleClose} disabled={confirmando}>
                Cancelar
              </Button>
              <Button 
                onClick={handleConfirmar} 
                disabled={!selecionado || confirmando}
              >
                {confirmando ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Confirmando...
                  </>
                ) : (
                  'Confirmar Vínculo'
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
