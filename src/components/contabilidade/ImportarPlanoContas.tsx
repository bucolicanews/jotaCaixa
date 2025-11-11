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

      // Mapear dados para o formato do banco de dados e INFERIR FLAGS
      const contasParaInserir: Partial<PlanoContas>[] = (parsedData as (ContaCSV | ContaJSON)[]).map(conta => {
        
        // Lógica de preenchimento automático do Código Reduzido
        let codigoReduzido = conta['Código reduzido']?.trim() || '';
        if (!codigoReduzido && conta.Conta) {
            codigoReduzido = conta.Conta.replace(/\./g, '');
        }
        
        const contaCodigo = conta.Conta.trim();
        const isAnalitica = conta.Analítica === 'Sim';
        
        // Inferência de Flags com base no código (1=Ativo, 2=Passivo, 3=PL, 4/5=Resultado)
        let is_conta_patrimonial = false;
        let is_conta_resultado = false;
        let is_conta_caixa_banco = false;
        
        if (isAnalitica) {
            if (contaCodigo.startsWith('1') || contaCodigo.startsWith('2') || contaCodigo.startsWith('3')) {
                is_conta_patrimonial = true;
            }
            if (contaCodigo.startsWith('3') || contaCodigo.startsWith('4') || contaCodigo.startsWith('5')) {
                is_conta_resultado = true;
            }
            
            // Sugestão para Caixa/Banco (Contas de Ativo Circulante - 1.1.x)
            if (contaCodigo.startsWith('1.1')) {
                is_conta_caixa_banco = true;
            }
        }
        
        return {
            proprietario_id: proprietarioId,
            Conta: contaCodigo,
            codigo_reduzido: codigoReduzido || null,
            Descricao: conta.Descrição.trim(),
            Analitica: isAnalitica ? 'Sim' : 'Não',
            is_conta_patrimonial: is_conta_patrimonial,
            is_conta_resultado: is_conta_resultado,
            is_conta_caixa_banco: is_conta_caixa_banco,
        };
      });
      
      // --- PRÉ-ANÁLISE DE DEPENDÊNCIAS ---
      
      // 2. Buscar contas antigas que estão em uso
      const { data: oldContas, error: oldContasError } = await supabase
          .from('plano_contas')
          .select('id, Conta, Descricao')
          .eq('proprietario_id', proprietarioId);
          
      if (oldContasError) throw new Error('Erro ao buscar contas antigas: ' + oldContasError.message);
      
      // 3. Identificar contas antigas que não estão no novo plano E que estão em uso
      const contasAntigasEmUso: ContaAntigaEmUsoSimples[] = [];
      const allOldContas = oldContas as PlanoContas[];
      
      for (const oldConta of allOldContas) {
          const isStillPresent = contasParaInserir.some(c => c.Conta === oldConta.Conta);
          
          if (!isStillPresent) {
              // Verifica dependências em saldo_contas e lancamentos
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
      
      // 5. Se não houver dependências NÃO MAPEADAS, procede com a importação direta (exclusão e inserção)
      
      const oldIds = allOldContas.map(c => c.id);
      
      if (oldIds.length > 0) {
          // CRÍTICO: Limpar TODAS as referências de FK antes de deletar o plano_contas
          
          // 5.1. Limpar referências em tabelas de configuração
          await supabase.from('configuracao_contas_pagar')
              .update({ conta_contabil_id: null })
              .eq('proprietario_id', proprietarioId)
              .in('conta_contabil_id', oldIds);

          await supabase.from('configuracao_contas_receber')
              .update({ conta_contabil_id: null })
              .eq('proprietario_id', proprietarioId)
              .in('conta_contabil_id', oldIds);
              
          await supabase.from('configuracoes_stripe')
              .update({ conta_sintetica_id: null, conta_receber_id: null })
              .eq('proprietario_id', proprietarioId)
              .or(`conta_sintetica_id.in.(${oldIds.join(',')}),conta_receber_id.in.(${oldIds.join(',')})`);
              
          // NOVO: Limpar referências em contas sintéticas (admin_contas_receber e admin_contas_pagar)
          await supabase.from('admin_contas_receber')
              .update({ id_conta_contabil: null })
              .eq('admin_id', proprietarioId)
              .in('id_conta_contabil', oldIds);
              
          await supabase.from('admin_contas_pagar')
              .update({ id_conta_contabil: null })
              .eq('admin_id', proprietarioId)
              .in('id_conta_contabil', oldIds);
              
          // 5.2. Limpar referências em saldo_contas e lancamentos (SET TO NULL)
          await supabase.from('saldo_contas')
              .update({ conta_contabil_id: null })
              .eq('proprietario_id', proprietarioId)
              .in('conta_contabil_id', oldIds);
              
          await supabase.from('lancamentos')
              .update({ conta_contabil_id: null })
              .eq('proprietario_id', proprietarioId)
              .in('conta_contabil_id', oldIds);
              
          // 5.3. Limpar contas existentes para o proprietário
          const { error: deleteError } = await supabase
            .from('plano_contas')
            .delete()
            .eq('proprietario_id', proprietarioId);

          if (deleteError) {
            throw new Error('Erro ao limpar contas existentes: ' + deleteError.message);
          }
      }

      // 6. Inserir novos dados
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