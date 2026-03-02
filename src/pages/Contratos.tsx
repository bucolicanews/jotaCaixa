import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Building2 } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';
import { useState, useMemo } from 'react';
import ContratoAcoesDialog from '@/components/contratos/ContratoAcoesDialog';
import { cn } from '@/lib/utils';
import { useContratos } from '@/hooks/use-contratos';
import ContratosHeader from '@/components/contratos/ContratosHeader';
import ContratosTable from '@/components/contratos/ContratosTable';
import { ContratoGerado } from '@/types/contratos';

const Contratos = () => {
  const { carregando: carregandoSessao } = useSessao();
  const [contratoSelecionado, setContratoSelecionado] = useState<ContratoGerado | null>(null);
  const [acoesDialogOpen, setAcoesDialogOpen] = useState(false);
  const [activeContratoTab, setActiveContratoTab] = useState('pendentes');
  
  const {
    contratos,
    contratosAgrupados,
    carregando,
    isAdmin,
    empresaId,
    filtroTexto,
    setFiltroTexto,
    filtroStatus,
    setFiltroStatus,
    ordenacao,
    setOrdenacao,
    handleDeleteContract,
    handleBlockContract,
    handleReactivateContract,
  } = useContratos();

  // Determina a lista de contratos a ser exibida na tabela
  const contratosParaExibir = useMemo(() => {
      if (filtroTexto.trim()) {
          return contratos;
      }

      if (isAdmin) {
          switch (activeContratoTab) {
              case 'meus_contratos': return contratosAgrupados.meusContratos;
              case 'contratos_clientes': return contratosAgrupados.contratosClientes;
              case 'pendentes': return contratosAgrupados.pendentes;
              case 'ativos': return contratosAgrupados.ativos;
              case 'inativos': return contratosAgrupados.inativos;
              default: return [];
          }
      } else {
          switch (activeContratoTab) {
              case 'pendentes': return contratosAgrupados.pendentes;
              case 'ativos': return contratosAgrupados.ativos;
              case 'inativos': return contratosAgrupados.inativos;
              default: return [];
          }
      }
  }, [activeContratoTab, isAdmin, contratosAgrupados, filtroTexto, contratos]);
  
  const isSupervisao = isAdmin && activeContratoTab === 'contratos_clientes';
  // CORREÇÃO: Garante que o resultado seja estritamente booleano
  const canCreateContract = isAdmin || (!!empresaId && !isSupervisao);

  const handleOpenAcoes = (contrato: ContratoGerado) => {
      setContratoSelecionado(contrato);
      setAcoesDialogOpen(true);
  };
  
  const handleEditContract = (contrato: ContratoGerado) => {
      // Navegação precisa ser feita aqui, pois o hook não tem acesso ao navigate
      window.location.href = `/contratos/preencher/${contrato.modelo_id}?contratoId=${contrato.id}`;
  };

  if (carregandoSessao) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }

  if (!empresaId && !isAdmin) {
      return (
          <LayoutPrincipal>
              <Card><CardContent className="p-6">Você não tem permissão para gerenciar contratos.</CardContent></Card>
          </LayoutPrincipal>
      );
  }

  return (
    <LayoutPrincipal>
      
      <ContratosHeader
          contratosParaExibir={contratosParaExibir}
          isSupervisao={isSupervisao}
          canCreateContract={canCreateContract}
          filtroTexto={filtroTexto}
          setFiltroTexto={setFiltroTexto}
          filtroStatus={filtroStatus}
          setFiltroStatus={setFiltroStatus}
          ordenacao={ordenacao}
          setOrdenacao={setOrdenacao}
          activeContratoTab={activeContratoTab}
      />

      <Tabs value={activeContratoTab} onValueChange={setActiveContratoTab} className="w-full">
        {/* Ajuste: Usando flex-wrap e definindo a largura dos itens para quebrar em mobile */}
        <TabsList className={cn("flex flex-wrap justify-start w-full h-auto p-1")}>
          {isAdmin && <TabsTrigger value="meus_contratos" className="flex-1 sm:flex-auto">Meus Contratos ({contratosAgrupados.meusContratos.length})</TabsTrigger>}
          {isAdmin && <TabsTrigger value="contratos_clientes" className="flex-1 sm:flex-auto">Clientes ({contratosAgrupados.contratosClientes.length})</TabsTrigger>}
          <TabsTrigger value="pendentes" className="flex-1 sm:flex-auto">Pendentes ({contratosAgrupados.pendentes.length})</TabsTrigger>
          <TabsTrigger value="ativos" className="flex-1 sm:flex-auto">Ativos ({contratosAgrupados.ativos.length})</TabsTrigger>
          <TabsTrigger value="inativos" className="flex-1 sm:flex-auto">Inativos ({contratosAgrupados.inativos.length})</TabsTrigger>
        </TabsList>
        
        {/* ABA DE CONTRATOS DE CLIENTES (APENAS ADMIN) */}
        {isAdmin && activeContratoTab === 'contratos_clientes' && (
            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500 rounded-md mt-4">
                <p className="text-sm text-yellow-700 dark:text-yellow-300 font-semibold flex items-center">
                    <Building2 className="w-4 h-4 mr-2" /> Modo Supervisão: Visualizando contratos de todas as empresas clientes.
                </p>
            </div>
        )}
        
        {/* Conteúdo das Tabs */}
        <TabsContent value={activeContratoTab} className="mt-4">
            <Card>
                <CardHeader><CardTitle className="text-xl">Contratos ({contratosParaExibir.length})</CardTitle></CardHeader>
                <CardContent>
                    {filtroTexto.trim() && (
                        <p className="text-sm text-muted-foreground mb-3">
                            Exibindo resultados de todas as abas para "{filtroTexto}"
                        </p>
                    )}
                    <ContratosTable
                        list={contratosParaExibir}
                        isSupervisao={isSupervisao}
                        empresaId={empresaId}
                        carregando={carregando}
                        handleOpenAcoes={handleOpenAcoes}
                        handleEditContract={handleEditContract}
                        handleDeleteContract={handleDeleteContract}
                        handleBlockContract={handleBlockContract}
                        handleReactivateContract={handleReactivateContract}
                    />
                </CardContent>
            </Card>
        </TabsContent>
        
      </Tabs>
      
      <ContratoAcoesDialog
        contrato={contratoSelecionado}
        open={acoesDialogOpen}
        onOpenChange={setAcoesDialogOpen}
      />
    </LayoutPrincipal>
  );
};

export default Contratos;