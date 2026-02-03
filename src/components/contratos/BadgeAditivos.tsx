import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

interface BadgeAditivosProps {
  contratoId: string;
}

export function BadgeAditivos({ contratoId }: BadgeAditivosProps) {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCount();
  }, [contratoId]);

  const fetchCount = async () => {
    try {
      const { data, error } = await supabase.rpc('contar_aditivos_ativos', {
        p_conta_receber_id: contratoId,
      });

      if (error) throw error;
      setCount(data || 0);
    } catch (error) {
      console.error('Erro ao buscar contagem de aditivos:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || count === 0) {
    return null;
  }

  return (
    <Badge variant="secondary" className="ml-2">
      {count} {count === 1 ? 'aditivo' : 'aditivos'}
    </Badge>
  );
}
