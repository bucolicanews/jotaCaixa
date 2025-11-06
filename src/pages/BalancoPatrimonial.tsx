import React, { useState } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangePicker } from '@/components/DateRangePicker';
import { DateRange } from 'react-day-picker';
import BalancoPatrimonialDetalhe from '@/components/BalancoPatrimonialDetalhe';
import { endOfMonth } from 'date-fns';

const BalancoPatrimonial: React.FC = () => {
  const { role, perfil, carregando: carregandoSessao } = useSessao();
  
  // O Balanço Patrimonial é calculado ATÉ uma data específica. Usamos o 'to' do DateRange.
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>({
    from: undefined,
    to: endOfMonth(new Date()),
  });
  
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
        <CardHeader><CardTitle className="text-lg">Filtro de Data</CardTitle></CardHeader>
        <CardContent>
            <p className="text-sm text-muted-foreground mb-3">O balanço será calculado até a data final selecionada.</p>
            <DateRangePicker 
                date={filtroPeriodo}
                setDate={setFiltroPeriodo}
            />
        </CardContent>
      </Card>
      
      {endDate ? (
        <BalancoPatrimonialDetalhe endDate={endDate} />
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