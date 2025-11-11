import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Filter, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type FiltroTipoConta = 'todos' | 'ativo' | 'passivo' | 'receita' | 'despesa';
type FiltroAnalitica = 'todos' | 'Sim' | 'Não';

interface PlanoContasFiltersProps {
    filtroTexto: string;
    setFiltroTexto: (text: string) => void;
    filtroTipoConta: FiltroTipoConta;
    setFiltroTipoConta: (type: FiltroTipoConta) => void;
    filtroAnalitica: FiltroAnalitica;
    setFiltroAnalitica: (type: FiltroAnalitica) => void;
    mascaraAtiva: string | null;
}

const PlanoContasFilters: React.FC<PlanoContasFiltersProps> = ({
    filtroTexto,
    setFiltroTexto,
    filtroTipoConta,
    setFiltroTipoConta,
    filtroAnalitica,
    setFiltroAnalitica,
    mascaraAtiva,
}) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-4">
                <div className="relative w-full sm:w-[300px]">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por conta, código ou descrição..."
                        value={filtroTexto}
                        onChange={(e) => setFiltroTexto(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Select value={filtroTipoConta} onValueChange={setFiltroTipoConta}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="Filtrar por Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todos">Todos os Tipos</SelectItem>
                        <SelectItem value="ativo">Ativo (Inicia com 1)</SelectItem>
                        <SelectItem value="passivo">Passivo (Inicia com 2)</SelectItem>
                        <SelectItem value="receita">Receita (Inicia com 3)</SelectItem>
                        <SelectItem value="despesa">Despesa (Inicia com 4/5)</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={filtroAnalitica} onValueChange={setFiltroAnalitica}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="Filtrar por Analítica" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todos">Todas (Analítica)</SelectItem>
                        <SelectItem value="Sim">Sim</SelectItem>
                        <SelectItem value="Não">Não</SelectItem>
                    </SelectContent>
                </Select>
            </CardContent>
            {mascaraAtiva && (
                <CardContent className="pt-0">
                    <div className="p-2 bg-secondary rounded-md text-sm">
                        Máscara Ativa: <span className="font-mono font-semibold text-primary">{mascaraAtiva}</span>
                    </div>
                </CardContent>
            )}
        </Card>
    );
};

export default PlanoContasFilters;