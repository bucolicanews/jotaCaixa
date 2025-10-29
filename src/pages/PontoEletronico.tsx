import LayoutPrincipal from '@/components/LayoutPrincipal';
import RegistroPonto from '@/components/RegistroPonto';
import { useSessao } from '@/hooks/use-sessao';
import { UsuarioProfile } from '@/types/usuario';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const PontoEletronico = () => {
  const { role, perfil, carregando } = useSessao();
  const navigate = useNavigate();

  const isUsuario = role === 'Usuario';
  const podeVerPonto = isUsuario && (perfil as UsuarioProfile)?.permissoes?.ponto_eletronico;

  useEffect(() => {
    if (!carregando && isUsuario && !podeVerPonto) {
      // Se for usuário e não tiver permissão, redireciona para o painel
      navigate('/painel', { replace: true });
    }
  }, [carregando, isUsuario, podeVerPonto, navigate]);

  if (carregando) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64">Carregando...</div></LayoutPrincipal>;
  }

  if (isUsuario && !podeVerPonto) {
    // Retorna null ou um placeholder enquanto o redirecionamento acontece
    return null;
  }

  return (
    <LayoutPrincipal>
      <div className="w-full"> 
        <h1 className="text-2xl md:text-3xl font-bold mb-8 text-center">Ponto Eletrônico</h1>
        <RegistroPonto />
      </div>
    </LayoutPrincipal>
  );
};

export default PontoEletronico;