import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoGerado } from '@/types/contratos';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, FileSignature, CheckCircle2, Printer, Camera } from 'lucide-react';
import { usePrint } from '@/hooks/use-print';
import CameraCapture from '@/components/CameraCapture';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const AssinarContrato: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { printContent } = usePrint();
  
  const [contrato, setContrato] = useState<ContratoGerado | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Campos de Assinatura
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [selfieFile, setSelfieFile] = useState<File | null>(null); 

  const fetchContrato = useCallback(async () => {
    if (!id) {
      setError('ID do contrato não fornecido.');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
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
      if (data.status === 'ativo' || data.status === 'concluido') {
          showSuccess('Este contrato já foi assinado.');
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchContrato();
  }, [fetchContrato]);
  
  const handleCapture = useCallback((file: File) => {
    setSelfieFile(file);
  }, []);

  const handleResetSelfie = useCallback(() => {
    setSelfieFile(null);
  }, []);
  
  const uploadSelfie = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${contrato!.id}/assinatura-${Date.now()}.${fileExt}`;
    const filePath = `${contrato!.id}/${fileName}`;

    const { error } = await supabase.storage // Corrigido: removido 'data: uploadData'
      .from('contrato-assinaturas')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error("LOG: Erro detalhado do Supabase Storage:", error);
      throw new Error('Falha ao fazer upload da selfie: ' + error.message);
    }

    const { data: publicUrlData } = supabase.storage.from('contrato-assinaturas').getPublicUrl(filePath);
    return publicUrlData.publicUrl;
  };

  const handleAssinar = async () => {
    if (!contrato || contrato.status === 'ativo' || contrato.status === 'concluido') return;
    
    // Validação de Nome e Selfie
    if (!nomeCompleto.trim()) {
        showError('O nome completo é obrigatório.');
        return;
    }
    if (!selfieFile) {
        showError('A captura da selfie é obrigatória para a assinatura.');
        return;
    }
    
    setIsSigning(true);
    
    try {
      // 1. Upload da Selfie
      const selfieUrl = await uploadSelfie(selfieFile);
      
      // 2. Atualizar o status do contrato para 'ativo' e salvar os dados de assinatura
      const { error: updateError } = await supabase
        .from('contratos_gerados')
        .update({ 
            status: 'ativo', 
            documento_assinado_url: 'Assinado Eletronicamente', 
            assinatura_nome: nomeCompleto, 
            assinatura_selfie_url: selfieUrl, 
        })
        .eq('id', contrato.id);

      if (updateError) throw updateError;
      
      // 3. Atualizar o estado local
      setContrato(prev => prev ? { 
          ...prev, 
          status: 'ativo', 
          documento_assinado_url: 'Assinado Eletronicamente',
          assinatura_nome: nomeCompleto,
          assinatura_selfie_url: selfieUrl,
      } : null);
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
    
    // Corrigido: usando 'valores_tags_preenchidos'
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
  // Corrigido: usando 'valores_tags_preenchidos'
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

  const isReadyToSign = nomeCompleto.trim().length > 0 && !!selfieFile;

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
          
          {/* Seção de Assinatura */}
          <div className="pt-4 border-t space-y-4">
              <h3 className="text-xl font-semibold flex items-center"><FileSignature className="w-5 h-5 mr-2" /> Assinatura Eletrônica</h3>
              
              {isAssinado ? (
                  <div className="p-4 bg-green-100 dark:bg-green-900/20 rounded-md space-y-2">
                      <p className="font-semibold text-green-700 dark:text-green-300 flex items-center">
                          <CheckCircle2 className="w-5 h-5 mr-2" /> Contrato assinado por {contrato.assinatura_nome || 'N/A'}.
                      </p>
                      {contrato.assinatura_selfie_url && (
                          <a href={contrato.assinatura_selfie_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center">
                              <Camera className="w-4 h-4 mr-1" /> Visualizar Selfie de Assinatura
                          </a>
                      )}
                  </div>
              ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                          <div className="space-y-2">
                              <Label htmlFor="nome-completo">Nome Completo (Assinante)</Label>
                              <Input 
                                  id="nome-completo"
                                  value={nomeCompleto}
                                  onChange={(e) => setNomeCompleto(e.target.value)}
                                  placeholder="Seu Nome Completo"
                                  disabled={isSigning}
                              />
                          </div>
                          <div className="space-y-2">
                              <Label className="flex items-center"><Camera className="w-4 h-4 mr-2" /> Captura Facial (Selfie)</Label>
                              <CameraCapture 
                                  onCapture={handleCapture} 
                                  onReset={handleResetSelfie} 
                                  capturedFile={selfieFile}
                              />
                          </div>
                      </div>
                      
                      <div className="flex flex-col justify-end">
                          <Button 
                              onClick={handleAssinar} 
                              disabled={isSigning || !isReadyToSign}
                              className="w-full h-12 bg-primary hover:bg-primary/90"
                          >
                              {isSigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSignature className="mr-2 h-4 w-4" />}
                              Assinar Contrato Eletronicamente
                          </Button>
                      </div>
                  </div>
              )}
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
            
            {isAssinado && (
              <Button disabled className="w-full sm:w-auto bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="w-4 h-4 mr-2" /> Contrato Assinado
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AssinarContrato;