import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Loader2, FileText } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { useNavigate } from 'react-router-dom';

const ImportarExtrato: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
    } else {
      setFile(null);
    }
  };

  const handleNavigateToConciliacao = () => {
    if (!file) {
        showError('Selecione um arquivo CSV para iniciar a conciliação.');
        return;
    }
    
    // Simula o processamento inicial e redireciona para a página de Conciliação
    setLoading(true);
    
    // Em um ambiente real, o arquivo seria salvo em um estado global ou storage
    // Aqui, apenas simulamos o carregamento e redirecionamos.
    setTimeout(() => {
        setLoading(false);
        showSuccess('Arquivo pronto. Redirecionando para a Conciliação...');
        navigate('/conciliacao');
    }, 500);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl flex items-center">
            <FileText className="w-5 h-5 mr-2" /> Importar Extrato Bancário (CSV)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Importe um arquivo CSV para iniciar o processo de conciliação bancária.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-2">
          <Input 
            id="extrato-file" 
            type="file" 
            accept=".csv" 
            onChange={handleFileChange} 
            className="flex-1 w-full"
            disabled={loading}
          />
          <Button 
            onClick={handleNavigateToConciliacao} 
            disabled={!file || loading}
            className="w-full sm:w-auto"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Processar e Conciliar
          </Button>
        </div>
        {file && (
          <p className="text-sm text-green-600">Arquivo selecionado: {file.name}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default ImportarExtrato;