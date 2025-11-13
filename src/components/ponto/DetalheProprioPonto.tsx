import { useState, useEffect, useCallback } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import DetalheFolhaPonto from './DetalheFolhaPonto';
import { MonthPicker } from '@/components/MonthPicker';
import { RegistroPonto, Ferias } from '@/types/ponto'; // Importando a interface centralizada

const DetalheProprioPonto: React.FC = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [dataSelecionada, setDataSelecionada] = useState<Date>(startOfMonth(new Date()));
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [registrosDoFuncionario, setRegistrosDoFuncionario] = useState<RegistroPonto[]>([]);
  const [feriasDoFuncionario, setFeriasDoFuncionario] = useState<Ferias[]>([]);
  
  const isFuncionarioAdmin = role === 'Usuario' && (perfil as AdminUsuarioProfile)?.admin_id;
  const tabelaRegistros = isFuncionarioAdmin ? 'admin_registros_ponto' : 'registros_ponto';
  const tabelaFerias = 'ferias'; // A tabela de férias é única

  const funcionarioId = usuario?.id;

  const fetchFerias = useCallback(async (id: string, data: Date) => {
    const inicioMes = format(startOfMonth(data), 'yyyy-MM-dd');
    const fimMes = format(endOfMonth(data), 'yyyy-MM-dd');
    
    const { data: feriasData, error } = await supabase
        .from(tabelaFerias)
        .select('*')
        .eq('funcionario_id', id)
        .lte('data_inicio', fimMes)
        .gte('data_fim', inicioMes);

    if (error) {
        showError('Erro ao carregar férias: ' + error.message);
        setFeriasDoFuncionario([]);
    } else {
        setFeriasDoFuncionario(feriasData as Ferias[]);
    }
  }, []);

  const fetchRegistros = useCallback(async (id: string, data: Date) => {
    setCarregandoDados(true);
    const inicioMes = format(startOfMonth(data), 'yyyy-MM-dd');
    // Usar endOfMonth para garantir que todos os registros até o final do último dia do mês sejam incluídos.
    const fimMes = format(endOfMonth(data), 'yyyy-MM-dd'); 

    const { data: registros, error } = await supabase
      .from(tabelaRegistros) // ROTEAMENTO AQUI
      .select('id, funcionario_id, empresa_id, horario_registro, tipo, maps_url, selfie_url, atestado_url, observacao')
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
  }, [tabelaRegistros]);

  useEffect(() => {
    if (funcionarioId) {
      fetchRegistros(funcionarioId, dataSelecionada);
      fetchFerias(funcionarioId, dataSelecionada);
    }
  }, [funcionarioId, dataSelecionada, fetchRegistros, fetchFerias]);

  if (carregandoSessao || carregandoDados) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  
  // CORREÇÃO: Verifica se o perfil é AdminUsuarioProfile e usa os campos corretos
  const profileData = isFuncionarioAdmin ? (perfil as AdminUsuarioProfile) : (perfil as UsuarioProfile);
  
  if (!profileData || !profileData.salario || !profileData.horas_mensais) {
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
                id: profileData.id,
                nome: profileData.nome,
                salario: profileData.salario,
                horas_mensais: profileData.horas_mensais,
                registros: registrosDoFuncionario,
                dias_folga_fixos: profileData.dias_folga_fixos || [],
                folga_domingo_obrigatoria: profileData.folga_domingo_obrigatoria ?? true,
                ferias: feriasDoFuncionario,
            }}
            mes={dataSelecionada}
            onEditRegistro={() => { /* Usuário não pode editar seu próprio ponto */ }}
            onEditFaltaAbono={() => { /* Usuário não pode editar seu próprio ponto */ }}
            onDeleteRegistro={() => { /* Usuário não pode deletar seu próprio ponto */ }}
            onManageWorkedDayOff={() => { /* Usuário não pode gerenciar folga trabalhada */ }}
        />
    </div>
  );
};

export default DetalheProprioPonto;