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
      const contasParaInserir = (parsedData as (ContaCSV | ContaJSON)[]).map(conta => ({
        proprietario_id: proprietarioId,
        Conta: conta.Conta,
        codigo_reduzido: conta['Código reduzido'] || null,
        Descricao: conta.Descrição.trim(),
        Analitica: conta.Analítica,
      }));
      
      // --- LÓGICA DE CORRELAÇÃO DE CONTAS EXISTENTES ---
      
      // 2. Buscar contas antigas que estão em uso (apenas ID e Conta)
      const { data: oldContas, error: oldContasError } = await supabase
          .from('plano_contas')
          .select('id, Conta')
          .eq('proprietario_id', proprietarioId);
          
      if (oldContasError) throw new Error('Erro ao buscar contas antigas: ' + oldContasError.message);
      
      // 3. Limpar contas existentes para o proprietário
      const { error: deleteError } = await supabase
        .from('plano_contas')
        .delete()
        .eq('proprietario_id', proprietarioId);

      if (deleteError) {
        throw new Error('Erro ao limpar contas existentes: ' + deleteError.message);
      }

      // 4. Inserir novos dados e obter os novos IDs
      const { data: newContas, error: insertError } = await supabase
        .from('plano_contas')
        .insert(contasParaInserir)
        .select('id, Conta');

      if (insertError) {
        throw new Error('Erro ao inserir contas: ' + insertError.message);
      }
      
      // Mapeamento: Código da Conta -> ID Novo
      const newIdMap: Record<string, string> = (newContas as PlanoContas[]).reduce((acc, c) => {
          acc[c.Conta] = c.id;
          return acc;
      }, {} as Record<string, string>);
      
      // 5. Preparar updates para tabelas que referenciam plano_contas
      const updatesSaldoContas: { id: string, conta_contabil_id: string }[] = [];
      const updatesLancamentos: { id: string, conta_contabil_id: string }[] = [];
      
      // Itera sobre as contas antigas que estavam em uso
      for (const oldConta of oldContas as PlanoContas[]) {
          const newId = newIdMap[oldConta.Conta];
          
          // Se o código da conta existe no novo plano (correlação)
          if (newId) {
              // Verifica se a conta antiga estava em uso em saldo_contas
              const { data: saldoContasInUse } = await supabase
                  .from('saldo_contas')
                  .select('id')
                  .eq('proprietario_id', proprietarioId)
                  .eq('conta_contabil_id', oldConta.id);
                  
              (saldoContasInUse || []).forEach(sc => {
                  updatesSaldoContas.push({ id: sc.id, conta_contabil_id: newId });
              });
              
              // Verifica se a conta antiga estava em uso em lancamentos
              const { data: lancamentosInUse } = await supabase
                  .from('lancamentos')
                  .select('id')
                  .eq('proprietario_id', proprietarioId)
                  .eq('conta_contabil_id', oldConta.id);
                  
              (lancamentosInUse || []).forEach(l => {
                  updatesLancamentos.push({ id: l.id, conta_contabil_id: newId });
              });
          }
      }
      
      // 6. Executar updates em lote
      if (updatesSaldoContas.length > 0) {
          await supabase.from('saldo_contas').upsert(updatesSaldoContas, { onConflict: 'id' });
      }
      if (updatesLancamentos.length > 0) {
          await supabase.from('lancamentos').upsert(updatesLancamentos, { onConflict: 'id' });
      }
      
      // --- FIM LÓGICA DE CORRELAÇÃO ---

      showSuccess(`Plano de Contas importado com sucesso! ${contasParaInserir.length} contas adicionadas. ${updatesSaldoContas.length + updatesLancamentos.length} referências atualizadas.`);
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
            Atenção: A importação **substitui** o plano de contas existente. Contas em uso serão correlacionadas automaticamente se o código da conta for mantido.
        </p>
      </CardContent>
    </Card>
  );
};

export default ImportarPlanoContas;