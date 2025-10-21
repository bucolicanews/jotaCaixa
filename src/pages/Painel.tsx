import LayoutPrincipal from '@/components/LayoutPrincipal';

const Painel = () => {
  return (
    <LayoutPrincipal>
      <h1 className="text-3xl font-bold mb-6">Painel de Controle</h1>
      <p className="text-lg text-gray-600 dark:text-gray-400">
        Bem-vindo ao Fluxo de Caixa. Aqui você verá gráficos e resumos financeiros.
      </p>
      {/* TODO: Implementar gráficos e resumos (saldo atual, fluxo projetado) */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold">Saldo Atual</h3>
          <p className="text-3xl mt-2 text-green-600">R$ 0,00</p>
        </div>
        <div className="bg-card p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold">Contas a Vencer (30 dias)</h3>
          <p className="text-3xl mt-2 text-red-600">R$ 0,00</p>
        </div>
        <div className="bg-card p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold">Conciliações Pendentes</h3>
          <p className="text-3xl mt-2 text-yellow-600">0</p>
        </div>
      </div>
    </LayoutPrincipal>
  );
};

export default Painel;