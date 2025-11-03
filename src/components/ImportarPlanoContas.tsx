import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Loader2 } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { parseCSV } from '@/utils/csv-parser';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { ContaCSV } from '@/types/plano-contas';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

interface ImportarPlanoContasProps {
  onImportComplete: () => void;
}

const ImportarPlanoContas: React.FC<ImportarPlanoContasProps> = ({ onImportComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const { usuario, role, perfil } = useSessao();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
    } else {
      setFile(null);
    }
  };

  const getProprietarioId = (): string | null => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
    return null;
  };

  const handleImport = async () => {
    if (!file) {
      showError('Por favor, selecione um arquivo CSV.');
      return;
    }
    
    const proprietarioId = getProprietarioId();
    if (!proprietarioId) {
      showError('Usuário não autenticado ou sem empresa vinculada.');
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const parsedData: ContaCSV[] = await parseCSV(file);

      if (parsedData.length === 0) {
        showError('O arquivo CSV está vazio ou o formato está incorreto.');
        setLoading(false);
        return;
      }

      // Mapear dados para o formato do banco de dados
      const contasParaInserir = parsedData.map(conta => ({
        proprietario_id: proprietarioId,
        Conta: conta.Conta,
        codigo_reduzido: conta['Código Reduzido'] || null,
        Descricao: conta.Descrição.trim(),
        Analitica: conta.Analítica,
      }));

      // 1. Limpar contas existentes para o proprietário
      const { error: deleteError } = await supabase
        .from('plano_contas')
        .delete()
        .eq('proprietario_id', proprietarioId);

      if (deleteError) {
        throw new Error('Erro ao limpar contas existentes: ' + deleteError.message);
      }

      // 2. Inserir novos dados
      const { error: insertError } = await supabase
        .from('plano_contas')
        .insert(contasParaInserir);

      if (insertError) {
        throw new Error('Erro ao inserir contas: ' + insertError.message);
      }

      showSuccess(`Plano de Contas importado com sucesso! ${contasParaInserir.length} contas adicionadas.`);
      setFile(null);
      onImportComplete();

    } catch (error) {
      console.error('Erro durante a importação:', error);
      showError('Falha na importação. Verifique o console para detalhes.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl">Importar Plano de Contas (CSV)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Selecione um arquivo CSV no formato: <code>Conta;Código Reduzido;Descrição;Analítica</code>
        </p>
        <div className="flex items-center space-x-2">
          <Input 
            id="csv-file" 
            type="file" 
            accept=".csv" 
            onChange={handleFileChange} 
            className="flex-1"
            disabled={loading}
          />
          <Button 
            onClick={handleImport} 
            disabled={!file || loading || !getProprietarioId()}
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

export default ImportarPlanoContas;