import React, { useState } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Scale, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangePicker } from '@/components/DateRangePicker';
import { DateRange } from 'react-day-picker';
import BalancoPatrimonialDetalhe from '@/components/contabilidade/BalancoPatrimonialDetalhe';
import { endOfMonth } from 'date-fns';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch'; // Importando Switch
import { useOwnerBranding } from '@/hooks/use-owner-branding'; // NOVO IMPORT

const BalancoPatrimonial: React.FC = () => {
  const { role, perfil, carregando: carregandoSessao } = useSessao();
  const { logoUrl, ownerName } = useOwnerBranding(); // USANDO HOOK DE BRANDING
  
  // O Balanço Patrimonial é calculado ATÉ uma data específica. Usamos o 'to' do DateRange.
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>({
    from: undefined,
    to: endOfMonth(new Date()),
  });
  
  // NOVO ESTADO: Filtro para mostrar apenas contas com saldo diferente de zero
  const [filtroSomenteComSaldo, setFiltroSomenteComSaldo] = useState(true);
  
  const canAccessPage = role === 'Admin' || (role === 'Cliente' && (perfil as any)?.permissoes?.relatorios === true);

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
        <Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para acessar o Balanço Patrimonial.</p></CardContent></Card>
      </LayoutPrincipal>
    );
  }
  
  const endDate = filtroPeriodo?.to;

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <Scale className="w-6 h-6 mr-2" /> Balanço Patrimonial
      </h1>
      
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros</CardTitle></CardHeader>
        <CardContent className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-3">O balanço será calculado até a data final selecionada.</p>
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
      
      {endDate ? (
        <BalancoPatrimonialDetalhe 
            endDate={endDate} 
            filtroSomenteComSaldo={filtroSomenteComSaldo} // Passando o novo filtro
            logoUrl={logoUrl} // PASSANDO LOGO
            ownerName={ownerName} // PASSANDO NOME
        />
      ) : (
        <Card className="mt-6">
            <CardContent className="p-6 text-center text-muted-foreground">
                Selecione uma data final para calcular o Balanço Patrimonial.
            </CardContent>
        </Card>
      )}
    </LayoutPrincipal>
  );
};

export default BalancoPatrimonial;