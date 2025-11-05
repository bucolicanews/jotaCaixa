import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload } from 'lucide-react';

interface Step3ImportFileProps {
  file: File | null;
  loading: boolean;
  onFileChange: (file: File | null) => void;
  onProcessFile: () => void;
}

const Step3ImportFile: React.FC<Step3ImportFileProps> = ({ file, loading, onFileChange, onProcessFile }) => {
  return (
    <Card>
      <CardHeader><CardTitle>Passo 3: Importar Extrato</CardTitle></CardHeader>
      <CardContent className="flex items-center space-x-2">
        <Input 
          type="file" 
          accept=".csv" 
          onChange={(e) => onFileChange(e.target.files?.[0] || null)} 
          className="flex-1" 
        />
        <Button onClick={onProcessFile} disabled={!file || loading}>
          <Upload className="w-4 h-4 mr-2" /> Processar
        </Button>
      </CardContent>
    </Card>
  );
};

export default Step3ImportFile;