import React, { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export interface FiltrosProtocolo {
  texto?: string;
  clienteId?: string;
  status?: string;
  dataInicio?: Date;
  dataFim?: Date;
  usuarioCriador?: string;
}

interface ProtocoloFiltrosProps {
  onFilter: (filtros: FiltrosProtocolo) => void;
  clientes: Array<{ id: string; nome: string }>;
}

const statusOptions = [
  { value: 'todos', label: 'Todos' },
  { value: 'Criado', label: 'Criado' },
  { value: 'Impresso', label: 'Impresso' },
  { value: 'Trânsito', label: 'Trânsito' },
  { value: 'Entregue', label: 'Entregue' },
  { value: 'Cancelado', label: 'Cancelado' },
];

export function ProtocoloFiltros({ onFilter, clientes }: ProtocoloFiltrosProps) {
  const [filtros, setFiltros] = useState<FiltrosProtocolo>({});

  const handleChange = (field: keyof FiltrosProtocolo, value: any) => {
    const novosFiltros = { ...filtros, [field]: value };
    setFiltros(novosFiltros);
  };

  const handleAplicar = () => {
    onFilter(filtros);
  };

  const handleLimpar = () => {
    setFiltros({});
    onFilter({});
  };

  const handleDateChange = (field: 'dataInicio' | 'dataFim', value: string) => {
    const date = value ? new Date(value) : undefined;
    handleChange(field, date);
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="texto">Busca Livre</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="texto"
              placeholder="Número, cliente, responsável..."
              value={filtros.texto || ''}
              onChange={(e) => handleChange('texto', e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cliente">Cliente</Label>
          <Select
            value={filtros.clienteId || 'todos'}
            onValueChange={(value) => handleChange('clienteId', value === 'todos' ? undefined : value)}
          >
            <SelectTrigger id="cliente">
              <SelectValue placeholder="Selecione o cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {clientes.map((cliente) => (
                <SelectItem key={cliente.id} value={cliente.id}>
                  {cliente.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={filtros.status || 'todos'}
            onValueChange={(value) => handleChange('status', value === 'todos' ? undefined : value)}
          >
            <SelectTrigger id="status">
              <SelectValue placeholder="Selecione o status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dataInicio">Data Início</Label>
          <Input
            id="dataInicio"
            type="date"
            value={filtros.dataInicio ? filtros.dataInicio.toISOString().split('T')[0] : ''}
            onChange={(e) => handleDateChange('dataInicio', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dataFim">Data Fim</Label>
          <Input
            id="dataFim"
            type="date"
            value={filtros.dataFim ? filtros.dataFim.toISOString().split('T')[0] : ''}
            onChange={(e) => handleDateChange('dataFim', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="usuarioCriador">Usuário Criador</Label>
          <Input
            id="usuarioCriador"
            placeholder="Nome do usuário"
            value={filtros.usuarioCriador || ''}
            onChange={(e) => handleChange('usuarioCriador', e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={handleLimpar}>
          <X className="mr-2 h-4 w-4" />
          Limpar Filtros
        </Button>
        <Button onClick={handleAplicar}>
          <Search className="mr-2 h-4 w-4" />
          Aplicar
        </Button>
      </div>
    </div>
  );
}
