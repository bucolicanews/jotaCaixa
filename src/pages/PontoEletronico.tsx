import LayoutPrincipal from '@/components/LayoutPrincipal';
import RegistroPonto from '@/components/RegistroPonto';

const PontoEletronico = () => {
  return (
    <LayoutPrincipal>
      {/* Removendo flex items-center justify-center para evitar conflito com o mx-auto do card */}
      <div className="w-full"> 
        <h1 className="text-2xl md:text-3xl font-bold mb-8 text-center">Ponto Eletrônico</h1>
        <RegistroPonto />
      </div>
    </LayoutPrincipal>
  );
};

export default PontoEletronico;