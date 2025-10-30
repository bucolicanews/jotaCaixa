import { useState, useEffect, useCallback } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { UsuarioProfile } from '@/types/usuario';
import DetalheFolhaPonto from './DetalheFolhaPonto';
import { MonthPicker } from './MonthPicker';
import { RegistroPonto } from '@/types/ponto'; // Importando a interface centralizada

const DetalheProprioPonto: React.FC = () => {
  const { usuario, perfil, carregando } = useSessao();
  const [dataSelecionada, setDataSelecionada] = useState<Date>(startOfMonth(new Date()));
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [registrosDoFuncionario, setRegistrosDoFuncionario] = useState<RegistroPonto[]>([]);
  
  const usuarioProfile = perfil as UsuarioProfile;
  const funcionarioId = usuario?.id;

  const fetchRegistros = useCallback(async (id: string, data: Date) => {
    setCarregandoDados(true);
    const inicioMes = format(startOfMonth(data), 'yyyy-MM-dd');
    // Usar endOfMonth para garantir que todos os registros até o final do último dia do mês sejam incluídos.
    const fimMes = format(endOfMonth(data), 'yyyy-MM-dd'); 

    const { data: registros, error } = await supabase
      .from('registros_ponto')
      .select('*, selfie_url')
      .eq('funcionario_id', id)
      .gte('horario_registro', inicioMes)
      .lte('horario_registro', fimMes)
      .order('horario_registro', { ascending: true });

    if (error) {
      showError('Erro ao carregar registros de ponto: ' + error.message);
      setRegistrosDoFuncionario([]);
    } else {
      setRegistrosDoFuncionario(registros as RegistroPonto[]);
    }
    setCarregandoDados(false);
  }, []);

  useEffect(() => {
    if (funcionarioId) {
      fetchRegistros(funcionarioId, dataSelecionada);
    }
  }, [funcionarioId, dataSelecionada, fetchRegistros]);

  if (carregando || carregandoDados) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!usuarioProfile || !usuarioProfile.salario || !usuarioProfile.horas_mensais) {
      return (
        <Card className="mt-4">
            <CardContent className="text-center py-8 text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2" />
                Dados de salário e jornada não configurados pelo seu gestor.
            </CardContent>
        </Card>
      );
  }

  return (
    <div className="space-y-6">
        <div className="flex justify-end">
            <MonthPicker
                date={dataSelecionada}
                setDate={setDataSelecionada}
                disabled={carregandoDados}
            />
        </div>
        <DetalheFolhaPonto 
            funcionario={{
                id: usuarioProfile.id,
                nome: usuarioProfile.nome,
                salario: usuarioProfile.salario,
                horas_mensais: usuarioProfile.horas_mensais,
                registros: registrosDoFuncionario,
            }}
            mes={dataSelecionada}
            onEditRegistro={() => { /* Usuário não pode editar seu próprio ponto */ }}
            onEditFaltaAbono={() => { /* Usuário não pode editar seu próprio ponto */ }}
            onDeleteRegistro={() => { /* Usuário não pode deletar seu próprio ponto */ }}
        />
    </div>
  );
};

export default DetalheProprioPonto;