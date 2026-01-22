import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { Search, Check, Loader2, ChevronDown, ChevronUp, Calendar, DollarSign, User } from 'lucide-react';
import { TransacaoComId } from '@/hooks/conciliacao/useMapeamentoParcelas';
import { 
  buscarParcelasPorFiltros, 
  buscarDetalhesConta, 
  ParcelaResultado, 
  FiltrosBuscaParcelas,
  DetalhesContaCompleta 
} from '@/hooks/conciliacao/useBuscaManualParcelas';
import { showError } from '@/utils/toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ModalBuscaManualParcelasProps {
  open: boolean;
  onClose: () => void;
  transacao: TransacaoComId;
  tipo: 'CR' | 'CP';
  onConfirmar: (parcelaId: string) => Promise<void>;
  isAdmin: boolean;
  ownerId: string;
}

const ModalBuscaManualParcelas: React.FC<ModalBuscaManualParcelasProps> = ({
  open,
  onClose,
  transacao,
  tipo,
  onConfirmar,
  isAdmin,
  ownerId,
}) => {
  const [filtros, setFiltros] = useState<FiltrosBuscaParcelas>({});
  const [resultados, setResultados] = useState<ParcelaResultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [parcelaSelecionada, setParcelaSelecionada] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [detalhesAbertos, setDetalhesAbertos] = useState<Record<string, boolean>>({});
  const [detalhesContas, setDetalhesContas] = useState<Record<string, DetalhesContaCompleta>>({});
  const [carregandoDetalhes, setCarregandoDetalhes] = useState<Record<string, boolean>>({});

  const buscarParcelas = useCallback(async () => {
    setBuscando(true);
    try {
      const valorTransacao = Math.abs(transacao.valor);
      const parcelas = await buscarParcelasPorFiltros(
        filtros,
        tipo,
        isAdmin,
        ownerId,
        valorTransacao
      );
      setResultados(parcelas);
    } catch (error) {
      console.error('Erro ao buscar parcelas:', error);
      showError('Erro ao buscar parcelas');
    } finally {
      setBuscando(false);
    }
  }, [filtros, tipo, isAdmin, ownerId, transacao.valor]);

  useEffect(() => {
    if (open) {
      setParcelaSelecionada(null);
      setDetalhesAbertos({});
      buscarParcelas();
    }
  }, [open, buscarParcelas]);

  const handleSelecionar = (parcelaId: string) => {
    setParcelaSelecionada(parcelaId);
  };

  const handleConfirmarMapeamento = async () => {
    if (!parcelaSelecionada) {
      showError('Selecione uma parcela para confirmar');
      return;
    }

    setConfirmando(true);
    try {
      await onConfirmar(parcelaSelecionada);
      onClose();
    } catch (error) {
      console.error('Erro ao confirmar mapeamento:', error);
    } finally {
      setConfirmando(false);
    }
  };

  const toggleDetalhes = async (parcelaId: string, contaId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const novoEstado = !detalhesAbertos[parcelaId];
    setDetalhesAbertos(prev => ({ ...prev, [parcelaId]: novoEstado }));

    if (novoEstado && !detalhesContas[contaId]) {
      setCarregandoDetalhes(prev => ({ ...prev, [parcelaId]: true }));
      try {
        const detalhes = await buscarDetalhesConta(contaId, tipo, isAdmin);
        if (detalhes) {
          setDetalhesContas(prev => ({ ...prev, [contaId]: detalhes }));
        }
      } catch (error) {
        console.error('Erro ao buscar detalhes da conta:', error);
      } finally {
        setCarregandoDetalhes(prev => ({ ...prev, [parcelaId]: false }));
      }
    }
  };

  const isCP = tipo === 'CP';
  const labelParceiro = isCP ? 'Fornecedor' : 'Cliente';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[90vw] max-w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Busca Manual de Parcelas</DialogTitle>
          <DialogDescription>
            Busque e selecione manualmente a parcela correspondente à transação do extrato.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-secondary p-4 rounded-md mb-4">
          <h4 className="font-semibold mb-2 text-sm">Transação do Extrato</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Data</p>
              <p className="font-medium">{formatarData(transacao.data)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Valor</p>
              <p className="font-medium">{formatCurrency(Math.abs(transacao.valor))}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Identificação</p>
              <p className="font-medium truncate" title={transacao.identificacao}>
                {transacao.identificacao || '-'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Tipo</p>
              <Badge variant={isCP ? 'destructive' : 'success'}>
                {isCP ? 'Saída (CP)' : 'Entrada (CR)'}
              </Badge>
            </div>
          </div>
        </div>

        <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
          <h4 className="font-semibold flex items-center text-sm">
            <Search className="w-4 h-4 mr-2" />
            Filtros de Busca
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nomeBusca" className="flex items-center text-sm">
                <User className="w-3 h-3 mr-1" />
                {labelParceiro}
              </Label>
              <Input
                id="nomeBusca"
                placeholder={`Nome do ${labelParceiro.toLowerCase()}...`}
                value={filtros.nomeBusca || ''}
                onChange={(e) => setFiltros(prev => ({ ...prev, nomeBusca: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dataInicio" className="flex items-center text-sm">
                <Calendar className="w-3 h-3 mr-1" />
                Data Início
              </Label>
              <Input
                id="dataInicio"
                type="date"
                value={filtros.dataInicio || ''}
                onChange={(e) => setFiltros(prev => ({ ...prev, dataInicio: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dataFim" className="flex items-center text-sm">
                <Calendar className="w-3 h-3 mr-1" />
                Data Fim
              </Label>
              <Input
                id="dataFim"
                type="date"
                value={filtros.dataFim || ''}
                onChange={(e) => setFiltros(prev => ({ ...prev, dataFim: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="valorMin" className="flex items-center text-sm">
                <DollarSign className="w-3 h-3 mr-1" />
                Valor Mínimo
              </Label>
              <Input
                id="valorMin"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={filtros.valorMin || ''}
                onChange={(e) => setFiltros(prev => ({ ...prev, valorMin: parseFloat(e.target.value) || undefined }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="valorMax" className="flex items-center text-sm">
                <DollarSign className="w-3 h-3 mr-1" />
                Valor Máximo
              </Label>
              <Input
                id="valorMax"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={filtros.valorMax || ''}
                onChange={(e) => setFiltros(prev => ({ ...prev, valorMax: parseFloat(e.target.value) || undefined }))}
              />
            </div>

            <div className="flex items-end">
              <Button 
                onClick={buscarParcelas} 
                disabled={buscando}
                className="w-full"
              >
                {buscando ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Buscando...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Buscar
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">
              Resultados ({resultados.length}) - Clique para selecionar
            </h4>
            {parcelaSelecionada && (
              <div className="text-sm text-green-600 font-medium">
                ✓ Parcela selecionada
              </div>
            )}
          </div>

          {buscando ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2">Buscando parcelas...</span>
            </div>
          ) : resultados.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border rounded-md">
              <p>Nenhuma parcela encontrada.</p>
              <p className="text-sm mt-1">Ajuste os filtros e tente novamente.</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead className="w-[60px]">Nº</TableHead>
                    <TableHead>{labelParceiro}</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-[100px]">Valor</TableHead>
                    <TableHead className="w-[100px]">Vencimento</TableHead>
                    <TableHead className="w-[80px]">Status</TableHead>
                    {filtros.nomeBusca && <TableHead className="w-[80px]">Similar.</TableHead>}
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultados.map((parcela) => {
                    const contaId = (tipo === 'CR' ? parcela.conta_receber_id : parcela.conta_pagar_id) || '';
                    const detalhes = detalhesContas[contaId];
                    const isAberto = detalhesAbertos[parcela.id];
                    const isCarregando = carregandoDetalhes[parcela.id];

                    return (
                      <React.Fragment key={parcela.id}>
                        <TableRow 
                          className={`cursor-pointer ${parcelaSelecionada === parcela.id ? 'bg-blue-100 border-l-4 border-blue-500' : 'hover:bg-gray-50'}`}
                          onClick={() => handleSelecionar(parcela.id)}
                        >
                          <TableCell>
                            <input
                              type="radio"
                              checked={parcelaSelecionada === parcela.id}
                              onChange={() => handleSelecionar(parcela.id)}
                              className="cursor-pointer"
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm">{parcela.numero_parcela}</TableCell>
                          <TableCell className="max-w-[150px] truncate text-sm">
                            {isCP ? (parcela.fornecedor || '-') : (parcela.cliente_nome || '-')}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm" title={parcela.descricao_conta}>
                            {parcela.descricao_conta || '-'}
                          </TableCell>
                          <TableCell className="font-medium text-sm">{formatCurrency(parcela.valor_parcela)}</TableCell>
                          <TableCell className="text-sm">{formatarData(parcela.data_vencimento)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{parcela.status}</Badge>
                          </TableCell>
                          {filtros.nomeBusca && (
                            <TableCell className="text-sm text-center">
                              {parcela.similaridade ? `${parcela.similaridade.toFixed(0)}%` : '-'}
                            </TableCell>
                          )}
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => toggleDetalhes(parcela.id, contaId, e)}
                            >
                              {isAberto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isAberto && (
                          <TableRow>
                            <TableCell colSpan={filtros.nomeBusca ? 9 : 8} className="bg-muted/30 p-4">
                              {isCarregando ? (
                                <div className="flex items-center justify-center py-4">
                                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                  Carregando detalhes...
                                </div>
                              ) : detalhes ? (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                    <div>
                                      <p className="text-muted-foreground text-xs">Valor Total</p>
                                      <p className="font-medium">{formatCurrency(detalhes.valor_total)}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground text-xs">Data Emissão</p>
                                      <p className="font-medium">{formatarData(detalhes.data_emissao)}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground text-xs">Total de Parcelas</p>
                                      <p className="font-medium">{detalhes.parcelas.length}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground text-xs">{labelParceiro}</p>
                                      <p className="font-medium truncate">
                                        {isCP ? detalhes.fornecedor : detalhes.cliente_nome}
                                      </p>
                                    </div>
                                  </div>
                                  <div>
                                    <div className="mb-2">
                                      <p className="text-sm font-medium">Histórico de Parcelas:</p>
                                      <p className="text-xs text-muted-foreground">
                                        Clique em qualquer parcela abaixo para selecioná-la
                                      </p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                                      {detalhes.parcelas.map((p) => (
                                        <div 
                                          key={p.id} 
                                          onClick={() => handleSelecionar(p.id)}
                                          className={`text-xs p-2 rounded border cursor-pointer transition-all ${
                                            parcelaSelecionada === p.id 
                                              ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-300' 
                                              : 'bg-background hover:bg-gray-50 hover:border-gray-300'
                                          }`}
                                        >
                                          <span className="font-medium">Parcela {p.numero_parcela}:</span>{' '}
                                          {parcelaSelecionada === p.id && <span className="text-green-600 font-bold">✓ </span>}
                                          {formatCurrency(p.valor_parcela)} - {formatarData(p.data_vencimento)} -{' '}
                                          <Badge variant="outline" className="text-xs">{p.status}</Badge>
                                          {p.valor_pago > 0 && (
                                            <span className="ml-1 text-muted-foreground">
                                              (Pago: {formatCurrency(p.valor_pago)})
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">Erro ao carregar detalhes</p>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-4">
          {parcelaSelecionada && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3 w-full">
              <p className="text-sm font-medium text-green-900">Parcela Selecionada:</p>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {(() => {
                  let selecionada = resultados.find(p => p.id === parcelaSelecionada);
                  
                  if (!selecionada) {
                    for (const detalhes of Object.values(detalhesContas)) {
                      const parcelaDetalhes = detalhes.parcelas.find(p => p.id === parcelaSelecionada);
                      if (parcelaDetalhes) {
                        selecionada = {
                          id: parcelaDetalhes.id,
                          numero_parcela: parcelaDetalhes.numero_parcela,
                          valor_parcela: parcelaDetalhes.valor_parcela,
                          data_vencimento: parcelaDetalhes.data_vencimento,
                          status: parcelaDetalhes.status,
                          data_pagamento: null,
                          descricao_conta: detalhes.descricao,
                        } as ParcelaResultado;
                        break;
                      }
                    }
                  }
                  
                  return selecionada ? (
                    <>
                      <div>
                        <p className="text-xs text-green-700">Nº Parcela</p>
                        <p className="font-medium">{selecionada.numero_parcela}</p>
                      </div>
                      <div>
                        <p className="text-xs text-green-700">Valor</p>
                        <p className="font-medium">{formatCurrency(selecionada.valor_parcela)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-green-700">Vencimento</p>
                        <p className="font-medium">{formatarData(selecionada.data_vencimento)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-green-700">Status</p>
                        <Badge className="text-xs">{selecionada.status}</Badge>
                      </div>
                    </>
                  ) : null;
                })()}
              </div>
            </div>
          )}
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {parcelaSelecionada 
                ? 'Parcela pronta para ser vinculada' 
                : 'Clique em uma parcela da tabela acima para selecionar'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={confirmando}>
                Cancelar
              </Button>
              <Button 
                onClick={handleConfirmarMapeamento} 
                disabled={!parcelaSelecionada || confirmando}
              >
                {confirmando ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Confirmando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Confirmar Mapeamento
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ModalBuscaManualParcelas;
