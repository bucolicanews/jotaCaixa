import LayoutPrincipal from '@/components/LayoutPrincipal';

const Relatorios = () => {
  return (
    <LayoutPrincipal>
      <h1 className="text-3xl font-bold mb-6">Relatórios</h1>
      <p className="text-lg text-gray-600 dark:text-gray-400">
        Gere relatórios fiscais, gerenciais e exporte para Calima.
      </p>
      {/* TODO: Implementar filtros e opções de exportação */}
    </LayoutPrincipal>
  );
};

export default Relatorios;