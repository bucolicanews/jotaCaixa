import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PlusCircle, Edit } from 'lucide-react';
import { ConfiguracaoConciliacao } from '@/types/conciliacao';

interface Step2SelectConfigProps {
  configs: ConfiguracaoConciliacao[];
  configSelecionada: ConfiguracaoConciliacao | null;
  onSelectConfig: (id: string) => void;
  onOpenDialog: (config: ConfiguracaoConciliacao | null) => void;
}

const Step2SelectConfig: React.FC<Step2SelectConfigProps> = ({ configs, configSelecionada, onSelectConfig, onOpenDialog }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Passo 2: Configuração de Importação</CardTitle>
        <CardDescription>Selecione ou crie um mapeamento para o formato do seu extrato CSV.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select 
          onValueChange={onSelectConfig} 
          value={configSelecionada?.id || ''}
        >
          <SelectTrigger><SelectValue placeholder="Selecione uma configuração" /></SelectTrigger>
          <SelectContent>
            {configs.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.nome_configuracao}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => onOpenDialog(null)} className="w-full">
            <PlusCircle className="w-4 h-4 mr-2" /> Nova
          </Button>
          <Button variant="secondary" onClick={() => onOpenDialog(configSelecionada)} className="w-full" disabled={!configSelecionada}>
            <Edit className="w-4 h-4 mr-2" /> Editar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Step2SelectConfig;