import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { Check, Loader2, AlertCircle, DollarSign, Calendar, FileText, Receipt, Sparkles, Link2 } from 'lucide-react';
import { TransacaoComId, ParcelaCandidato } from '@/hooks/conciliacao/useMapeamentoParcelas';
import { 
  DadosCategorizacao,
  buscarHistoricosPadrao,
  buscarContasContabeis
} from '@/hooks/conciliacao/useConciliacaoDireta';
import { showError } from '@/utils/toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface ModalCategorizacaoDiretaProps {
  open: boolean;
  onClose: () => void;
  transacao: TransacaoComId | null;
  candidatos: ParcelaCandidato[];
  loadingCandidatos: boolean;
  onConfirmarVinculo: (parcelaId: string) => Promise<void>;
  onConfirmarCategorizacao: (dados: DadosCategorizacao) => Promise<void>;
  ownerId: string;
  isAdmin: boolean;
}

const ModalCategorizacaoDireta: React.FC<ModalCategorizacaoDiretaProps> = ({
  open,
  onClose,
  transacao,
  candidatos,
  loadingCandidatos,
  onConfirmarVinculo,
  onConfirmarCategorizacao,
  ownerId,
  isAdmin,
}) => {
  const [modo, setModo] = useState<'parcelas' | 'direto'>('parcelas');
  const [parcelaSelecionada, setParcelaSelecionada] = useState<string | null>(null);
  const [contaContabilId, setContaContabilId] = useState('');
  const [historicoId, setHistoricoId] = useState('');
  const [observacao, setObservacao] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [carregandoContas, setCarregandoContas] = useState(false);
  const [carregandoHistoricos, setCarregandoHistoricos] = useState(false);
  const [contasContabeis, setContasContabeis] = useState<{ id: string; codigo: string; nome: string }[]>([]);
  const [historicos, setHistoricos] = useState<{ id: string; descricao: string }[]>([]);

  const isEntrada = transacao?.tipo === 'Entrada';
  const tipoOperacao = isEntrada ? 'receita' : 'despesa';

  useEffect(() => {
    console.log('🎯 ModalCategorizacaoDireta - candidatos recebidos:', candidatos?.length, candidatos);
    if (candidatos && candidatos.length > 0) {
      console.log('✅ Mudando para modo PARCELAS');
      setModo('parcelas');
    } else {
      console.log('⚠️ Mudando para modo DIRETO (sem candidatos)');
      setModo('direto');
    }
  }, [candidatos]);

  useEffect(() => {
    if (open && modo === 'direto') {
      carregarDados();
    } else if (!open) {
      resetarFormulario();
    }
  }, [open, modo]);

  const carregarDados = async () => {
    if (!transacao || !ownerId) {
      console.error('❌ ownerId ou transacao não definidos');
      return;
    }

    console.log('📍 carregarDados - ownerId:', ownerId);
    console.log('📍 carregarDados - isAdmin:', isAdmin);

    setCarregandoContas(true);
    setCarregandoHistoricos(true);

    try {
      const [contas, hists] = await Promise.all([
        buscarContasContabeis(isAdmin, ownerId, tipoOperacao),
        buscarHistoricosPadrao(isAdmin, ownerId)
      ]);

      setContasContabeis(contas);
      setHistoricos(hists);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      showError('Erro ao carregar contas contábeis e históricos');
    } finally {
      setCarregandoContas(false);
      setCarregandoHistoricos(false);
    }
  };

  const resetarFormulario = () => {
    setContaContabilId('');
    setHistoricoId('');
    setObservacao('');
    setParcelaSelecionada(null);
    setModo('parcelas');
  };

  const handleConfirmar = async () => {
    if (modo === 'parcelas' && parcelaSelecionada) {
      setConfirmando(true);
      try {
        await onConfirmarVinculo(parcelaSelecionada);
        onClose();
      } catch (error) {
        console.error('Erro ao confirmar vínculo:', error);
      } finally {
        setConfirmando(false);
      }
    } else if (modo === 'direto') {
      if (!contaContabilId) {
        showError('Selecione uma conta contábil');
        return;
      }

      if (!historicoId) {
        showError('Selecione um histórico padrão');
        return;
      }

      setConfirmando(true);
      try {
        await onConfirmarCategorizacao({
          id_conta_contabil: contaContabilId,
          id_historico: historicoId,
          observacao: observacao || undefined
        });
        onClose();
      } catch (error) {
        console.error('Erro ao confirmar categorização:', error);
      } finally {
        setConfirmando(false);
      }
    }
  };

  const formularioValido = modo === 'parcelas' ? parcelaSelecionada !== null : (contaContabilId && historicoId);

  const getCompatibilidadeVariant = (nivel: string) => {
    switch (nivel) {
      case 'alta':
        return 'default';
      case 'media':
        return 'secondary';
      case 'baixa':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  if (!transacao) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {modo === 'parcelas' ? 'Vincular com Parcela' : 'Conciliação Direta'}
          </DialogTitle>
          <DialogDescription>
            {modo === 'parcelas' 
              ? 'Selecione a parcela correspondente a esta transação do extrato.'
              : 'Categorize esta transação do extrato que não possui parcela correspondente.'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="bg-secondary p-4 rounded-md space-y-3">
          <h4 className="font-semibold flex items-center text-sm">
            <FileText className="w-4 h-4 mr-2" />
            Informações da Transação
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Data
              </p>
              <p className="font-medium">{formatarData(transacao.data)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                Valor
              </p>
              <p className="font-medium text-lg">{formatCurrency(Math.abs(transacao.valor))}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tipo</p>
              <Badge variant={isEntrada ? 'success' : 'destructive'}>
                {isEntrada ? 'Entrada' : 'Saída'}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Identificação</p>
              <p className="font-medium text-sm truncate" title={transacao.identificacao}>
                {transacao.identificacao || '-'}
              </p>
            </div>
          </div>
        </div>

        {modo === 'parcelas' ? (
          <>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Encontramos parcelas que podem corresponder a esta transação. Selecione a correta:
              </p>

              {loadingCandidatos ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  <span className="text-sm">Buscando parcelas...</span>
                </div>
              ) : candidatos.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Nenhuma parcela candidata encontrada. Use a categorização direta.
                  </AlertDescription>
                </Alert>
              ) : (
                <ScrollArea className="h-[300px] border rounded-md p-4">
                  <RadioGroup value={parcelaSelecionada || ''} onValueChange={setParcelaSelecionada}>
                    <div className="space-y-3">
                      {candidatos.map((candidato) => (
                        <div
                          key={candidato.id}
                          className={`border rounded-lg p-4 cursor-pointer transition-all ${
                            parcelaSelecionada === candidato.id
                              ? 'border-primary bg-primary/5'
                              : 'hover:border-primary/50'
                          }`}
                          onClick={() => setParcelaSelecionada(candidato.id)}
                        >
                          <div className="flex items-start gap-3">
                            <RadioGroupItem value={candidato.id} id={candidato.id} />
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={getCompatibilidadeVariant(candidato.compatibilidade)}>
                                  {candidato.compatibilidade === 'alta' ? 'Alta' : 
                                   candidato.compatibilidade === 'media' ? 'Média' : 'Baixa'} compatibilidade
                                </Badge>
                                {candidato.compatibilidade === 'alta' && (
                                  <Sparkles className="w-4 h-4 text-yellow-500" />
                                )}
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div>
                                  <p className="text-xs text-muted-foreground">Número</p>
                                  <p className="font-medium">{candidato.numero_parcela}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Valor</p>
                                  <p className="font-medium">{formatCurrency(candidato.valor_parcela)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Vencimento</p>
                                  <p className="font-medium">{formatarData(candidato.data_vencimento)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">
                                    {candidato.cliente_nome ? 'Cliente' : 'Fornecedor'}
                                  </p>
                                  <p className="font-medium truncate" title={candidato.cliente_nome || candidato.fornecedor}>
                                    {candidato.cliente_nome || candidato.fornecedor}
                                  </p>
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground border-t pt-2">
                                <strong>Motivo:</strong> {candidato.motivo_compatibilidade}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </RadioGroup>
                </ScrollArea>
              )}
            </div>

            <DialogFooter className="flex justify-between items-center">
              <Button 
                variant="secondary" 
                onClick={() => setModo('direto')}
                disabled={confirmando}
              >
                Não encontrei a parcela
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={confirmando}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleConfirmar} 
                  disabled={!formularioValido || confirmando}
                >
                  {confirmando ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Vinculando...
                    </>
                  ) : (
                    <>
                      <Link2 className="w-4 h-4 mr-2" />
                      Confirmar Vínculo
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          <>
            {candidatos.length === 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Esta transação não possui parcela correspondente em Contas a {isEntrada ? 'Receber' : 'Pagar'}. 
                  Categorize-a para criar um lançamento contábil direto.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contaContabil" className="flex items-center gap-1">
                  <Receipt className="w-4 h-4" />
                  Conta Contábil *
                  <span className="text-xs text-muted-foreground ml-1">
                    ({isEntrada ? 'Receita' : 'Despesa'})
                  </span>
                </Label>
                {carregandoContas ? (
                  <div className="flex items-center justify-center py-3 border rounded-md">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    <span className="text-sm">Carregando contas...</span>
                  </div>
                ) : contasContabeis.length === 0 ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Nenhuma conta de {tipoOperacao} encontrada. Cadastre contas contábeis primeiro.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Select value={contaContabilId} onValueChange={setContaContabilId}>
                    <SelectTrigger id="contaContabil">
                      <SelectValue placeholder={`Selecione uma conta de ${tipoOperacao}...`} />
                    </SelectTrigger>
                    <SelectContent>
                      {contasContabeis.map((conta) => (
                        <SelectItem key={conta.id} value={conta.id}>
                          {conta.codigo} - {conta.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="historico" className="flex items-center gap-1">
                  <FileText className="w-4 h-4" />
                  Histórico Padrão *
                </Label>
                {carregandoHistoricos ? (
                  <div className="flex items-center justify-center py-3 border rounded-md">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    <span className="text-sm">Carregando históricos...</span>
                  </div>
                ) : historicos.length === 0 ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Nenhum histórico padrão encontrado. Cadastre históricos primeiro.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Select value={historicoId} onValueChange={setHistoricoId}>
                    <SelectTrigger id="historico">
                      <SelectValue placeholder="Selecione um histórico..." />
                    </SelectTrigger>
                    <SelectContent>
                      {historicos.map((hist) => (
                        <SelectItem key={hist.id} value={hist.id}>
                          {hist.descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacao">
                  Observação (Opcional)
                </Label>
                <Textarea
                  id="observacao"
                  placeholder="Adicione uma observação sobre esta conciliação..."
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                * Campos obrigatórios
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={confirmando}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleConfirmar} 
                  disabled={!formularioValido || confirmando}
                >
                  {confirmando ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Confirmando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Confirmar Conciliação
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ModalCategorizacaoDireta;
