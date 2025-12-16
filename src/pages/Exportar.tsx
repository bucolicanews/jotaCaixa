import React from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, Download } from 'lucide-react';
import ExportarHistoricos from '@/components/calima/ExportarHistoricos';
import ExportarLancamentos from '@/components/calima/ExportarLancamentos';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile } from '@/types/usuario';
import ExportarPlanoContasCard from '@/components/calima/ExportarPlanoContasCard'; // NOVO IMPORT

const Exportar: React.FC = () => {
  const { role, perfil, carregando } = useSessao();
  
  const canAccessPage = role === 'Admin' || 
    (role === 'Cliente' && (perfil as ClienteProfile)?.permissoes?.relatorios === true) ||
    (role === 'Usuario' && (perfil as any)?.permissoes?.exportar === true);

  if (carregando) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }
  
  if (!canAccessPage) {
    return (
      <LayoutPrincipal>
        <Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para acessar a exportação de dados.</p></CardContent></Card>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-8 flex items-center">
        <FileText className="w-6 h-6 mr-2" /> Exportação Contábil
      </h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ExportarHistoricos />
        
        {/* CARD PARA EXPORTAR PLANO DE CONTAS */}
        <ExportarPlanoContasCard />
        
        <ExportarLancamentos />

        <Card>
          <CardHeader>
            <CardTitle>Tabelas Padrões (CSV)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Baixe os modelos oficiais de Plano de Contas e Históricos para importar rapidamente em novos clientes.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button variant="outline" className="w-full" asChild>
                <a href="/plano_contas_padrao.csv" download target="_blank" rel="noreferrer">
                  <Download className="w-4 h-4 mr-2" />
                  Plano Padrão
                </a>
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <a href="/historicos_padrao.csv" download target="_blank" rel="noreferrer">
                  <Download className="w-4 h-4 mr-2" />
                  Históricos Padrão
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Precisa atualizar esses arquivos? Vá em Configurações &gt; Configuração Tabelas Padrão (apenas Admin).
            </p>
          </CardContent>
        </Card>
      </div>
      
      <Card className="mt-6">
        <CardHeader><CardTitle>Instruções de Exportação</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Certifique-se de que seu Plano de Contas e Históricos estejam atualizados antes de exportar. Os arquivos são gerados no formato CSV com delimitador ponto e vírgula (`;`).
          </p>
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default Exportar;
