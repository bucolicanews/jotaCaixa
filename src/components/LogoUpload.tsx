import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Image, Trash2, Link as LinkIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';

interface LogoUploadProps {
  adminId: string;
  initialLogoUrl: string | null | undefined;
  onUploadComplete: (url: string | null) => void;
  isReadOnly: boolean;
}

const LOGO_BUCKET = 'logos-admin';

const LogoUpload: React.FC<LogoUploadProps> = ({ adminId, initialLogoUrl, onUploadComplete, isReadOnly }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(initialLogoUrl || '');
  const [manualUrl, setManualUrl] = useState(initialLogoUrl || '');

  // Sincroniza o estado interno com a prop inicial
  useEffect(() => {
      setCurrentUrl(initialLogoUrl || '');
      setManualUrl(initialLogoUrl || '');
  }, [initialLogoUrl]);

  const updateAdminProfile = async (url: string | null) => {
      const { error: updateError } = await supabase
          .from('tbl_admins')
          .update({ logo_url: url })
          .eq('id', adminId);
          
      if (updateError) throw updateError;
  };

  const handleFileUpload = async () => {
    if (!file || !adminId) return;
    
    setLoading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${adminId}/logo.${fileExt}`; 
      
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
      const newUrl = publicUrlData.publicUrl;
      
      // 3. Atualizar o perfil do Admin com a nova URL
      await updateAdminProfile(newUrl);

      showSuccess('Logo atualizada com sucesso!');
      setCurrentUrl(newUrl);
      setManualUrl(newUrl);
      setFile(null);
      onUploadComplete(newUrl);

    } catch (error: any) {
      console.error('Erro de upload:', error);
      showError('Falha ao anexar logo: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSaveManualUrl = async () => {
      if (!adminId) return;
      setLoading(true);
      
      try {
          const urlToSave = manualUrl.trim() || null;
          await updateAdminProfile(urlToSave);
          
          showSuccess('URL da logo salva com sucesso!');
          setCurrentUrl(urlToSave);
          onUploadComplete(urlToSave);
      } catch (error: any) {
          showError('Falha ao salvar URL: ' + error.message);
      } finally {
          setLoading(false);
      }
  };
  
  const handleRemoveLogo = async () => {
    if (!currentUrl || !adminId) return;
    
    if (!window.confirm('Tem certeza que deseja remover a logo?')) return;
    
    setLoading(true);
    
    try {
        // 1. Remover a URL do perfil
        await updateAdminProfile(null);
        
        showSuccess('Logo removida com sucesso!');
        setCurrentUrl(null);
        setManualUrl('');
        setFile(null);
        onUploadComplete(null);
        
    } catch (error: any) {
        showError('Falha ao remover logo: ' + error.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-4 border rounded-md">
      <Label className="font-semibold flex items-center"><Image className="w-4 h-4 mr-2" /> Logo da Empresa (Relatórios)</Label>
      
      {currentUrl && (
        <div className="flex items-center space-x-4 p-2 bg-secondary rounded-md">
          <img src={currentUrl} alt="Logo Atual" className="w-16 h-16 object-contain border rounded-md" />
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
                          value={manualUrl}
                          onChange={(e) => setManualUrl(e.target.value)}
                          className="flex-1"
                          disabled={loading}
                      />
                      <Button onClick={handleSaveManualUrl} disabled={loading || manualUrl === currentUrl}>
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
    </div>
  );
};

export default LogoUpload;