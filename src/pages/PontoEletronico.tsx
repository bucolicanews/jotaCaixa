import LayoutPrincipal from '@/components/LayoutPrincipal';
import RegistroPonto from '@/components/RegistroPonto';

const PontoEletronico = () => {
  return (
    <LayoutPrincipal>
      <div className="flex flex-col items-center justify-center">
        <h1 className="text-2xl md:text-3xl font-bold mb-8">Ponto Eletrônico</h1>
        <RegistroPonto />
      </div>
    </LayoutPrincipal>
  );
};

export default PontoEletronico;