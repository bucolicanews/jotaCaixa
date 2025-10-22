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

interface ImportarPlanoContasProps {
  onImportComplete: () => void;
}

const ImportarPlanoContas: React.FC<ImportarPlanoContasProps> = ({ onImportComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const { usuario } = useSessao();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
    } else {
      setFile(null);
    }
  };

  const getEmpresaId = async (userId: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from('empresas')
      .select('id')
      .eq('usuario_id', userId)
      .single();

    if (error) {
      console.error('Erro ao buscar empresa:', error);
      return null;
    }
    return data?.id || null;
  };

  const handleImport = async () => {
    if (!file) {
      showError('Por favor, selecione um arquivo CSV.');
      return;
    }
    if (!usuario) {
      showError('Usuário não autenticado.');
      return;
    }

    setLoading(true);

    try {
      const empresaId = await getEmpresaId(usuario.id);
      if (!empresaId) {
        showError('Não foi possível encontrar a empresa vinculada ao seu usuário.');
        setLoading(false);
        return;
      }

      const parsedData: ContaCSV[] = await parseCSV(file);

      if (parsedData.length === 0) {
        showError('O arquivo CSV está vazio ou o formato está incorreto.');
        setLoading(false);
        return;
      }

      // Mapear dados para o formato do banco de dados
      const contasParaInserir = parsedData.map(conta => ({
        empresa_id: empresaId,
        codigo_conta: conta.Conta,
        nome_conta: conta.Descrição.trim(),
        tipo: conta.Analítica === 'Sim' ? 'Analítica' : 'Sintética',
      }));

      // 1. Limpar contas existentes para a empresa (opcional, mas comum em importação de plano de contas)
      // Para evitar duplicatas e garantir que o plano importado seja o único.
      const { error: deleteError } = await supabase
        .from('plano_contas')
        .delete()
        .eq('empresa_id', empresaId);

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
          Selecione um arquivo CSV no formato: <code>Conta;Analítica;C.R.;Descrição;SPED ECD/ECF</code>
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
            disabled={!file || loading}
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