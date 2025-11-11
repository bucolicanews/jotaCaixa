import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Loader2 } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { parseFile } from '@/utils/file-parser';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { ContaCSV, ContaJSON, PlanoContas } from '@/types/plano-contas';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

// Tipo para a conta antiga em uso (para o modal)
interface ContaAntigaEmUsoSimples {
    id: string;
    Conta: string;
    Descricao: string;
    dependencies: number;
}

interface ImportarPlanoContasProps {
  onImportComplete: () => void;
  onOpenMapeamento: (contasParaInserir: Partial<PlanoContas>[], contasAntigasEmUso: ContaAntigaEmUsoSimples[]) => void;
}

const ImportarPlanoContas: React.FC<ImportarPlanoContasProps> = ({ onImportComplete, onOpenMapeamento }) => {
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
      showError('Por favor, selecione um arquivo CSV ou JSON.');
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
      // 1. Parsear o arquivo
      const parsedData = await parseFile(file);

      if (parsedData.length === 0) {
        showError('O arquivo está vazio ou o formato está incorreto. Verifique se os cabeçalhos estão corretos.');
        setLoading(false);
        return;
      }
      
      const firstRow = parsedData[0] as any;
      if (!('Conta' in firstRow) || !('Descrição' in firstRow) || !('Analítica' in firstRow)) {
          showError('O arquivo não parece ser um Plano de Contas. Verifique se as colunas "Conta", "Descrição" e "Analítica" estão presentes.');
          setLoading(false);
          return;
      }

      // Mapear dados para o formato do banco de dados
      const contasParaInserir: Partial<PlanoContas>[] = (parsedData as (ContaCSV | ContaJSON)[]).map(conta => ({
        proprietario_id: proprietarioId,
        Conta: conta.Conta,
        codigo_reduzido: conta['Código reduzido'] || null,
        Descricao: conta.Descrição.trim(),
        Analitica: conta.Analítica,
      }));
      
      // --- PRÉ-ANÁLISE DE DEPENDÊNCIAS ---
      
      // 2. Buscar contas antigas que estão em uso
      const { data: oldContas, error: oldContasError } = await supabase
          .from('plano_contas')
          .select('id, Conta, Descricao')
          .eq('proprietario_id', proprietarioId);
          
      if (oldContasError) throw new Error('Erro ao buscar contas antigas: ' + oldContasError.message);
      
      // 3. Identificar contas antigas que não estão no novo plano E que estão em uso
      const contasAntigasEmUso: ContaAntigaEmUsoSimples[] = [];
      
      for (const oldConta of oldContas as PlanoContas[]) {
          const isStillPresent = contasParaInserir.some(c => c.Conta === oldConta.Conta);
          
          if (!isStillPresent) {
              // Verifica dependências (saldo_contas e lancamentos)
              const checks = await Promise.all([
                  supabase.from('saldo_contas').select('id', { count: 'exact', head: true }).eq('conta_contabil_id', oldConta.id),
                  supabase.from('lancamentos').select('id', { count: 'exact', head: true }).eq('conta_contabil_id', oldConta.id),
              ]);
              
              const totalDependencies = checks.reduce((sum, res) => sum + (res.count || 0), 0);
              
              if (totalDependencies > 0) {
                  contasAntigasEmUso.push({
                      id: oldConta.id,
                      Conta: oldConta.Conta,
                      Descricao: oldConta.Descricao,
                      dependencies: totalDependencies,
                  });
              }
          }
      }
      
      // 4. Se houver contas antigas em uso que precisam de mapeamento, abre o modal
      if (contasAntigasEmUso.length > 0) {
          setFile(null); // Limpa o arquivo para evitar re-importação acidental
          onOpenMapeamento(contasParaInserir, contasAntigasEmUso);
          return;
      }
      
      // 5. Se não houver dependências, procede com a importação direta (exclusão e inserção)
      
      // Limpar contas existentes para o proprietário
      const { error: deleteError } = await supabase
        .from('plano_contas')
        .delete()
        .eq('proprietario_id', proprietarioId);

      if (deleteError) {
        throw new Error('Erro ao limpar contas existentes: ' + deleteError.message);
      }

      // Inserir novos dados
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
      showError('Falha na importação: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl">Importar Plano de Contas (CSV/JSON)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Selecione um arquivo CSV (<code>Conta;Código reduzido;Descrição;Analítica</code>) ou JSON (array de objetos).
        </p>
        <div className="flex items-center space-x-2">
          <Input 
            id="csv-file" 
            type="file" 
            accept=".csv,.json" 
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
        <p className="text-xs text-yellow-600 dark:text-yellow-400">
            Atenção: A importação **substitui** o plano de contas existente. Se houver contas antigas em uso que não estão no novo arquivo, você será solicitado a mapeá-las.
        </p>
      </CardContent>
    </Card>
  );
};

export default ImportarPlanoContas;