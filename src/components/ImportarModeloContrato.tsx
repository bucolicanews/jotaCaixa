import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Loader2, FileText } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { useSessao } from '@/hooks/use-sessao';

interface ImportarModeloContratoProps {
  empresaId: string | null;
  onImportComplete: () => void;
}

const ImportarModeloContrato: React.FC<ImportarModeloContratoProps> = ({ empresaId, onImportComplete }) => {
  const { role, usuario } = useSessao();
  const [file, setFile] = useState<File | null>(null);
  const [titulo, setTitulo] = useState('');
  const [loading, setLoading] = useState(false);
  
  const isAdmin = role === 'Admin';
  
  // Determina o ID a ser usado na coluna empresa_id
  const getOwnerId = () => {
    if (isAdmin) return usuario?.id || null; // Admin usa seu próprio ID
    return empresaId;
  };
  
  const ownerId = getOwnerId();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const selectedFile = event.target.files[0];
      setFile(selectedFile);
      // Sugere o título baseado no nome do arquivo
      setTitulo(selectedFile.name.replace(/\.(txt|html|doc|docx)$/i, '').trim());
    } else {
      setFile(null);
      setTitulo('');
    }
  };

  const handleImport = async () => {
    if (!file || !titulo.trim()) {
      showError('Por favor, selecione um arquivo e insira um título.');
      return;
    }
    if (!ownerId) {
        showError('ID do proprietário não encontrado. Não é possível importar.');
        return;
    }

    setLoading(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
            const conteudo = e.target?.result as string;

            if (!conteudo || conteudo.length < 50) {
              showError('O conteúdo do arquivo é muito curto ou vazio.');
              setLoading(false);
              return;
            }

            const dataToInsert = {
              titulo: titulo.trim(),
              conteudo_template: conteudo,
              empresa_id: ownerId, // Usando o ID do Admin/Cliente
            };

            const { error: insertError } = await supabase
              .from('contrato_modelos')
              .insert(dataToInsert);

            if (insertError) {
              throw new Error('Erro ao inserir modelo: ' + insertError.message);
            }

            showSuccess(`Modelo "${titulo}" importado com sucesso!`);
            setFile(null);
            setTitulo('');
            onImportComplete();
            
        } catch (error: any) {
            console.error('Erro durante a importação:', error);
            showError(error.message || 'Falha na importação do modelo.');
        } finally {
            setLoading(false);
        }
      };
      
      reader.onerror = () => {
        showError('Erro ao ler o arquivo.');
        setLoading(false);
      };

      reader.readAsText(file);

    } catch (error: any) {
      // Este catch só pega erros antes do FileReader iniciar
      console.error('Erro inicial durante a importação:', error);
      showError(error.message || 'Falha na importação do modelo.');
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl flex items-center">
            <FileText className="w-5 h-5 mr-2" /> Importar Modelo (TXT/HTML)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Selecione um arquivo de texto (.txt, .html) contendo o template do contrato.
        </p>
        
        <div className="space-y-2">
            <Label htmlFor="modelo-titulo">Título do Modelo</Label>
            <Input 
                id="modelo-titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Contrato de Prestação de Serviços"
                disabled={loading}
            />
        </div>

        <div className="flex items-center space-x-2">
          <Input 
            id="modelo-file" 
            type="file" 
            accept=".txt,.html" 
            onChange={handleFileChange} 
            className="flex-1"
            disabled={loading}
          />
          <Button 
            onClick={handleImport} 
            disabled={!file || loading || !titulo.trim()}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Importar
          </Button>
        </div>
        {file && (
          <p className="text-sm text-green-600">Arquivo selecionado: {file.name}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default ImportarModeloContrato;