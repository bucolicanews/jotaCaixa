import React, { useState } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, TrendingUp, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangePicker } from '@/components/DateRangePicker';
import { DateRange } from 'react-day-picker';
import DREDetalhe from '@/components/DREDetalhe';
import { startOfMonth, endOfMonth } from 'date-fns';
import { ClienteProfile } from '@/types/usuario';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const DRE: React.FC = () => {
  const { role, perfil, carregando: carregandoSessao } = useSessao();
  
  // A DRE é calculada em um período. Padrão: Mês atual.
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  
  // NOVO ESTADO: Filtro para mostrar apenas contas com saldo diferente de zero
  const [filtroSomenteComSaldo, setFiltroSomenteComSaldo] = useState(false);
  
  const canAccessPage = role === 'Admin' || (role === 'Cliente' && (perfil as ClienteProfile)?.permissoes?.relatorios === true);

  if (carregandoSessao) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!canAccessPage) {
    return (
      <LayoutPrincipal>
        <Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para acessar a Demonstração do Resultado (DRE).</p></CardContent></Card>
      </LayoutPrincipal>
    );
  }
  
  const isPeriodSelected = filtroPeriodo?.from && filtroPeriodo?.to;

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <TrendingUp className="w-6 h-6 mr-2" /> Demonstração do Resultado (DRE)
      </h1>
      
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros</CardTitle></CardHeader>
        <CardContent className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-3">Selecione o período para o cálculo da DRE.</p>
                <DateRangePicker 
                    date={filtroPeriodo}
                    setDate={setFiltroPeriodo}
                />
            </div>
            
            <div className="flex items-center space-x-2 p-3 border rounded-md bg-secondary/50">
                <Switch 
                    id="filtro-saldo" 
                    checked={filtroSomenteComSaldo} 
                    onCheckedChange={setFiltroSomenteComSaldo} 
                />
                <Label htmlFor="filtro-saldo" className="text-sm">
                    Exibir Somente Contas com Saldo (R$ ≠ 0,00)
                </Label>
            </div>
        </CardContent>
      </Card>
      
      {isPeriodSelected ? (
        <DREDetalhe 
            filtroPeriodo={filtroPeriodo}
            filtroSomenteComSaldo={filtroSomenteComSaldo}
        />
      ) : (
        <Card className="mt-6">
            <CardContent className="p-6 text-center text-muted-foreground">
                Selecione um período de início e fim para calcular a DRE.
            </CardContent>
        </Card>
      )}
    </LayoutPrincipal>
  );
};

export default DRE;