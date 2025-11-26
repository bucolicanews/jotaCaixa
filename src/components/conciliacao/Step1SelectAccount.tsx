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
  
  // O hook useConciliacao agora filtra as contas para incluir apenas aquelas marcadas como Banco (is_banco: true)
  const contasFiltradas = contas;
  
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
                Nenhuma conta marcada como Banco encontrada. Certifique-se de que a conta contábil está marcada como "Banco" no Plano de Contas E está vinculada a um registro em Bancos/Caixas.
            </p>
        )}
      </CardContent>
    </Card>
  );
};

export default Step1SelectAccount;