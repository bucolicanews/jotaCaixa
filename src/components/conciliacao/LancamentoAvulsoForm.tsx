import { useState, useEffect } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSessao } from '@/hooks/use-sessao';
import { supabase } from '@/integrations/supabase/client';

interface PlanoContas {
  id: string;
  Conta: string;
  Descricao: string;
  Tipo: string;
}

interface Props {
  valorRestante: number;
  contaContabilId: string;
  descricao: string;
  onContaContabilChange: (id: string) => void;
  onDescricaoChange: (desc: string) => void;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export function LancamentoAvulsoForm({
  valorRestante,
  contaContabilId,
  descricao,
  onContaContabilChange,
  onDescricaoChange,
}: Props) {
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
  const [loading, setLoading] = useState(true);
  const { ownerId } = useSessao();

  useEffect(() => {
    const buscarContas = async () => {
      const { data } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Tipo')
        .eq('proprietario_id', ownerId)
        .eq('Analitica', 'Sim')
        .order('Conta');

      setContasContabeis(data || []);
      setLoading(false);
    };

    buscarContas();
  }, [ownerId]);

  return (
    <Card className="border-yellow-500 bg-yellow-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-yellow-700">
          <AlertCircle className="h-5 w-5" />
          Valor Restante Detectado
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            Sobrou <strong>R$ {formatCurrency(valorRestante)}</strong>.
            Crie um lançamento avulso para conciliar o valor restante.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="valor">Valor (readonly)</Label>
          <Input
            id="valor"
            type="text"
            value={formatCurrency(valorRestante)}
            readOnly
            className="bg-gray-100"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="conta">Conta Contábil *</Label>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Select value={contaContabilId} onValueChange={onContaContabilChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma conta de resultado" />
              </SelectTrigger>
              <SelectContent>
                {contasContabeis.map((conta) => (
                  <SelectItem key={conta.id} value={conta.id}>
                    {conta.Conta} - {conta.Descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="descricao">Descrição</Label>
          <Textarea
            id="descricao"
            placeholder="Ex: Diferença de conciliação, taxa, desconto..."
            value={descricao}
            onChange={(e) => onDescricaoChange(e.target.value)}
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}
