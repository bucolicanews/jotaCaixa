import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter } from 'lucide-react';

interface PlanoContasFiltersProps {
    filtroTexto: string;
    setFiltroTexto: (value: string) => void;
    filtroTipoConta: string;
    setFiltroTipoConta: (value: string) => void;
    filtroAnalitica: string;
    setFiltroAnalitica: (value: string) => void;
}

const PlanoContasFilters: React.FC<PlanoContasFiltersProps> = ({
    filtroTexto,
    setFiltroTexto,
    filtroTipoConta,
    setFiltroTipoConta,
    filtroAnalitica,
    setFiltroAnalitica,
}) => {
    return (
        <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por Conta, Código ou Descrição..."
                    value={filtroTexto}
                    onChange={(e) => setFiltroTexto(e.target.value)}
                    className="pl-10"
                />
            </div>
            <div className="flex gap-4">
                <Select value={filtroTipoConta} onValueChange={setFiltroTipoConta}>
                    <SelectTrigger className="w-[180px]">
                        <Filter className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Filtrar por Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todos">Todos os Tipos</SelectItem>
                        <SelectItem value="ativo">Ativo (1)</SelectItem>
                        <SelectItem value="passivo">Passivo (2)</SelectItem>
                        <SelectItem value="receita">Receita (3)</SelectItem>
                        <SelectItem value="despesa">Despesa (4)</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={filtroAnalitica} onValueChange={setFiltroAnalitica}>
                    <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Filtrar Analítica" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todos">Todas</SelectItem>
                        <SelectItem value="Sim">Analítica (Sim)</SelectItem>
                        <SelectItem value="Não">Sintética (Não)</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
};

export default PlanoContasFilters;