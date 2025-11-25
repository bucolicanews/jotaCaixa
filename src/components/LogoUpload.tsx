import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Image, Trash2, Link as LinkIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { Separator } from './ui/separator';
import { Checkbox } from './ui/checkbox';

interface LogoUploadProps {
  ownerId: string;
  tableName: 'tbl_admins' | 'tbl_clientes'; // Tabela de destino
  initialLogoUrl: string | null | undefined;
  onUploadComplete: (url: string | null) => void; // Callback para notificar o formulário pai
  isReadOnly: boolean;
  
  // NOVO PROP: Callback para sincronizar a URL com o campo de assinatura
  onSyncUrl: (url: string | null) => void;
}

const LOGO_BUCKET = 'logos-admin';

// Função auxiliar para limpar o cache-buster
const cleanUrl = (url: string | null | undefined): string => {
    if (!url) return '';
    return url.split('?')[0];
};

const LogoUpload: React.FC<LogoUploadProps> = ({ ownerId, tableName, initialLogoUrl, onUploadComplete, isReadOnly, onSyncUrl }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  // currentUrl: URL completa (com cache-buster) usada para exibição e salvamento
  const [currentUrl, setCurrentUrl] = useState(initialLogoUrl || '');
  // manualUrl: URL limpa (sem cache-buster) usada para o input de texto
  const [manualUrl, setManualUrl] = useState(cleanUrl(initialLogoUrl));
  const [useAsSignature, setUseAsSignature] = useState(!!initialLogoUrl);

  // Sincroniza o estado interno com a prop inicial
  useEffect(() => {
      setCurrentUrl(initialLogoUrl || '');
      setManualUrl(cleanUrl(initialLogoUrl));
      setUseAsSignature(!!initialLogoUrl); 
  }, [initialLogoUrl]);
  
  // Efeito para sincronizar a URL com o campo de assinatura no formulário pai
  useEffect(() => {
      // Se estiver marcado para usar como assinatura, envia a URL atual (com cache-buster).
      // Se não estiver marcado, envia NULL.
      if (useAsSignature) {
          onSyncUrl(currentUrl);
      } else if (!useAsSignature && currentUrl) {
          // Se desmarcou, limpa o campo de assinatura no formulário pai, mas mantém a URL no DB até o save.
          onSyncUrl(null);
      }
  }, [useAsSignature, currentUrl, onSyncUrl]);

  const handleFileUpload = async () => {
    if (!file || !ownerId) return;
    
    setLoading(true);

    try {
      const fileExt = file.name.split('.').pop();
      // Usamos um nome fixo para que o upsert funcione, mas mantemos a extensão
      const filePath = `${ownerId}/logo.${fileExt}`; 
      
      // 1. Upload do arquivo (usando upsert para substituir o arquivo antigo)
      const { error: uploadError } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // 2. Obter URL pública
      const { data: publicUrlData } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(filePath);
      let newUrl = publicUrlData.publicUrl;
      
      // Adiciona cache-buster para garantir que a nova imagem seja carregada
      newUrl = `${newUrl}?t=${Date.now()}`; 
      
      showSuccess('Logo enviada! Salve o formulário para confirmar.');
      setCurrentUrl(newUrl);
      setManualUrl(cleanUrl(newUrl)); // Atualiza o manualUrl com a URL limpa
      setFile(null);
      onUploadComplete(newUrl); // Notifica o pai
      setUseAsSignature(true); // Marca para usar como assinatura após upload

    } catch (error: any) {
      console.error('Erro de upload:', error);
      showError('Falha ao anexar logo: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSaveManualUrl = async () => {
      if (!ownerId) return;
      setLoading(true);
      
      try {
          const urlToSave = manualUrl.trim() || null;
          
          // Adiciona cache-buster se for uma URL válida
          const finalUrl = urlToSave ? `${urlToSave}?t=${Date.now()}` : null;
          
          // Apenas atualiza o estado local e notifica o pai
          setCurrentUrl(finalUrl);
          onUploadComplete(finalUrl);
          setUseAsSignature(!!finalUrl);
          
          showSuccess('URL da logo atualizada localmente. Salve o formulário para confirmar.');
      } catch (error: any) {
          showError('Falha ao salvar URL: ' + error.message);
      } finally {
          setLoading(false);
      }
  };
  
  const handleRemoveLogo = async () => {
    if (!currentUrl || !ownerId) return;
    
    if (!window.confirm('Tem certeza que deseja remover a logo?')) return;
    
    // Apenas limpa o estado local e notifica o pai (a exclusão do arquivo no storage é opcional e complexa, focamos na remoção do link no DB)
    setCurrentUrl(null);
    setManualUrl('');
    setFile(null);
    onUploadComplete(null);
    setUseAsSignature(false);
    showSuccess('Logo removida localmente. Salve o formulário para confirmar.');
  };

  return (
    <div className="space-y-4 p-4 border rounded-md">
      <Label className="font-semibold flex items-center"><Image className="w-4 h-4 mr-2" /> Logo da Empresa (Relatórios)</Label>
      
      {currentUrl && (
        <div className="flex items-center space-x-4 p-2 bg-secondary rounded-md">
          {/* Remove o cache-buster para exibição, mas mantém na URL real */}
          <img src={cleanUrl(currentUrl)} alt="Logo Atual" className="w-16 h-16 object-contain border rounded-md" />
          <p className="text-sm text-green-600 flex-1">Logo carregada.</p>
          {!isReadOnly && (
              <Button variant="destructive" size="sm" onClick={handleRemoveLogo} disabled={loading}>
                  <Trash2 className="w-4 h-4 mr-2" /> Remover
              </Button>
          )}
        </div>
      )}

      {!isReadOnly && (
          <>
              <Separator />
              <div className="space-y-2">
                  <Label className="flex items-center"><LinkIcon className="w-4 h-4 mr-2" /> URL Externa (Opcional)</Label>
                  <div className="flex space-x-2">
                      <Input 
                          type="url" 
                          placeholder="https://sua-logo.com/logo.png" 
                          value={manualUrl || ''}
                          onChange={(e) => setManualUrl(e.target.value)}
                          className="flex-1"
                          disabled={loading}
                      />
                      <Button onClick={handleSaveManualUrl} disabled={loading || cleanUrl(manualUrl) === cleanUrl(currentUrl)}>
                          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar URL'}
                      </Button>
                  </div>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                  <Label className="flex items-center"><Upload className="w-4 h-4 mr-2" /> Upload de Arquivo</Label>
                  <div className="flex items-center space-x-2">
                      <Input 
                          type="file" 
                          accept="image/*" 
                          onChange={(e) => setFile(e.target.files?.[0] || null)} 
                          className="flex-1"
                          disabled={loading}
                      />
                      <Button onClick={handleFileUpload} disabled={!file || loading}>
                          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Upload'}
                      </Button>
                  </div>
              </div>
          </>
      )}
      
      {/* NOVO CHECKBOX: Usar como Assinatura */}
      <div className="flex items-center space-x-2 pt-2 border-t">
          <Checkbox 
              id="use-as-signature"
              checked={useAsSignature}
              onCheckedChange={(checked) => setUseAsSignature(!!checked)}
              disabled={isReadOnly || loading || !currentUrl}
          />
          <Label htmlFor="use-as-signature" className="text-sm font-medium">
              Usar esta imagem como URL de Assinatura do Proprietário
          </Label>
      </div>
    </div>
  );
};

export default LogoUpload;