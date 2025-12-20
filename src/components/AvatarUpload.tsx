import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Image, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
//import { UserAvatar } from './UserAvatar'; // Using UserAvatar for display

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

  // Sync with external changes
  useEffect(() => {
    setCurrentUrl(initialAvatarUrl || '');
  }, [initialAvatarUrl]);

  const handleFileUpload = async () => {
    if (!file || !entityId) return;
    
    setLoading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${entityId}/avatar.${fileExt}`; 
      
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
      let newUrl = publicUrlData.publicUrl;
      
      // Add cache-buster to ensure the new image is loaded
      newUrl = `${newUrl}?t=${Date.now()}`; 
      
      showSuccess('Avatar enviado! Salve o formulário para confirmar.');
      setCurrentUrl(newUrl);
      setFile(null);
      onUploadComplete(newUrl);

    } catch (error: any) {
      console.error('Upload error:', error);
      showError('Failed to attach avatar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleRemoveAvatar = async () => {
    if (!currentUrl || !entityId) return;
    
    if (!window.confirm('Are you sure you want to remove the avatar?')) return;
    
    setCurrentUrl('');
    setFile(null);
    onUploadComplete(null);
    showSuccess('Avatar removed locally. Save the form to confirm.');
  };

  return (
    <div className="space-y-4 p-4 border rounded-md">
      <Label className="font-semibold flex items-center"><Image className="w-4 h-4 mr-2" /> Profile Picture</Label>
      
      {currentUrl && (
        <div className="flex items-center space-x-4 p-2 bg-secondary rounded-md">
          <UserAvatar profile={{ avatar_url: currentUrl }} className="w-16 h-16" />
          <p className="text-sm text-green-600 flex-1">Avatar loaded.</p>
          {!isReadOnly && (
              <Button variant="destructive" size="sm" onClick={handleRemoveAvatar} disabled={loading}>
                  <Trash2 className="w-4 h-4 mr-2" /> Remove
              </Button>
          )}
        </div>
      )}

      {!isReadOnly && (
          <div className="space-y-2">
              <Label className="flex items-center"><Upload className="w-4 h-4 mr-2" /> Upload File</Label>
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
