import LayoutPrincipal from '@/components/LayoutPrincipal';
import ImportarExtrato from '@/components/ImportarExtrato';
import ImportarModeloContrato from '@/components/ImportarModeloContrato';
import ImportarPlanoContas from '@/components/ImportarPlanoContas';
import { useSessao } from '@/hooks/use-sessao';
import { UsuarioProfile } from '@/types/usuario';
import { Loader2, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

const Importar = () => {
  const { role, perfil, carregando } = useSessao();
  const navigate = useNavigate();
  
  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId();
  
  // Função de callback para forçar o recarregamento de dados (se necessário)
  const handleImportComplete = () => {
      // Redireciona para a página de destino após a importação
      if (role === 'Admin' || role === 'Cliente') {
          navigate('/plano-contas');
      } else {
          // Usuários não devem ter acesso a esta página, mas se tiverem, redireciona para o painel
          navigate('/painel');
      }
  };

  if (carregando) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }
  
  if (!ownerId) {
      return (
        <LayoutPrincipal>
          <Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não está vinculado a uma empresa para importar dados.</p></CardContent></Card>
        </LayoutPrincipal>
      );
  }

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <Upload className="w-6 h-6 mr-2" /> Importação de Dados
      </h1>
      <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
        Importe extratos, modelos de contrato e planos de contas.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* 1. Importar Extrato Bancário (Redireciona para Conciliação) */}
        <ImportarExtrato />
        
        {/* 2. Importar Plano de Contas */}
        <ImportarPlanoContas onImportComplete={handleImportComplete} />
        
        {/* 3. Importar Modelo de Contrato */}
        <ImportarModeloContrato 
            empresaId={ownerId} 
            onImportComplete={() => navigate('/contratos/modelos')} 
        />
        
      </div>
    </LayoutPrincipal>
  );
};

export default Importar;