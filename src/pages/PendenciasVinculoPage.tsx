import LayoutPrincipal from '@/components/LayoutPrincipal';
import { PainelParcelasSemVinculo } from '@/components/conciliacao/PainelParcelasSemVinculo';
import { useSessao } from '@/hooks/use-sessao';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Link2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const PendenciasVinculoPage = () => {
  const { ownerId } = useSessao();
  const navigate = useNavigate();

  return (
    <LayoutPrincipal>
      <div className="flex items-center mb-6">
        <Button onClick={() => navigate('/conciliacao')} variant="link" className="p-0 mr-4">
          <ChevronLeft /> Voltar
        </Button>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <Link2 className="w-6 h-6 mr-2" />
          Pendências de Vínculo
        </h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          <PainelParcelasSemVinculo ownerId={ownerId} />
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default PendenciasVinculoPage;
