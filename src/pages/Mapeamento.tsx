import React, { useEffect, useState } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link2, Loader2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';
import { useMapeamento } from '@/hooks/useMapeamento';
import { TabelaMapeadas } from '@/components/mapeamento/TabelaMapeadas';
import { TabelaNaoMapeadas } from '@/components/mapeamento/TabelaNaoMapeadas';
import { TabelaParcelasNaoMapeadas } from '@/components/mapeamento/TabelaParcelasNaoMapeadas';
import { MapearExtratoDialog } from '@/components/mapeamento/MapearExtratoDialog';
import { EditarMapeamentoDialog } from '@/components/mapeamento/EditarMapeamentoDialog';
import { ExtratoMapeado, ExtratoNaoMapeado, ParcelaSugestao } from '@/types/extrato';

const Mapeamento: React.FC = () => {
  const { usuario, carregando: carregandoSessao } = useSessao();
  const {
    extratosMapeados,
    extratosNaoMapeados,
    parcelasCPNaoMapeadas,
    parcelasCRNaoMapeadas,
    carregando,
    fetchExtratosMapeados,
    fetchExtratosNaoMapeados,
    fetchParcelasCPNaoMapeadas,
    fetchParcelasCRNaoMapeadas,
    buscarParcelasSugestao,
    mapearExtrato,
    desmapearExtrato,
    editarMapeamento,
    deletarExtrato,
  } = useMapeamento();

  const [abaSelecionada, setAbaSelecionada] = useState('extratos-nao-mapeados');
  
  const [dialogMapear, setDialogMapear] = useState(false);
  const [extratoParaMapear, setExtratoParaMapear] = useState<ExtratoNaoMapeado | null>(null);
  const [sugestoesParcelas, setSugestoesParcelas] = useState<ParcelaSugestao[]>([]);
  const [carregandoSugestoes, setCarregandoSugestoes] = useState(false);
  
  const [dialogEditar, setDialogEditar] = useState(false);
  const [extratoParaEditar, setExtratoParaEditar] = useState<ExtratoMapeado | null>(null);

  useEffect(() => {
    if (!carregandoSessao && usuario?.id) {
      fetchExtratosMapeados();
      fetchExtratosNaoMapeados();
      fetchParcelasCPNaoMapeadas();
      fetchParcelasCRNaoMapeadas();
    }
  }, [carregandoSessao, usuario?.id, fetchExtratosMapeados, fetchExtratosNaoMapeados, fetchParcelasCPNaoMapeadas, fetchParcelasCRNaoMapeadas]);

  const handleAbrirMapear = async (extrato: ExtratoNaoMapeado) => {
    setExtratoParaMapear(extrato);
    setDialogMapear(true);
    setCarregandoSugestoes(true);
    
    const sugestoes = await buscarParcelasSugestao(extrato);
    setSugestoesParcelas(sugestoes);
    setCarregandoSugestoes(false);
  };

  const handleConfirmarMapear = async (parcelaId: string | null, tipo: 'CP' | 'CR' | null, contaContabilId?: string) => {
    if (!extratoParaMapear) return;
    
    const sucesso = await mapearExtrato(extratoParaMapear.id, parcelaId, tipo, contaContabilId);
    if (sucesso) {
      await fetchExtratosMapeados();
      await fetchExtratosNaoMapeados();
      await fetchParcelasCPNaoMapeadas();
      await fetchParcelasCRNaoMapeadas();
    }
  };

  const handleAbrirEditar = (extrato: ExtratoMapeado) => {
    setExtratoParaEditar(extrato);
    setDialogEditar(true);
  };

  const handleConfirmarEditar = async (extratoId: string, contaContabilId: string) => {
    const sucesso = await editarMapeamento(extratoId, contaContabilId);
    if (sucesso) {
      await fetchExtratosMapeados();
    }
  };

  const handleDesmapear = async (extratoId: string) => {
    const sucesso = await desmapearExtrato(extratoId);
    if (sucesso) {
      await fetchExtratosMapeados();
      await fetchExtratosNaoMapeados();
      await fetchParcelasCPNaoMapeadas();
      await fetchParcelasCRNaoMapeadas();
    }
  };

  const handleDeletar = async (extratoId: string) => {
    const sucesso = await deletarExtrato(extratoId);
    if (sucesso) {
      await fetchExtratosMapeados();
      await fetchExtratosNaoMapeados();
    }
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

  if (!usuario?.id) {
    return (
      <LayoutPrincipal>
        <Card>
          <CardContent className="p-6">
            Voce nao esta vinculado a uma empresa para ver mapeamentos.
          </CardContent>
        </Card>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <Link2 className="w-6 h-6 mr-2" /> Mapeamento de Extratos e Parcelas
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Gerenciar Vinculos entre Extratos e Parcelas</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={abaSelecionada} onValueChange={setAbaSelecionada}>
            <TabsList className="mb-4 flex-wrap h-auto gap-1">
              <TabsTrigger value="extratos-nao-mapeados" className="flex items-center gap-1">
                Extratos Nao Mapeados ({extratosNaoMapeados.length})
              </TabsTrigger>
              <TabsTrigger value="extratos-mapeados" className="flex items-center gap-1">
                Extratos Mapeados ({extratosMapeados.length})
              </TabsTrigger>
              <TabsTrigger value="parcelas-cp" className="flex items-center gap-1">
                <ArrowDownCircle className="w-4 h-4" />
                CP Nao Mapeadas ({parcelasCPNaoMapeadas.length})
              </TabsTrigger>
              <TabsTrigger value="parcelas-cr" className="flex items-center gap-1">
                <ArrowUpCircle className="w-4 h-4" />
                CR Nao Mapeadas ({parcelasCRNaoMapeadas.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="extratos-nao-mapeados">
              <TabelaNaoMapeadas
                extratos={extratosNaoMapeados}
                carregando={carregando}
                onMapear={handleAbrirMapear}
                onDeletar={handleDeletar}
              />
            </TabsContent>

            <TabsContent value="extratos-mapeados">
              <TabelaMapeadas
                extratos={extratosMapeados}
                carregando={carregando}
                onEditar={handleAbrirEditar}
                onDesmapear={handleDesmapear}
                onDeletar={handleDeletar}
              />
            </TabsContent>

            <TabsContent value="parcelas-cp">
              <div className="mb-4 p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  Parcelas de Contas a Pagar que ainda nao foram vinculadas a nenhum extrato bancario.
                </p>
              </div>
              <TabelaParcelasNaoMapeadas
                parcelas={parcelasCPNaoMapeadas}
                carregando={carregando}
                tipo="CP"
              />
            </TabsContent>

            <TabsContent value="parcelas-cr">
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Parcelas de Contas a Receber que ainda nao foram vinculadas a nenhum extrato bancario.
                </p>
              </div>
              <TabelaParcelasNaoMapeadas
                parcelas={parcelasCRNaoMapeadas}
                carregando={carregando}
                tipo="CR"
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <MapearExtratoDialog
        open={dialogMapear}
        onOpenChange={setDialogMapear}
        extrato={extratoParaMapear}
        sugestoes={sugestoesParcelas}
        carregandoSugestoes={carregandoSugestoes}
        onConfirmar={handleConfirmarMapear}
      />

      <EditarMapeamentoDialog
        open={dialogEditar}
        onOpenChange={setDialogEditar}
        extrato={extratoParaEditar}
        onConfirmar={handleConfirmarEditar}
      />
    </LayoutPrincipal>
  );
};

export default Mapeamento;
