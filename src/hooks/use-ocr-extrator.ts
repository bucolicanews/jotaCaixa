import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DadosOcr {
  valor: number | null;
  data: string | null;
  descricao: string | null;
  confianca: number;
}

interface UseOcrExtratorReturn {
  extrairDados: (comprovanteUrl: string, tipo: 'recebimento' | 'pagamento') => Promise<DadosOcr | null>;
  carregando: boolean;
  erro: string | null;
}

export function useOcrExtrator(): UseOcrExtratorReturn {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const extrairDados = useCallback(async (
    comprovanteUrl: string, 
    tipo: 'recebimento' | 'pagamento'
  ): Promise<DadosOcr | null> => {
    setCarregando(true);
    setErro(null);

    try {
      const { data, error } = await supabase.functions.invoke('extract-comprovante-ocr', {
        body: { comprovante_url: comprovanteUrl, tipo }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message || 'Erro ao processar OCR');

      return data.data as DadosOcr;
    } catch (err: any) {
      console.error('Erro no OCR:', err);
      setErro(err.message);
      return null;
    } finally {
      setCarregando(false);
    }
  }, []);

  return { extrairDados, carregando, erro };
}

export default useOcrExtrator;
