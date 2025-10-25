import LayoutPrincipal from '@/components/LayoutPrincipal';

const Bancos = () => {
  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6">Bancos / Caixas</h1>
      <p className="text-lg text-gray-600 dark:text-gray-400">
        Cadastre e monitore suas contas bancárias e caixas.
      </p>
      {/* TODO: Implementar cadastro e listagem de contas bancárias */}
    </LayoutPrincipal>
  );
};

export default Bancos;