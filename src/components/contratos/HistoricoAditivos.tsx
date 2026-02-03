import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertCircle,
  Calendar,
  User,
} from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface Aditivo {
  id: string;
  tipo_aditivo: 'acrescimo' | 'reducao';
  valor_ajuste: number;
  modo_distribuicao: 'proporcional' | 'fixo';
  motivo: string;
  observacao?: string;
  valor_contrato_anterior: number;
  valor_contrato_novo: number;
  quantidade_parcelas_afetadas: number;
  status: string;
  admin_nome: string;
  created_at: string;
  cancelado_em?: string;
  motivo_cancelamento?: string;
}

interface HistoricoAditivosProps {
  contaReceberId: string;
}

export function HistoricoAditivos({ contaReceberId }: HistoricoAditivosProps) {
  const [aditivos, setAditivos] = useState<Aditivo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contaReceberId) return;
    fetchAditivos();
  }, [contaReceberId]);

  const fetchAditivos = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase.rpc(
        'buscar_aditivos_contrato',
        {
          p_conta_receber_id: contaReceberId,
        }
      );

      if (error) throw error;

      setAditivos(data || []);
    } catch (error) {
      console.error('Erro ao buscar aditivos:', error);
      setAditivos([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2">Carregando histórico...</span>
      </div>
    );
  }

  if (aditivos.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Nenhum aditivo registrado para este contrato.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        Histórico de Aditivos ({aditivos.length})
      </h3>

      {aditivos.map((aditivo) => (
        <div
          key={aditivo.id}
          className={`p-4 border rounded-lg ${
            aditivo.status === 'cancelado'
              ? 'bg-muted opacity-60'
              : 'bg-card'
          }`}
        >
          {/* Cabeçalho */}
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              {aditivo.tipo_aditivo === 'acrescimo' ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-600" />
              )}

              <Badge
                variant={
                  aditivo.tipo_aditivo === 'acrescimo'
                    ? 'default'
                    : 'destructive'
                }
              >
                {aditivo.tipo_aditivo === 'acrescimo'
                  ? 'Acréscimo'
                  : 'Redução'}
              </Badge>

              {aditivo.status === 'cancelado' && (
                <Badge variant="secondary">CANCELADO</Badge>
              )}
            </div>

            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {format(new Date(aditivo.created_at), 'dd/MM/yyyy HH:mm', {
                locale: ptBR,
              })}
            </div>
          </div>

          {/* Valores */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <div>
              <p className="text-xs text-muted-foreground">Valor Ajustado</p>
              <p className="text-lg font-bold">
                R${' '}
                {aditivo.valor_ajuste.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                })}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">
                Parcelas Afetadas
              </p>
              <p className="text-lg font-bold">
                {aditivo.quantidade_parcelas_afetadas}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">
                Valor Anterior
              </p>
              <p>
                R${' '}
                {aditivo.valor_contrato_anterior.toLocaleString(
                  'pt-BR',
                  { minimumFractionDigits: 2 }
                )}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">Valor Novo</p>
              <p className="font-semibold text-primary">
                R${' '}
                {aditivo.valor_contrato_novo.toLocaleString(
                  'pt-BR',
                  { minimumFractionDigits: 2 }
                )}
              </p>
            </div>
          </div>

          {/* Motivo */}
          <div className="mb-2">
            <p className="text-xs text-muted-foreground mb-1">Motivo</p>
            <p className="text-sm bg-muted p-2 rounded">
              {aditivo.motivo}
            </p>
          </div>

          {/* Observação */}
          {aditivo.observacao && (
            <div className="mb-2">
              <p className="text-xs text-muted-foreground mb-1">
                Observação
              </p>
              <p className="text-sm bg-muted p-2 rounded">
                {aditivo.observacao}
              </p>
            </div>
          )}

          {/* Rodapé */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-3 pt-3 border-t">
            <User className="w-3 h-3" />
            Responsável: {aditivo.admin_nome}
          </div>

          {/* Cancelamento */}
          {aditivo.status === 'cancelado' &&
            aditivo.motivo_cancelamento && (
              <div className="mt-3 pt-3 border-t border-destructive">
                <p className="text-xs text-destructive font-semibold">
                  Motivo do Cancelamento
                </p>
                <p className="text-xs bg-destructive/10 p-2 rounded">
                  {aditivo.motivo_cancelamento}
                </p>
              </div>
            )}
        </div>
      ))}
    </div>
  );
}
