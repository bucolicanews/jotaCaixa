import LayoutPrincipal from '@/components/LayoutPrincipal';

const Importar = () => {
  return (
    <LayoutPrincipal>
      <h1 className="text-3xl font-bold mb-6">Importação de Dados</h1>
      <p className="text-lg text-gray-600 dark:text-gray-400">
        Importe extratos, notas fiscais XML e plano de contas.
      </p>
      {/* TODO: Implementar uploader e mapeador */}
    </LayoutPrincipal>
  );
};

export default Importar;