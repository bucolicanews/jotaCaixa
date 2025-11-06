import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoGerado } from '@/types/contratos';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, FileSignature, CheckCircle2, Printer } from 'lucide-react';
import { usePrint } from '@/hooks/use-print';

const AssinarContrato: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { printContent } = usePrint();
  
  const [contrato, setContrato] = useState<ContratoGerado | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContrato = useCallback(async () => {
    if (!id) {
      setError('ID do contrato não fornecido.');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    // Busca o contrato. Como esta é uma rota pública, a RLS deve ser configurada
    // para permitir leitura de contratos pendentes/ativos por qualquer um (ou usamos RLS bypass se fosse uma Edge Function).
    // Por enquanto, confiamos que o RLS permite a leitura de contratos gerados.
    const { data, error: fetchError } = await supabase
      .from('contratos_gerados')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('Erro ao carregar contrato:', fetchError);
      setError('Contrato não encontrado ou acesso negado.');
    } else {
      setContrato(data as ContratoGerado);
      // Verifica se o contrato já está assinado/concluído
      if (data.status === 'ativo' || data.status === 'concluido') {
          showSuccess('Este contrato já foi assinado.');
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchContrato();
  }, [fetchContrato]);

  const handleAssinar = async () => {
    if (!contrato || contrato.status === 'ativo' || contrato.status === 'concluido') return;
    
    setIsSigning(true);
    
    try {
      // 1. Atualizar o status do contrato para 'ativo'
      const { error: updateError } = await supabase
        .from('contratos_gerados')
        .update({ 
            status: 'ativo', 
            documento_assinado_url: 'Assinado Eletronicamente', // Simulação de URL de documento assinado
            updated_at: new Date().toISOString(),
        })
        .eq('id', contrato.id);

      if (updateError) throw updateError;
      
      // 2. Atualizar o estado local
      setContrato(prev => prev ? { ...prev, status: 'ativo', documento_assinado_url: 'Assinado Eletronicamente' } : null);
      showSuccess('Contrato assinado com sucesso!');

    } catch (error: any) {
      showError('Falha ao assinar contrato: ' + error.message);
    } finally {
      setIsSigning(false);
    }
  };
  
  const handlePrint = () => {
    if (!contrato?.conteudo_renderizado) {
        showError('Conteúdo do contrato não disponível para impressão.');
        return;
    }
    
    const isHtml = contrato.valores_tags_preenchidos?.tipo_conteudo === 'html';
    let printHtml = contrato.conteudo_renderizado;
    
    if (!isHtml) {
        printHtml = `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${printHtml}</pre>`;
    }
    
    printContent(printHtml, `Contrato Assinatura - ${contrato.id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !contrato) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 text-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Erro de Contrato</CardTitle>
            <CardDescription>{error || 'Contrato não encontrado.'}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  const isAssinado = contrato.status === 'ativo' || contrato.status === 'concluido';
  const isHtml = contrato.valores_tags_preenchidos?.tipo_conteudo === 'html';
  
  const contentToDisplay = contrato.conteudo_renderizado ? (
    isHtml ? (
        <div dangerouslySetInnerHTML={{ __html: contrato.conteudo_renderizado }} />
    ) : (
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{contrato.conteudo_renderizado}</pre>
    )
  ) : (
    <p className="text-center text-muted-foreground">Conteúdo não renderizado.</p>
  );

  return (
    <div className="min-h-screen flex flex-col items-center bg-background p-4 md:p-8">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="text-3xl flex items-center">
            <FileSignature className="w-6 h-6 mr-2" /> {contrato.valores_tags_preenchidos?.titulo || 'Contrato para Assinatura'}
          </CardTitle>
          <CardDescription>
            Status: {isAssinado ? <span className="text-green-600 font-semibold">Assinado</span> : <span className="text-yellow-600 font-semibold">Pendente de Assinatura</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Conteúdo do Contrato */}
          <div className="border rounded-md p-6 bg-card shadow-inner max-h-[60vh] overflow-y-auto">
            {contentToDisplay}
          </div>
          
          {/* Ações */}
          <div className="flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0 sm:space-x-4 pt-4 border-t">
            
            <Button 
                onClick={handlePrint} 
                variant="outline" 
                className="w-full sm:w-auto"
            >
                <Printer className="w-4 h-4 mr-2" /> Baixar PDF / Imprimir
            </Button>
            
            {isAssinado ? (
              <Button disabled className="w-full sm:w-auto bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="w-4 h-4 mr-2" /> Contrato Assinado
              </Button>
            ) : (
              <Button 
                onClick={handleAssinar} 
                disabled={isSigning}
                className="w-full sm:w-auto bg-primary hover:bg-primary/90"
              >
                {isSigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSignature className="mr-2 h-4 w-4" />}
                Assinar Contrato Eletronicamente
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AssinarContrato;