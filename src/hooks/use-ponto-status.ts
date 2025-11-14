import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { parseISO, differenceInHours, format } from 'date-fns';
import { useSessao } from './use-sessao';
import { AdminUsuarioProfile } from '@/types/usuario';

interface RegistroPonto {
  id: string;
  horario_registro: string; // ISO string
  tipo: 'Entrada' | 'Saida';
}

interface PontoStatus {
  ultimoRegistro: RegistroPonto | null;
  proximaAcao: 'Entrada' | 'Saida';
  alerta4Horas: boolean;
  carregando: boolean;
  refetch: () => void;
}

const usePontoStatus = (funcionarioId: string | undefined): PontoStatus => {
  const { perfil, role } = useSessao();
  const [ultimoRegistro, setUltimoRegistro] = useState<RegistroPonto | null>(null);
  const [proximaAcao, setProximaAcao] = useState<'Entrada' | 'Saida'>('Entrada');
  const [alerta4Horas, setAlerta4Horas] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const isFuncionarioAdmin = role === 'Usuario' && (perfil as AdminUsuarioProfile)?.admin_id;
  const tabelaRegistros = isFuncionarioAdmin ? 'admin_registros_ponto' : 'registros_ponto';

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (!funcionarioId) {
      setCarregando(false);
      return;
    }

    const fetchStatus = async () => {
      setCarregando(true);
      
      // Busca o último registro do dia atual
      const today = format(new Date(), 'yyyy-MM-dd');
      
      const { data, error } = await supabase
        .from(tabelaRegistros) // ROTEAMENTO AQUI
        .select('id, horario_registro, tipo')
        .eq('funcionario_id', funcionarioId)
        .gte('horario_registro', today)
        .order('horario_registro', { ascending: false })
        .limit(1);

      if (error) {
        showError('Erro ao buscar status do ponto: ' + error.message);
        setUltimoRegistro(null);
        setProximaAcao('Entrada');
        setAlerta4Horas(false);
      } else {
        const last = data?.[0] || null;
        setUltimoRegistro(last);

        if (last) {
          const lastTime = parseISO(last.horario_registro);
          
          // Regra 2: Se o último foi Entrada, a próxima deve ser Saída.
          if (last.tipo === 'Entrada') {
            setProximaAcao('Saida');
            
            // Regra 3: Alerta de 4 horas
            const hoursPassed = differenceInHours(new Date(), lastTime);
            setAlerta4Horas(hoursPassed >= 4);
          } else {
            // Se o último foi Saída, a próxima deve ser Entrada (para o próximo turno/dia)
            setProximaAcao('Entrada');
            setAlerta4Horas(false);
          }
        } else {
          // Nenhum registro hoje, próxima ação é Entrada
          setProximaAcao('Entrada');
          setAlerta4Horas(false);
        }
      }
      setCarregando(false);
    };

    fetchStatus();
  }, [funcionarioId, refreshKey, tabelaRegistros]);

  return { ultimoRegistro, proximaAcao, alerta4Horas, carregando, refetch };
};

export default usePontoStatus;