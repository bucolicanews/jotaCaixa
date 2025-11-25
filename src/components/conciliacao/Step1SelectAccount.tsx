//import React from 'react';
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SaldoConta } from '@/types/saldo-conta';

interface Step1SelectAccountProps {
  contas: SaldoConta[];
  loading: boolean;
  onSelectAccount: (id: string) => void;
  contaSelecionadaId: string | null;
}

const Step1SelectAccount: React.FC<Step1SelectAccountProps> = ({ contas, loading, onSelectAccount, contaSelecionadaId }) => {
  return (
    <Card>
      <CardHeader><CardTitle>Passo 1: Selecione a Conta Bancária</CardTitle></CardHeader>
      <CardContent>
        <Select onValueChange={onSelectAccount} disabled={loading} value={contaSelecionadaId || ''}>
          <SelectTrigger>
            <SelectValue placeholder={loading ? "Carregando..." : "Selecione a conta para conciliar"} />
          </SelectTrigger>
          <SelectContent>
            {contas.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
};

export default Step1SelectAccount;