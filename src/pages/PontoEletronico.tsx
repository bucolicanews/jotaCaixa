import LayoutPrincipal from '@/components/LayoutPrincipal';
import RegistroPonto from '@/components/ponto/RegistroPonto';
import { useSessao } from '@/hooks/use-sessao';
import { UsuarioProfile } from '@/types/usuario';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

const PontoEletronico = () => {
  const { role, perfil, carregando } = useSessao();

  if (carregando) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }
  
  const isUsuario = role === 'Usuario';
  const podeBaterPonto = isUsuario && (perfil as UsuarioProfile)?.permissoes?.ponto_eletronico;

  if (isUsuario && !podeBaterPonto) {
    return (
      <LayoutPrincipal>
        <Card className="w-full max-w-xl mx-auto mt-10">
          <CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader>
          <CardContent><p>Seu gestor não concedeu permissão para bater o ponto eletrônico.</p></CardContent>
        </Card>
      </LayoutPrincipal>
    );
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