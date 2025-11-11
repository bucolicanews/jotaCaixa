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

// Função de validação da máscara (copiada de FormPlanoContas.tsx)
const validateMask = (code: string, mask: string): boolean => {
    if (!mask) return true;
    
    const codeParts = code.split('.');
    const maskParts = mask.split('.');
    
    if (codeParts.length !== maskParts.length) {
        return false;
    }
    
    for (let i = 0; i < codeParts.length; i++) {
        const codeSegment = codeParts[i];
        const maskSegment = maskParts[i];
        
        if (codeSegment.length !== maskSegment.length) {
            return false;
        }
        if (!/^\d+$/.test(codeSegment)) {
            return false;
        }
    }
    return true;
};


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
        showError('O arquivo está vazio ou o formato está incorreto. Verifique se as colunas estão corretas.');
        setLoading(false);
        return;
      }
      
      const firstRow = parsedData[0] as any;
      if (!('Conta' in firstRow) || !('Descrição' in firstRow) || !('Analítica' in firstRow)) {
          showError('O arquivo não parece ser um Plano de Contas. Verifique se as colunas "Conta", "Descrição" e "Analítica" estão presentes.');
          setLoading(false);
          return;
      }
      
      // 2. Buscar Mapeamento Contábil e Máscara
      const [mapeamentoRes, mascaraRes] = await Promise.all([
          supabase.from('configuracao_contabil').select('codigo_nivel_1, tipo_natureza').eq('proprietario_id', proprietarioId),
          supabase.from('configuracao_plano_contas').select('mascara_codigo').eq('proprietario_id', proprietarioId).limit(1).single(),
      ]);
      
      if (mapeamentoRes.error) throw mapeamentoRes.error;
      
      const mascara = mascaraRes.data?.mascara_codigo || null;
      
      const mapeamentoMap = (mapeamentoRes.data || []).reduce((acc, item) => {
          acc[item.codigo_nivel_1] = item.tipo_natureza;
          return acc;
      }, {} as Record<string, string>);
      
      if (Object.keys(mapeamentoMap).length < 5) {
          showError('O mapeamento de níveis contábeis (1 a 5) não está completo. Configure em Configurações > Contabilidade.');
          setLoading(false);
          return;
      }

      // 3. Mapear dados para o formato do banco de dados e INFERIR FLAGS
      const contasParaInserir: Partial<PlanoContas>[] = (parsedData as (ContaCSV | ContaJSON)[]).map(conta => {
        
        let codigoReduzido = conta['Código reduzido']?.trim() || '';
        if (!codigoReduzido && conta.Conta) {
            codigoReduzido = conta.Conta.replace(/\./g, '');
        }
        
        const contaCodigo = conta.Conta.trim();
        const isAnalitica = conta.Analítica === 'Sim';
        
        // Inferência de Flags usando o mapeamento dinâmico
        let is_conta_patrimonial = false;
        let is_conta_resultado = false;
        let is_conta_caixa_banco = false;
        
        if (isAnalitica) {
            const nivel1 = contaCodigo.split('.')[0];
            const natureza = mapeamentoMap[nivel1];
            
            if (natureza) {
                if (natureza === 'Ativo' || natureza === 'Passivo' || natureza === 'Patrimonio Liquido') {
                    is_conta_patrimonial = true;
                }
                if (natureza === 'Receita' || natureza === 'Despesa') {
                    is_conta_resultado = true;
                }
                if (natureza === 'Ativo') {
                    is_conta_caixa_banco = true;
                }
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
      
      // 4. Validação da Máscara (Se houver máscara)
      if (mascara) {
          const invalidMasks = contasParaInserir.filter(c => 
              c.Analitica === 'Sim' && !validateMask(c.Conta!, mascara)
          );
          
          if (invalidMasks.length > 0) {
              showError(`A importação falhou: ${invalidMasks.length} contas analíticas não seguem a máscara '${mascara}'. Corrija o arquivo.`);
              setLoading(false);
              return;
          }
      }
      
      // 5. Buscar contas antigas que estão em uso
      const { data: oldContas, error: oldContasError } = await supabase
          .from('plano_contas')
          .select('id, Conta, Descricao')
          .eq('proprietario_id', proprietarioId);
          
      if (oldContasError) throw new Error('Erro ao buscar contas antigas: ' + oldContasError.message);
      
      // 6. Identificar contas antigas que não estão no novo plano E que estão em uso
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
      
      // 7. Se houver contas antigas em uso que precisam de mapeamento, abre o modal
      if (contasAntigasEmUso.length > 0) {
          setFile(null); // Limpa o arquivo para evitar re-importação acidental
          onOpenMapeamento(contasParaInserir, contasAntigasEmUso);
          return;
      }
      
      // 8. Se não houver dependências NÃO MAPEADAS, procede com a importação direta (exclusão e inserção)
      
      const oldIds = allOldContas.map(c => c.id);
      
      if (oldIds.length > 0) {
          // CRÍTICO: Limpar TODAS as referências de FK antes de deletar o plano_contas
          
          // 8.1. Limpar referências em tabelas de configuração
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
              
          await supabase.from('admin_contas_receber')
              .update({ id_conta_contabil: null })
              .eq('admin_id', proprietarioId)
              .in('id_conta_contabil', oldIds);
              
          await supabase.from('admin_contas_pagar')
              .update({ id_conta_contabil: null })
              .eq('admin_id', proprietarioId)
              .in('id_conta_contabil', oldIds);
              
          // 8.2. Limpar referências em saldo_contas e lancamentos (SET TO NULL)
          await supabase.from('saldo_contas')
              .update({ conta_contabil_id: null })
              .eq('proprietario_id', proprietarioId)
              .in('conta_contabil_id', oldIds);
              
          await supabase.from('lancamentos')
              .update({ conta_contabil_id: null })
              .eq('proprietario_id', proprietarioId)
              .in('conta_contabil_id', oldIds);
              
          // 8.3. Limpar contas existentes para o proprietário
          const { error: deleteError } = await supabase
            .from('plano_contas')
            .delete()
            .eq('proprietario_id', proprietarioId);

          if (deleteError) {
            throw new Error('Erro ao limpar contas existentes: ' + deleteError.message);
          }
      }

      // 9. Inserir novos dados
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