import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { cn } from '@/lib/utils';

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
    
    // Busca todos os campos, incluindo os novos de assinatura do proprietário
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
    // CORREÇÃO: Adiciona 'public/' no início do caminho para satisfazer a política de RLS
    const fileName = `public/${contrato!.id}/assinatura-cliente-${Date.now()}.${fileExt}`;
    const filePath = fileName;

    const { error } = await supabase.storage
      .from('contrato_self')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error("LOG: Erro detalhado do Supabase Storage:", error);
      throw new Error('Falha ao fazer upload da selfie. Verifique se o bucket "contrato_self" existe e tem permissão de RLS pública.');
    }

    const { data: publicUrlData } = supabase.storage.from('contrato_self').getPublicUrl(filePath);
    return publicUrlData.publicUrl;
  };
  
  // NOVO: Função para enviar o contrato assinado por email (usando Edge Function)
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
          showError('Falha ao enviar cópia do contrato por email: ' + error.message);
      }
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
      const updatedContrato = { 
          ...contrato, 
          status: 'ativo' as const, 
          documento_assinado_url: 'Assinado Eletronicamente',
          assinatura_nome: nomeCompleto,
          assinatura_selfie_url: selfieUrl,
      };
      setContrato(updatedContrato);
      showSuccess('Contrato assinado com sucesso!');
      
      // 4. Enviar cópia para o cliente (se o email estiver disponível nas tags)
      const clienteEmail = contrato.valores_tags_preenchidos?.['{{CLIENTE_EMAIL}}'];
      if (clienteEmail) {
          await sendSignedContractEmail(contrato.id, clienteEmail);
      } else {
          showError('Email do cliente não encontrado nas tags para envio de cópia.');
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
    
    const isHtml = contrato.valores_tags_preenchidos?.tipo_conteudo === 'html';
    let printHtml = contrato.conteudo_renderizado;
    
    // Adiciona a seção de assinaturas ao final do HTML para impressão
    const assinaturasHtml = `
        <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ccc; page-break-before: avoid;">
            <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 20px;">Assinaturas</h3>
            <div style="display: flex; justify-content: space-around; text-align: center;">
                <div style="width: 45%;">
                    ${contrato.assinatura_proprietario_url ? `<img src="${contrato.assinatura_proprietario_url}" style="max-height: 50px; margin-bottom: 5px;" />` : ''}
                    <div style="border-top: 1px solid #000; padding-top: 5px; font-size: 12px;">
                        ${contrato.assinatura_proprietario_nome || 'Empresa Contratante'}
                    </div>
                    <p style="font-size: 10px; margin-top: 5px;">Contratante (Empresa)</p>
                </div>
                <div style="width: 45%;">
                    ${contrato.assinatura_selfie_url ? `<img src="${contrato.assinatura_selfie_url}" style="max-height: 50px; margin-bottom: 5px;" />` : ''}
                    <div style="border-top: 1px solid #000; padding-top: 5px; font-size: 12px;">
                        ${contrato.assinatura_nome || 'Cliente Contratado'}
                    </div>
                    <p style="font-size: 10px; margin-top: 5px;">Contratado (Cliente)</p>
                </div>
            </div>
            <p style="font-size: 10px; text-align: center; margin-top: 20px;">
                Documento assinado eletronicamente em ${isAssinado ? format(new Date(contrato.updated_at), 'dd/MM/yyyy HH:mm') : 'Pendente'}.
            </p>
        </div>
    `;
    
    if (isHtml) {
        // Tenta injetar antes do </body>
        const bodyEndIndex = printHtml.toLowerCase().lastIndexOf('</body>');
        if (bodyEndIndex !== -1) {
            printHtml = printHtml.substring(0, bodyEndIndex) + assinaturasHtml + printHtml.substring(bodyEndIndex);
        } else {
            printHtml += assinaturasHtml;
        }
    } else {
        printHtml += `\n\n--- Assinaturas ---\nContratante: ${contrato.assinatura_proprietario_nome || 'Empresa'}\nContratado: ${contrato.assinatura_nome || 'Cliente'}\nData: ${isAssinado ? format(new Date(contrato.updated_at), 'dd/MM/yyyy HH:mm') : 'Pendente'}`;
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

  const isReadyToSign = nomeCompleto.trim().length > 0 && !!selfieFile;
  
  // Dados da Assinatura do Proprietário
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