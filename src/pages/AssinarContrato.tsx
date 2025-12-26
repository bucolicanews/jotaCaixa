import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoGerado } from '@/types/contratos';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, FileSignature, CheckCircle2, Printer, Camera, Mail, Building2 } from 'lucide-react';
import { usePrint } from '@/hooks/use-print';
import CameraCapture from '@/components/CameraCapture';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';

const AssinarContrato: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { printContent } = usePrint();
  
  const [contrato, setContrato] = useState<ContratoGerado | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Campos de Assinatura do Cliente
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [selfieFile, setSelfieFile] = useState<File | null>(null); 

  const fetchContrato = useCallback(async () => {
    if (!id) {
      setError('ID do contrato não fornecido.');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    // USANDO RPC PÚBLICA PARA BYPASSAR RLS
    const { data, error: fetchError } = await supabase
      .rpc('get_public_contract_info', { p_contract_id: id });

    if (fetchError) {
      console.error('Erro ao carregar contrato:', fetchError);
      setError('Contrato não encontrado ou acesso negado.');
    } else if (!data || data.length === 0) {
      setError('Contrato não encontrado.');
    } else {
      const contratoData = data[0] as ContratoGerado;
      setContrato(contratoData);
      if (contratoData.status === 'ativo' || contratoData.status === 'concluido') {
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
    // Caminho direto no bucket (a policy agora permite insert público em 'contrato_self')
    const fileName = `public/${contrato!.id}/assinatura-cliente-${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
      .from('contrato_self')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error("LOG: Erro detalhado do Supabase Storage:", error);
      throw new Error('Falha ao fazer upload da selfie. Tente novamente.');
    }

    const { data: publicUrlData } = supabase.storage.from('contrato_self').getPublicUrl(fileName);
    return publicUrlData.publicUrl;
  };
  
  const sendSignedContractEmail = async (contratoId: string, clienteEmail: string) => {
      try {
          const { data, error } = await supabase.functions.invoke('send-signed-contract', {
              body: { contratoId, clienteEmail },
          });
          
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          
          showSuccess('Cópia do contrato assinado enviada para o seu email!');
      } catch (error: any) {
          console.error('Erro ao enviar email:', error);
          showError('Contrato assinado, mas falha ao enviar email: ' + error.message);
      }
  };

  const handleAssinar = async () => {
    if (!contrato || contrato.status === 'ativo' || contrato.status === 'concluido') return;
    
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
      const selfieUrl = await uploadSelfie(selfieFile);
      
      const { data: success, error: rpcError } = await supabase.rpc('sign_contract_public', {
          p_contract_id: contrato.id,
          p_assinatura_nome: nomeCompleto,
          p_assinatura_selfie_url: selfieUrl
      });

      if (rpcError) throw rpcError;
      if (!success) throw new Error('Falha ao registrar assinatura. Verifique se o contrato já não foi assinado.');
      
      const updatedContrato = { 
          ...contrato, 
          status: 'ativo' as const, 
          documento_assinado_url: 'Assinado Eletronicamente',
          assinatura_nome: nomeCompleto,
          assinatura_selfie_url: selfieUrl,
          updated_at: new Date().toISOString()
      };
      setContrato(updatedContrato);
      showSuccess('Contrato assinado com sucesso!');
      
      const clienteEmail = contrato.valores_tags_preenchidos?.['{{CLIENTE_EMAIL}}'];
      if (clienteEmail) {
          await sendSignedContractEmail(contrato.id, clienteEmail);
      }

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
    
    let finalContent = contrato.conteudo_renderizado;
    
    // Verificação robusta para saber se é HTML
    const tipoConteudo = contrato.valores_tags_preenchidos?.tipo_conteudo;
    const isHtml = tipoConteudo === 'html' || !tipoConteudo || contrato.conteudo_renderizado.includes('<');
    
    const isAssinado = contrato.status === 'ativo' || contrato.status === 'concluido';
    
    const clienteNome = contrato.assinatura_nome || contrato.valores_tags_preenchidos?.['{{CLIENTE_NOME}}'] || 'Cliente Contratado';
    const clienteDocumento = contrato.valores_tags_preenchidos?.['{{CLIENTE_DOCUMENTO}}'] || contrato.valores_tags_preenchidos?.['{{CLIENTE_CPF}}'] || contrato.valores_tags_preenchidos?.['{{CLIENTE_CNPJ}}'] || 'Documento Não Informado';
    const dataAssinatura = isAssinado && contrato.updated_at ? format(new Date(contrato.updated_at), 'dd/MM/yyyy HH:mm') : 'Pendente';
    
    const clienteSignatureBlock = isAssinado ? `
        <div style="text-align: center; margin-top: 20px; font-size: 10pt;">
            ${contrato.assinatura_selfie_url ? `<img src="${contrato.assinatura_selfie_url}" style="max-height: 50px; margin-bottom: 5px;" />` : '_________________________'}
            <div style="border-top: 1px solid #000; padding-top: 5px; font-size: 12px; font-weight: bold;">
                ${clienteNome}
            </div>
            <p style="font-size: 10px; margin: 2px 0;">CPF/CNPJ: ${clienteDocumento}</p>
            <p style="font-size: 10px; margin: 2px 0;">Data Assinatura: ${dataAssinatura}</p>
            <p style="font-size: 10px; margin-top: 5px;">Contratado (Cliente)</p>
        </div>
    ` : `
        <div style="text-align: center; margin-top: 20px; font-size: 10pt;">
            <div style="border-top: 1px solid #000; padding-top: 5px; font-size: 12px; font-weight: bold;">
                ${clienteNome}
            </div>
            <p style="font-size: 10px; margin-top: 5px;">Pendente de Assinatura</p>
        </div>
    `;
    
    const empresaSignatureBlock = `
        <div style="text-align: center; margin-top: 20px; font-size: 10pt;">
            ${contrato.assinatura_proprietario_url ? `<img src="${contrato.assinatura_proprietario_url}" style="max-height: 50px; margin-bottom: 5px;" />` : '_________________________'}
            <div style="border-top: 1px solid #000; padding-top: 5px; font-size: 12px; font-weight: bold;">
                ${contrato.assinatura_proprietario_nome || 'Empresa Contratante'}
            </div>
            <p style="font-size: 10px; margin-top: 5px;">Contratante (Empresa)</p>
        </div>
    `;
    
    finalContent = finalContent.replace(/\{\{ASSINATURA_EMPRESA\}\}/g, empresaSignatureBlock);
    finalContent = finalContent.replace(/\{\{ASSINATURA_CLIENTE\}\}/g, clienteSignatureBlock);
    
    if (isHtml) {
        const validationRodape = `
            <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ccc; page-break-before: avoid; text-align: center; font-size: 10px;">
                <p>Documento gerado e assinado eletronicamente. Validade jurídica conforme MP 2.200-2/2001.</p>
            </div>
        `;
        const bodyEndIndex = finalContent.toLowerCase().lastIndexOf('</body>');
        if (bodyEndIndex !== -1) {
            finalContent = finalContent.substring(0, bodyEndIndex) + validationRodape + finalContent.substring(bodyEndIndex);
        } else {
            finalContent += validationRodape;
        }
    } else {
        finalContent = `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${finalContent}</pre>`;
        finalContent += `\n\n--- Assinaturas ---\nContratante: ${contrato.assinatura_proprietario_nome || 'Empresa'}\nContratado: ${clienteNome}\nDocumento: ${clienteDocumento}\nData: ${dataAssinatura}\n\n(Documento assinado eletronicamente)`;
    }
    
    const logoUrl = contrato.assinatura_proprietario_url;
    const ownerName = contrato.assinatura_proprietario_nome || 'Empresa Contratante';
    
    let headerHtml = '';
    if (logoUrl) {
        headerHtml = `
            <div class="print-header" style="display: flex; flex-direction: column; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px;">
                <img src="${logoUrl}" alt="${ownerName}" class="print-logo" style="max-height: 50px; max-width: 150px; object-fit: contain; margin-bottom: 5px;" />
                <h1 style="font-size: 14px; font-weight: bold; margin: 0; text-align: left;">${ownerName}</h1>
            </div>
        `;
    }
    
    const finalPrintHtml = `
        ${headerHtml}
        <div style="padding-top: 10px;">
            ${finalContent}
        </div>
    `;
    
    printContent(finalPrintHtml, `Contrato Assinatura - ${contrato.id}`);
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
  
  // FIX: Verificação mais abrangente para determinar se é HTML
  const tipoConteudo = contrato.valores_tags_preenchidos?.tipo_conteudo;
  // Considera HTML se a flag for 'html', se não tiver flag (legado), ou se contiver tags HTML explícitas
  const isContentHtml = tipoConteudo === 'html' || !tipoConteudo || (contrato.conteudo_renderizado && contrato.conteudo_renderizado.includes('<'));
  
  const contentToDisplay = contrato.conteudo_renderizado ? (
    isContentHtml ? (
        <div 
            className="ql-editor" // Classe essencial para formatação correta (alinhamentos, etc)
            dangerouslySetInnerHTML={{ __html: contrato.conteudo_renderizado }} 
        />
    ) : (
        <pre className="whitespace-pre-wrap font-sans text-sm">{contrato.conteudo_renderizado}</pre>
    )
  ) : (
    <p className="text-center text-muted-foreground">Conteúdo não renderizado.</p>
  );

  const isReadyToSign = nomeCompleto.trim().length > 0 && !!selfieFile;
  const proprietarioNome = contrato.assinatura_proprietario_nome || 'Empresa Contratante';
  const proprietarioUrl = contrato.assinatura_proprietario_url;

  return (
    <div className="min-h-screen flex flex-col items-center bg-background p-4 md:p-8">
      <Card className="w-full max-w-full md:max-w-4xl"> 
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl flex items-center">
            <FileSignature className="w-6 h-6 mr-2" /> {contrato.valores_tags_preenchidos?.titulo || 'Contrato para Assinatura'}
          </CardTitle>
          <CardDescription>
            Status: {isAssinado ? <span className="text-green-600 font-semibold">Assinado</span> : <span className="text-yellow-600 font-semibold">Pendente de Assinatura</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Conteúdo do Contrato */}
          <div className="border rounded-md p-4 md:p-6 bg-card shadow-inner max-h-[70vh] overflow-y-auto">
            {contentToDisplay}
          </div>
          
          {/* Seção de Assinatura */}
          <div className="pt-4 border-t space-y-4">
              <h3 className="text-xl font-semibold flex items-center"><FileSignature className="w-5 h-5 mr-2" /> Assinaturas</h3>
              
              {/* Assinatura do Proprietário (Empresa) */}
              <div className="p-4 bg-secondary rounded-md space-y-2">
                  <div className="flex items-center space-x-3">
                      {proprietarioUrl ? (
                          <img src={proprietarioUrl} alt="Logo" className="w-10 h-10 object-contain" />
                      ) : (
                          <Building2 className="w-8 h-8 text-primary" />
                      )}
                      <div>
                          <p className="font-semibold">{proprietarioNome}</p>
                          <p className="text-sm text-muted-foreground">Contratante (Assinatura Automática)</p>
                      </div>
                  </div>
              </div>
              
              {/* Assinatura do Cliente (Contratado) */}
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
                      <Button variant="link" size="sm" onClick={() => sendSignedContractEmail(contrato.id, contrato.valores_tags_preenchidos?.['{{CLIENTE_EMAIL}}'])} className="h-auto p-0 text-blue-600 hover:text-blue-700 flex items-center">
                          <Mail className="w-4 h-4 mr-1" /> Reenviar Cópia Assinada
                      </Button>
                  </div>
              ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4 md:col-span-1">
                          <div className="space-y-2">
                              <Label htmlFor="nome-completo">Seu Nome Completo (Assinante)</Label>
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
                      
                      <div className="flex flex-col justify-end md:col-span-1">
                          <Button 
                              onClick={handleAssinar} 
                              disabled={isSigning || !isReadyToSign}
                              className="w-full h-12 text-lg bg-green-600 hover:bg-green-700"
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