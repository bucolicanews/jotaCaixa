import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Image, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import UserAvatar from './UserAvatar'; // Importando UserAvatar para display

interface AvatarUploadProps {
  entityId: string; // Could be userId, clientId, etc.
  bucketName: string; // e.g., 'avatars'
  initialAvatarUrl: string | null | undefined;
  onUploadComplete: (url: string | null) => void;
  isReadOnly: boolean;
}

const AvatarUpload: React.FC<AvatarUploadProps> = ({ entityId, bucketName, initialAvatarUrl, onUploadComplete, isReadOnly }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(initialAvatarUrl || '');

  // CRÍTICO: Usando o nome do bucket 'avatar'
  const BUCKET_NAME = 'avatar';

  // Sync with external changes
  useEffect(() => {
    setCurrentUrl(initialAvatarUrl || '');
  }, [initialAvatarUrl]);

  const handleFileUpload = async () => {
    if (!file || !entityId) return;
    
    setLoading(true);

    try {
      const fileExt = file.name.split('.').pop();
      // Caminho: [user_id]/avatar.[ext] - CRÍTICO para RLS
      const filePath = `${entityId}/avatar.${fileExt}`; 
      
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME) // USANDO BUCKET CORRETO
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
      let newUrl = publicUrlData.publicUrl;
      
      // Add cache-buster to ensure the new image is loaded
      newUrl = `${newUrl}?t=${Date.now()}`; 
      
      showSuccess('Foto enviada! Salve o formulário para confirmar.');
      setCurrentUrl(newUrl);
      setFile(null);
      onUploadComplete(newUrl);

    } catch (error: any) {
      console.error('Erro de upload:', error);
      showError('Falha ao anexar foto: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleRemoveAvatar = async () => {
    if (!currentUrl || !entityId) return;
    
    if (!window.confirm('Tem certeza que deseja remover a foto de perfil?')) return;
    
    setCurrentUrl('');
    setFile(null);
    onUploadComplete(null);
    showSuccess('Foto removida localmente. Salve o formulário para confirmar.');
  };

  return (
    <div className="space-y-4 p-4 border rounded-md">
      <Label className="font-semibold flex items-center"><Image className="w-4 h-4 mr-2" /> Foto do Perfil</Label>
      
      {currentUrl && (
        <div className="flex items-center space-x-4 p-2 bg-secondary rounded-md">
          <UserAvatar profile={{ avatar_url: currentUrl }} className="w-16 h-16" />
          <p className="text-sm text-green-600 flex-1">Foto carregada.</p>
          {!isReadOnly && (
              <Button variant="destructive" size="sm" onClick={handleRemoveAvatar} disabled={loading}>
                  <Trash2 className="w-4 h-4 mr-2" /> Remover
              </Button>
          )}
        </div>
      )}

      {!isReadOnly && (
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
      )}
    </div>
  );
};

export default AvatarUpload;