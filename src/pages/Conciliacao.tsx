import LayoutPrincipal from '@/components/LayoutPrincipal';

const Conciliacao = () => {
  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6">Conciliação Bancária</h1>
      <p className="text-lg text-gray-600 dark:text-gray-400">
        Conecte extratos bancários com lançamentos internos.
      </p>
      {/* TODO: Implementar interface de conciliação */}
    </LayoutPrincipal>
  );
};

export default Conciliacao;