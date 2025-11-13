import LayoutPrincipal from '@/components/LayoutPrincipal';
import ImportarAtalho from '@/components/ImportarAtalho';
import { useSessao } from '@/hooks/use-sessao';
import { UsuarioProfile } from '@/types/usuario';
import { Loader2, Upload, FileText, BookOpen, Banknote } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Importar = () => {
  const { role, perfil, carregando } = useSessao();
  
  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.proprietario_id;
    return null;
  };
  
  const ownerId = getOwnerId();

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
        Selecione o tipo de dado que deseja importar para o sistema.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* 1. Importar Extrato Bancário (Redireciona para Conciliação) */}
        <ImportarAtalho
            title="Extrato Bancário (CSV)"
            description="Importe extratos para conciliação e lançamento automático de movimentações."
            icon={Banknote}
            destinationPath="/conciliacao"
            buttonText="Ir para Conciliação"
        />
        
        {/* 2. Importar Plano de Contas */}
        <ImportarAtalho
            title="Plano de Contas (CSV/JSON)"
            description="Importe ou substitua seu Plano de Contas contábil completo."
            icon={BookOpen}
            destinationPath="/plano-contas"
            buttonText="Ir para Plano de Contas"
        />
        
        {/* 3. Importar Modelo de Contrato */}
        <ImportarAtalho
            title="Modelo de Contrato (TXT/HTML)"
            description="Importe templates de contrato para uso na geração de documentos dinâmicos."
            icon={FileText}
            destinationPath="/contratos/modelos"
            buttonText="Ir para Modelos de Contrato"
        />
        
      </div>
    </LayoutPrincipal>
  );
};

export default Importar;