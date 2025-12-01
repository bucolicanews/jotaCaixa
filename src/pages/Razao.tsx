import React, { useState } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, BookOpen, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangePicker } from '@/components/DateRangePicker';
import { DateRange } from 'react-day-picker';
import { startOfMonth, endOfMonth } from 'date-fns';
import { ClienteProfile } from '@/types/usuario';
import RazaoDetalhe from '@/components/contabilidade/RazaoDetalhe'; // Componente a ser criado

const Razao: React.FC = () => {
  const { role, perfil, carregando: carregandoSessao } = useSessao();
  
  // O Livro Razão é calculado em um período. Padrão: Mês atual.
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  
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
        <Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para acessar o Livro Razão.</p></CardContent></Card>
      </LayoutPrincipal>
    );
  }
  
  const isPeriodSelected = filtroPeriodo?.from && filtroPeriodo?.to;

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <BookOpen className="w-6 h-6 mr-2" /> Livro Razão
      </h1>
      
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros</CardTitle></CardHeader>
        <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Selecione o período para o cálculo do Livro Razão.</p>
            <DateRangePicker 
                date={filtroPeriodo}
                setDate={setFiltroPeriodo}
            />
        </CardContent>
      </Card>
      
      {isPeriodSelected ? (
        <RazaoDetalhe 
            filtroPeriodo={filtroPeriodo}
        />
      ) : (
        <Card className="mt-6">
            <CardContent className="p-6 text-center text-muted-foreground">
                Selecione um período de início e fim para calcular o Livro Razão.
            </CardContent>
        </Card>
      )}
    </LayoutPrincipal>
  );
};

export default Razao;