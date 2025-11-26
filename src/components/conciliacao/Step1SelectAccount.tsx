import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SaldoContaDetalhada } from '@/types/saldo-conta'; // Usando SaldoContaDetalhada para acessar plano_contas

interface Step1SelectAccountProps {
  contas: SaldoContaDetalhada[]; // Alterado para SaldoContaDetalhada
  loading: boolean;
  onSelectAccount: (id: string) => void;
  contaSelecionadaId: string | null;
}

const Step1SelectAccount: React.FC<Step1SelectAccountProps> = ({ contas, loading, onSelectAccount, contaSelecionadaId }) => {
  
  // Filtra as contas para mostrar apenas aquelas marcadas como Banco (is_banco)
  // Conciliação é tipicamente feita com extratos bancários.
  const contasFiltradas = contas.filter(c => c.plano_contas?.is_banco);
  
  return (
    <Card>
      <CardHeader><CardTitle>Passo 1: Selecione a Conta Bancária</CardTitle></CardHeader>
      <CardContent>
        <Select onValueChange={onSelectAccount} disabled={loading} value={contaSelecionadaId || ''}>
          <SelectTrigger>
            <SelectValue placeholder={loading ? "Carregando..." : "Selecione a conta para conciliar"} />
          </SelectTrigger>
          <SelectContent>
            {contasFiltradas.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {contasFiltradas.length === 0 && !loading && (
            <p className="text-sm text-red-500 mt-2">
                Nenhuma conta marcada como Banco encontrada. Verifique o Plano de Contas.
            </p>
        )}
      </CardContent>
    </Card>
  );
};

export default Step1SelectAccount;