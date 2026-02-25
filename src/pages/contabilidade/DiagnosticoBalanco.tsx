import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { resolveOwnerContext } from '@/utils/owner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface ContaDebug {
  id: string;
  Conta: string;
  Descricao: string;
  saldo_tipo: string | null;
  saldo_calculado: number;
  lancamentos_count: number;
  origem_lancamentos: { [key: string]: number };
  entrada_sum: number;
  saida_sum: number;
  is_conta_resultado: boolean;
}

interface DiagnosticoData {
  contas_devedoras: ContaDebug[];
  contas_credoras: ContaDebug[];
  contas_sem_saldo_tipo: ContaDebug[];
  total_ativo: number;
  total_passivo_pl: number;
  diferenca: number;
  total_lancamentos: number;
}

export default function DiagnosticoBalanco() {
  const { usuario, perfil, role } = useSessao();
  const { ownerId } = resolveOwnerContext(role, perfil, usuario?.id);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    carregarDiagnostico();
  }, [ownerId]);

  const carregarDiagnostico = async () => {
    try {
      setLoading(true);
      setErro(null);

      // Buscar todas as contas
      const { data: contas, error: contasError } = await supabase
        .from('plano_contas')
        .select('*')
        .eq('proprietario_id', ownerId);

      if (contasError) throw contasError;

      // Buscar todos os lançamentos
      const { data: lancamentos, error: lancamentosError } = await supabase
        .from('lancamentos')
        .select('*')
        .eq('proprietario_id', ownerId);

      if (lancamentosError) throw lancamentosError;

      // Processar dados
      const contasDebug: ContaDebug[] = contas!.map(conta => {
        const lancamentosDaConta = lancamentos!.filter(
          l => l.conta_contabil_id === conta.id
        );

        const entrada_sum = lancamentosDaConta
          .filter(l => l.tipo === 'Entrada')
          .reduce((sum, l) => sum + parseFloat(l.valor), 0);

        const saida_sum = lancamentosDaConta
          .filter(l => l.tipo === 'Saida')
          .reduce((sum, l) => sum + parseFloat(l.valor), 0);

        // Determinar saldo baseado em saldo_tipo
        let saldo_calculado = 0;
        if (conta.saldo_tipo === 'devedora') {
          saldo_calculado = entrada_sum - saida_sum;
        } else if (conta.saldo_tipo === 'credora') {
          saldo_calculado = saida_sum - entrada_sum;
        }

        // Contar origens
        const origem_lancamentos: { [key: string]: number } = {};
        lancamentosDaConta.forEach(l => {
          origem_lancamentos[l.origem || 'sem_origem'] = 
            (origem_lancamentos[l.origem || 'sem_origem'] || 0) + 1;
        });

        return {
          id: conta.id,
          Conta: conta.Conta,
          Descricao: conta.Descricao,
          saldo_tipo: conta.saldo_tipo,
          saldo_calculado,
          lancamentos_count: lancamentosDaConta.length,
          origem_lancamentos,
          entrada_sum,
          saida_sum,
          is_conta_resultado: conta.is_conta_resultado || false
        };
      });

      // Separar contas
      const contas_sem_saldo_tipo = contasDebug.filter(c => !c.saldo_tipo);
      const contas_devedoras = contasDebug.filter(
        c => c.saldo_tipo === 'devedora' && c.saldo_calculado !== 0
      );
      const contas_credoras = contasDebug.filter(
        c => c.saldo_tipo === 'credora' && c.saldo_calculado !== 0
      );

      const total_ativo = contas_devedoras.reduce((sum, c) => sum + c.saldo_calculado, 0);
      const total_passivo_pl = contas_credoras.reduce((sum, c) => sum + c.saldo_calculado, 0);
      const diferenca = total_ativo - total_passivo_pl;

      setDiagnostico({
        contas_devedoras,
        contas_credoras,
        contas_sem_saldo_tipo,
        total_ativo,
        total_passivo_pl,
        diferenca,
        total_lancamentos: lancamentos!.length
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao carregar diagnóstico');
      console.error('Erro:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Carregando diagnóstico...</div>
      </div>
    );
  }

  if (!diagnostico) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertDescription>{erro || 'Nenhum dado disponível'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const chartData = [
    { name: 'Ativo', value: diagnostico.total_ativo },
    { name: 'Passivo+PL', value: diagnostico.total_passivo_pl }
  ];

  const COLORS = ['#3b82f6', '#ef4444'];

  return (
    <div className="space-y-6 p-8">
      <div className="flex justify-between items-center">
        <h1 className="text-4xl font-bold">Diagnóstico do Balanço</h1>
        <button
          onClick={carregarDiagnostico}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Recarregar
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Ativo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              R$ {diagnostico.total_ativo.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Passivo + PL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              R$ {diagnostico.total_passivo_pl.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Diferença</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              Math.abs(diagnostico.diferenca) < 0.01 ? 'text-green-600' : 'text-red-600'
            }`}>
              R$ {diagnostico.diferenca.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Lançamentos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {diagnostico.total_lancamentos}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alertas */}
      {diagnostico.contas_sem_saldo_tipo.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            ⚠️ {diagnostico.contas_sem_saldo_tipo.length} contas sem `saldo_tipo` definido
          </AlertDescription>
        </Alert>
      )}

      {Math.abs(diagnostico.diferenca) >= 0.01 && (
        <Alert variant="destructive">
          <AlertDescription>
            ❌ Balanço desequilibrado por R$ {Math.abs(diagnostico.diferenca).toFixed(2)}
          </AlertDescription>
        </Alert>
      )}

      {Math.abs(diagnostico.diferenca) < 0.01 && (
        <Alert>
          <AlertDescription>
            ✅ Balanço equilibrado (diferença: R$ {diagnostico.diferenca.toFixed(2)})
          </AlertDescription>
        </Alert>
      )}

      {/* Gráficos */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Comparação Ativo vs Passivo+PL</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => `R$ ${parseFloat(value).toFixed(2)}`} />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: R$ ${parseFloat(value).toFixed(0)}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {COLORS.map((color) => (
                    <Cell key={`cell-${color}`} fill={color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Contas Devedoras */}
      <Card>
        <CardHeader>
          <CardTitle>Contas Devedoras (Ativo) - {diagnostico.contas_devedoras.length}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Conta</th>
                  <th className="text-left py-2">Descrição</th>
                  <th className="text-right py-2">Entrada</th>
                  <th className="text-right py-2">Saída</th>
                  <th className="text-right py-2 font-bold">Saldo</th>
                  <th className="text-right py-2">Lançamentos</th>
                </tr>
              </thead>
              <tbody>
                {diagnostico.contas_devedoras.map(conta => (
                  <tr key={conta.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 font-mono">{conta.Conta}</td>
                    <td className="py-2">{conta.Descricao}</td>
                    <td className="text-right py-2">R$ {conta.entrada_sum.toFixed(2)}</td>
                    <td className="text-right py-2">R$ {conta.saida_sum.toFixed(2)}</td>
                    <td className="text-right py-2 font-bold text-blue-600">
                      R$ {conta.saldo_calculado.toFixed(2)}
                    </td>
                    <td className="text-right py-2">{conta.lancamentos_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Contas Credoras */}
      <Card>
        <CardHeader>
          <CardTitle>Contas Credoras (Passivo + PL) - {diagnostico.contas_credoras.length}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Conta</th>
                  <th className="text-left py-2">Descrição</th>
                  <th className="text-right py-2">Entrada</th>
                  <th className="text-right py-2">Saída</th>
                  <th className="text-right py-2 font-bold">Saldo</th>
                  <th className="text-right py-2">Lançamentos</th>
                </tr>
              </thead>
              <tbody>
                {diagnostico.contas_credoras.map(conta => (
                  <tr key={conta.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 font-mono">{conta.Conta}</td>
                    <td className="py-2">{conta.Descricao}</td>
                    <td className="text-right py-2">R$ {conta.entrada_sum.toFixed(2)}</td>
                    <td className="text-right py-2">R$ {conta.saida_sum.toFixed(2)}</td>
                    <td className="text-right py-2 font-bold text-green-600">
                      R$ {conta.saldo_calculado.toFixed(2)}
                    </td>
                    <td className="text-right py-2">{conta.lancamentos_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Contas sem saldo_tipo */}
      {diagnostico.contas_sem_saldo_tipo.length > 0 && (
        <Card className="border-red-300">
          <CardHeader className="bg-red-50">
            <CardTitle className="text-red-700">
              Contas sem `saldo_tipo` - {diagnostico.contas_sem_saldo_tipo.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Conta</th>
                    <th className="text-left py-2">Descrição</th>
                    <th className="text-right py-2">Lançamentos</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnostico.contas_sem_saldo_tipo.map(conta => (
                    <tr key={conta.id} className="border-b bg-red-50">
                      <td className="py-2 font-mono">{conta.Conta}</td>
                      <td className="py-2">{conta.Descricao}</td>
                      <td className="text-right py-2">{conta.lancamentos_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
