import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Index = () => {
  const navegar = useNavigate();
  
  useEffect(() => {
    // Redireciona a rota raiz para a página de vendas
    navegar('/vendas');
  }, [navegar]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      Redirecionando para a Página de Vendas...
    </div>
  );
};

export default Index;