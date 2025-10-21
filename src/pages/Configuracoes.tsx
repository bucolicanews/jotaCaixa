import LayoutPrincipal from '@/components/LayoutPrincipal';

const Configuracoes = () => {
  return (
    <LayoutPrincipal>
      <h1 className="text-3xl font-bold mb-6">Configurações</h1>
      <p className="text-lg text-gray-600 dark:text-gray-400">
        Gerencie usuários, perfis de importação e regras tributárias.
      </p>
      {/* TODO: Implementar configurações de usuário, empresa e tributárias */}
    </LayoutPrincipal>
  );
};

export default Configuracoes;