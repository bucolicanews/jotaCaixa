import LayoutPrincipal from '@/components/LayoutPrincipal';

const ContasPagar = () => {
  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6">Contas a Pagar</h1>
      <p className="text-lg text-gray-600 dark:text-gray-400">
        Gerencie suas obrigações financeiras.
      </p>
      {/* TODO: Implementar listagem e formulário de contas a pagar */}
    </LayoutPrincipal>
  );
};

export default ContasPagar;