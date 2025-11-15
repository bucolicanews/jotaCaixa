import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Image, Trash2 } from 'lucide-react';
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
  const [currentUrl, setCurrentUrl] = useState(initialLogoUrl);

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
      const { error: updateError } = await supabase
        .from('tbl_admins')
        .update({ logo_url: newUrl })
        .eq('id', adminId);
        
      if (updateError) throw updateError;

      showSuccess('Logo atualizada com sucesso!');
      setCurrentUrl(newUrl);
      setFile(null);
      onUploadComplete(newUrl);

    } catch (error: any) {
      console.error('Erro de upload:', error);
      showError('Falha ao anexar logo: ' + error.message);
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
        const { error: updateError } = await supabase
            .from('tbl_admins')
            .update({ logo_url: null })
            .eq('id', adminId);
            
        if (updateError) throw updateError;
        
        // 2. Tentar deletar o arquivo do storage (opcional, mas boa prática)
        // Nota: O nome do arquivo é inferido do path da URL, mas é complexo.
        // Por simplicidade, focamos em remover a referência do DB.
        
        showSuccess('Logo removida com sucesso!');
        setCurrentUrl(null);
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
      
      {currentUrl ? (
        <div className="flex items-center space-x-4">
          <img src={currentUrl} alt="Logo Atual" className="w-16 h-16 object-contain border rounded-md" />
          <p className="text-sm text-green-600 flex-1">Logo carregada.</p>
          {!isReadOnly && (
              <Button variant="destructive" size="sm" onClick={handleRemoveLogo} disabled={loading}>
                  <Trash2 className="w-4 h-4 mr-2" /> Remover
              </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma logo definida. Use o campo abaixo.</p>
      )}

      {!isReadOnly && (
          <div className="flex items-center space-x-2">
              <Input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => setFile(e.target.files?.[0] || null)} 
                  className="flex-1"
                  disabled={loading}
              />
              <Button onClick={handleFileUpload} disabled={!file || loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  {currentUrl ? 'Substituir' : 'Upload'}
              </Button>
          </div>
      )}
    </div>
  );
};

export default LogoUpload;