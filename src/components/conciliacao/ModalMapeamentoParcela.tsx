import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { Eye, Check, SkipForward, FileText, Loader2, Sparkles, Search, Zap, List } from 'lucide-react';
import { ParcelaCandidato, TransacaoComId } from '@/hooks/conciliacao/useMapeamentoParcelas';
import { showError } from '@/utils/toast';

interface ModalMapeamentoParcelaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transacao: TransacaoComId | null;
  candidatos: ParcelaCandidato[];
  onConfirmar: (parcelaId: string) => Promise<void>;
  onPular: () => void;
  onVoltar?: () => void;
  totalPendentes: number;
  indiceAtual: number;
  carregando?: boolean;
  onBuscarManual?: () => void;
  onConciliarDireta?: () => void;
  onBuscarTodasParcelas?: () => void;
}

const ModalMapeamentoParcela: React.FC<ModalMapeamentoParcelaProps> = ({
  open,
  onOpenChange,
  transacao,
  candidatos,
  onConfirmar,
  onPular,
  onVoltar,
  totalPendentes,
  indiceAtual,
  carregando = false,
  onBuscarManual,
  onConciliarDireta,
  onBuscarTodasParcelas,
}) => {
  const [selecionando, setSelecionando] = useState<string | null>(null);
  const [comprovanteUrl, setComprovanteUrl] = useState<string | null>(null);
  const [comprovanteDialogOpen, setComprovanteDialogOpen] = useState(false);

  const handleSelecionar = async (parcelaId: string) => {
    const candidato = candidatos.find(c => c.id === parcelaId);
    if (candidato?.mapeado_extrato_id) {
      showError('Esta parcela já foi mapeada para outra transação.');
      return;
    }
    
    setSelecionando(parcelaId);
    try {
      await onConfirmar(parcelaId);
    } finally {
      setSelecionando(null);
    }
  };

  const handleVisualizarComprovante = (url: string) => {
    setComprovanteUrl(url);
    setComprovanteDialogOpen(true);
  };

  const getBadgeVariant = (comp: 'alta' | 'media' | 'baixa') => {
    if (comp === 'alta') return 'success';
    if (comp === 'media') return 'warning';
    return 'secondary';
  };

  if (!transacao) return null;

  const isCP = transacao.tipo === 'Saida';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Mapeamento de Transação Pendente</span>
              <Badge variant="outline">{indiceAtual} de {totalPendentes}</Badge>
            </DialogTitle>
            <DialogDescription>
              Selecione a parcela correspondente a esta transação do extrato bancário.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-secondary p-4 rounded-md space-y-2">
            <h3 className="font-semibold flex items-center">
              <FileText className="w-4 h-4 mr-2" />
              Transação do Extrato
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Data</p>
                <p className="font-medium">{formatarData(transacao.data)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Valor</p>
                <p className="font-medium text-lg">{formatCurrency(Math.abs(transacao.valor))}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tipo</p>
                <Badge variant={transacao.tipo === 'Entrada' ? 'success' : 'destructive'}>
                  {transacao.tipo === 'Entrada' ? 'Entrada (CR)' : 'Saída (CP)'}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Identificação</p>
                <p className="font-medium text-sm truncate" title={transacao.identificacao}>
                  {transacao.identificacao || '-'}
                </p>
              </div>
            </div>
            {transacao.descricao && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground">Descrição</p>
                <p className="font-medium text-sm" title={transacao.descricao}>
                  {transacao.descricao}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">
              Parcelas Candidatas ({candidatos.length})
            </h3>
            
            {carregando ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2">Buscando parcelas...</span>
              </div>
            ) : candidatos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground space-y-4">
                <div>
                  <p>Nenhuma parcela candidata encontrada.</p>
                  <p className="text-sm mt-1">
                    Verifique se há parcelas em aberto no período de ±3 dias com valor similar.
                  </p>
                </div>
                <div className="flex flex-col gap-2 items-center">
                  {onBuscarManual && (
                    <Button 
                      variant="outline" 
                      onClick={onBuscarManual}
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Buscar Manualmente
                    </Button>
                  )}
                  {onConciliarDireta && (
                    <Button 
                      variant="default"
                      onClick={onConciliarDireta}
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      Conciliar Direto
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">Nº</TableHead>
                      <TableHead className="w-[100px]">Parcelas</TableHead>
                      <TableHead>{isCP ? 'Fornecedor' : 'Cliente'}</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-[100px]">Valor</TableHead>
                      <TableHead className="w-[100px]">Data Pgto</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                      <TableHead className="w-[80px]">Origem</TableHead>
                      <TableHead className="w-[150px]">Compatibilidade</TableHead>
                      <TableHead className="w-[80px]">Comprovante</TableHead>
                      <TableHead className="w-[80px] text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidatos.map(c => (
                      <TableRow 
                        key={c.id}
                        className={c.compatibilidade === 'alta' ? 'bg-green-50 dark:bg-green-950/20' : ''}
                      >
                        <TableCell className="font-mono text-sm">{c.numero_parcela}</TableCell>
                        <TableCell className="text-sm font-medium">{c.numero_parcela}/1</TableCell>
                        <TableCell className="max-w-[120px] truncate text-sm" title={isCP ? c.fornecedor : c.cliente_nome}>
                          {isCP ? (c.fornecedor || '-') : (c.cliente_nome || '-')}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate text-sm" title={c.descricao_conta}>
                          {c.descricao_conta || '-'}
                        </TableCell>
                        <TableCell className="font-medium text-sm">{formatCurrency(c.valor_parcela)}</TableCell>
                        <TableCell className="text-sm">{formatarData(c.data_pagamento || c.data_vencimento)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{c.status || 'pendente'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {c.origem === 'contrato' ? 'Contrato' : 'Avulso'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge 
                              variant={getBadgeVariant(c.compatibilidade)} 
                              title={c.motivo_compatibilidade}
                              className="cursor-help text-xs w-fit"
                            >
                              {c.compatibilidade === 'alta' && (
                                <Sparkles className="w-3 h-3 mr-1" />
                              )}
                              {c.compatibilidade.toUpperCase()}
                            </Badge>
                            {c.similaridade_nome && c.similaridade_nome > 0 && (
                              <span className="text-xs text-muted-foreground">
                                Nome: {c.similaridade_nome.toFixed(0)}%
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {c.anexo_url ? (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleVisualizarComprovante(c.anexo_url!)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant={c.compatibilidade === 'alta' ? 'default' : 'outline'}
                            size="sm" 
                            onClick={() => handleSelecionar(c.id)}
                            disabled={selecionando !== null}
                          >
                            {selecionando === c.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="w-4 h-4 mr-1" />
                                OK
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {candidatos.length > 0 && (onBuscarManual || onConciliarDireta || onBuscarTodasParcelas) && (
            <div className="flex flex-col gap-2 items-center">
              {onBuscarManual && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={onBuscarManual}
                  className="text-muted-foreground"
                >
                  <Search className="w-4 h-4 mr-2" />
                  Nenhuma dessas parcelas? Buscar manualmente
                </Button>
              )}
              {onBuscarTodasParcelas && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={onBuscarTodasParcelas}
                  className="border-blue-500 text-blue-600 hover:bg-blue-50"
                >
                  <List className="w-4 h-4 mr-2" />
                  Ver Todas as Parcelas
                </Button>
              )}
              {onConciliarDireta && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={onConciliarDireta}
                  className="text-muted-foreground"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Não possui parcela? Conciliar direto
                </Button>
              )}
            </div>
          )}

          <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {totalPendentes - indiceAtual} transações restantes após esta
            </p>
            <div className="flex space-x-2">
              {indiceAtual > 1 && (
                <Button 
                  variant="outline" 
                  onClick={() => onVoltar?.()}
                  disabled={selecionando !== null}
                >
                  ← Voltar
                </Button>
              )}
              <Button variant="ghost" onClick={onPular} disabled={selecionando !== null}>
                <SkipForward className="w-4 h-4 mr-1" />
                Pular
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={selecionando !== null}>
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={comprovanteDialogOpen} onOpenChange={setComprovanteDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Comprovante</DialogTitle>
          </DialogHeader>
          {comprovanteUrl && (
            comprovanteUrl.toLowerCase().endsWith('.pdf') ? (
              <iframe src={comprovanteUrl} className="w-full h-[70vh] border rounded" />
            ) : (
              <img 
                src={comprovanteUrl} 
                alt="Comprovante" 
                className="max-w-full max-h-[70vh] mx-auto object-contain" 
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ModalMapeamentoParcela;
