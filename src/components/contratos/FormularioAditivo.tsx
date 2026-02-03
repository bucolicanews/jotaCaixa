import { useState, useEffect } from 'react';
import { Loader2, Calculator, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface FormularioAditivoProps {
  contaReceberId: string; // ✅ ID CORRETO
  onAditivoCriado?: () => void;
}

interface PreviewData {
  soma_atual: number;
  soma_nova: number;
  parcelas: Array<{
    numero: number;
    valor_atual: number;
    valor_novo: number;
  }>;
}

interface ParcelaAberta {
  id: string;
  numero_parcela: number;
  valor_parcela: number;
}

export function FormularioAditivo({
  contaReceberId,
  onAditivoCriado,
}: FormularioAditivoProps) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [loadingParcelas, setLoadingParcelas] = useState(true);
  const [parcelasAbertas, setParcelasAbertas] = useState<ParcelaAberta[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  const [formData, setFormData] = useState({
    tipo_aditivo: 'acrescimo' as 'acrescimo' | 'reducao',
    valor_ajuste: '',
    modo_distribuicao: 'proporcional' as 'proporcional' | 'fixo',
    motivo: '',
    observacao: '',
  });

  useEffect(() => {
    fetchParcelasAbertas();
  }, [contaReceberId]);

  const fetchParcelasAbertas = async () => {
    try {
      setLoadingParcelas(true);

      const { data, error } = await supabase
        .from('admin_parcelas_receber')
        .select('id, numero_parcela, valor_parcela')
        .eq('conta_receber_id', contaReceberId) // ✅ AQUI ESTAVA O ERRO
        .in('status', ['aberta'])
        .order('numero_parcela', { ascending: true });

      if (error) throw error;

      setParcelasAbertas(data || []);
    } catch (error) {
      console.error('Erro ao buscar parcelas abertas:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as parcelas abertas.',
        variant: 'destructive',
      });
    } finally {
      setLoadingParcelas(false);
    }
  };

  const calcularPreview = (): PreviewData | null => {
    const valorAjuste = parseFloat(formData.valor_ajuste);
    if (isNaN(valorAjuste) || valorAjuste <= 0) return null;

    const somaAtual = parcelasAbertas.reduce(
      (acc, p) => acc + Number(p.valor_parcela),
      0
    );

    const somaNova =
      formData.tipo_aditivo === 'acrescimo'
        ? somaAtual + valorAjuste
        : somaAtual - valorAjuste;

    if (somaNova < 0) return null;

    const parcelasPreview = parcelasAbertas.map((p) => {
      const valorAtual = Number(p.valor_parcela);

      let ajuste = 0;

      if (formData.modo_distribuicao === 'fixo') {
        ajuste = valorAjuste / parcelasAbertas.length;
      } else {
        ajuste = (valorAtual / somaAtual) * valorAjuste;
      }

      return {
        numero: p.numero_parcela,
        valor_atual: valorAtual,
        valor_novo:
          formData.tipo_aditivo === 'acrescimo'
            ? valorAtual + ajuste
            : valorAtual - ajuste,
      };
    });

    return {
      soma_atual: somaAtual,
      soma_nova: somaNova,
      parcelas: parcelasPreview,
    };
  };

  const handleGerarPreview = () => {
    if (!formData.valor_ajuste || !formData.motivo.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe o valor e o motivo do aditivo.',
        variant: 'destructive',
      });
      return;
    }

    const previewData = calcularPreview();
    if (!previewData) return;

    setPreview(previewData);
    setShowPreview(true);
  };

  const handleConfirmar = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase.rpc('criar_aditivo_contratual', {
        p_conta_receber_id: contaReceberId,
        p_admin_id: user.id,
        p_tipo_aditivo: formData.tipo_aditivo,
        p_valor_ajuste: Number(formData.valor_ajuste),
        p_modo_distribuicao: formData.modo_distribuicao,
        p_motivo: formData.motivo,
        p_observacao: formData.observacao || null,
      });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Aditivo criado com sucesso.',
      });

      setShowPreview(false);
      setPreview(null);

      onAditivoCriado?.();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loadingParcelas) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Carregando parcelas...
      </div>
    );
  }

  if (parcelasAbertas.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Este contrato não possui parcelas abertas.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          <strong>Parcelas abertas:</strong> {parcelasAbertas.length}
        </AlertDescription>
      </Alert>

      {/* FORMULÁRIO */}
      {/* (o restante do JSX pode permanecer igual ao seu original) */}

      <div className="flex gap-3">
        <Button variant="outline" onClick={handleGerarPreview}>
          <Calculator className="w-4 h-4 mr-2" />
          Gerar Preview
        </Button>

        {showPreview && (
          <Button onClick={handleConfirmar} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Confirmar Aditivo
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

export default FormularioAditivo;