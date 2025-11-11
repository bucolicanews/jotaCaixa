import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Loader2, AlertTriangle } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { parseFile } from '@/utils/file-parser';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { ContaCSV, ContaJSON, PlanoContas } from '@/types/plano-contas';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { useMapeamentoContabil } from '@/hooks/use-mapeamento-contabil';
import { Link } from 'react-router-dom';

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
  const { mapeamento, loading: loadingMapeamento, refetch: refetchMapeamento } = useMapeamentoContabil();

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

  const proprietarioId = getProprietarioId();
  
  // Verifica se o mapeamento de Nível 1 está completo (6 entradas não nulas)
  const isMapeamentoCompleto = mapeamento.filter(m => m.tipo_natureza !== 'Nenhum').length >= 6;
  
  // Adicionando useEffect para garantir que o mapeamento seja buscado
  useEffect(() => {
      if (proprietarioId) {
          refetchMapeamento();
      }
  }, [proprietarioId, refetchMapeamento]);


  const handleImport = async () => {
    if (!file) {
      showError('Por favor, selecione um arquivo CSV ou JSON.');
      return;
    }
    
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
      
      // 2. Buscar Máscara
      const { data: mascaraRes, error: mascaraError } = await supabase
          .from('configuracao_plano_contas')
          .select('mascara_codigo')
          .eq('proprietario_id', proprietarioId)
          .limit(1)
          .single();
          
      if (mascaraError && mascaraError.code !== 'PGRST116') throw mascaraError;
      const mascara = mascaraRes?.mascara_codigo || null;
      
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
            const natureza = mapeamento.find(m => m.codigo_nivel_1 === nivel1)?.tipo_natureza;
            
            if (natureza) {
                if (natureza === 'Ativo' || natureza === 'Passivo' || natureza === 'Patrimonio Liquido') {
                    is_conta_patrimonial = true;
                }
                if (natureza === 'Receita' || natureza === 'Despesa' || natureza === 'Resultado') {
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
      
      // 4. Validação de Níveis e Mapeamento
      const maxNivelImportado = contasParaInserir.reduce((max, c) => {
          const nivel = c.Conta?.split('.').filter(Boolean).length || 0;
          return Math.max(max, nivel);
      }, 0);
      
      const hasNiveisAcimaDe2 = maxNivelImportado > 2;
      
      // REGRA DE BLOQUEIO: Se o arquivo importado tiver níveis além do Nível 2 E o mapeamento estiver incompleto, bloqueia.
      if (hasNiveisAcimaDe2 && !isMapeamentoCompleto) {
          showError('O Plano de Contas importado contém níveis além do Nível 2, mas o Mapeamento Contábil (1 a 6) está incompleto. Corrija o Plano de Contas ou complete o mapeamento em Configurações > Contabilidade.');
          setLoading(false);
          return;
      }
      
      // 5. Validação da Máscara (Se houver máscara)
      if (mascara) {
          const invalidMasks = contasParaInserir.filter(c => 
              c.Analitica === 'Sim' && !validateMask(c.Conta!, mascara)
          );
          
          if (invalidMasks.length > 0) {
              showError(`A importação falhou: ${invalidMasks.length} contas analíticas não seguem a máscara cadastrada: ${mascara}. Corrija o arquivo.`);
              setLoading(false);
              return;
          }
      }
      
      // 6. Adicionar Níveis Faltantes (3 a 6) se o arquivo for simplificado (Nível 1 e 2) E o mapeamento estiver completo
      if (!hasNiveisAcimaDe2 && isMapeamentoCompleto) {
          const existingNivel1 = new Set(contasParaInserir.map(c => c.Conta?.split('.')[0]).filter(Boolean));
          
          const niveisFaltantes: Partial<PlanoContas>[] = [];
          
          for (const code of ['3', '4', '5', '6']) {
              if (!existingNivel1.has(code)) {
                  const natureza = mapeamento.find(m => m.codigo_nivel_1 === code)?.tipo_natureza;
                  if (natureza && natureza !== 'Nenhum') {
                      niveisFaltantes.push({
                          proprietario_id: proprietarioId,
                          Conta: code,
                          Descricao: NATUREZAS.find(n => n.value === natureza)?.label || natureza,
                          Analitica: 'Não',
                          is_conta_patrimonial: natureza === 'Ativo' || natureza === 'Passivo' || natureza === 'Patrimonio Liquido',
                          is_conta_resultado: natureza === 'Receita' || natureza === 'Despesa' || natureza === 'Resultado',
                          is_conta_caixa_banco: natureza === 'Ativo',
                      });
                  }
              }
          }
          
          if (niveisFaltantes.length > 0) {
              contasParaInserir.push(...niveisFaltantes);
              showSuccess(`Níveis primários ausentes (3, 4, 5, 6) adicionados com base na configuração.`);
          }
      }
      
      // 7. Buscar contas antigas que estão em uso
      const { data: oldContas, error: oldContasError } = await supabase
          .from('plano_contas')
          .select('id, Conta, Descricao')
          .eq('proprietario_id', proprietarioId);
          
      if (oldContasError) throw new Error('Erro ao buscar contas antigas: ' + oldContasError.message);
      
      // 8. Identificar contas antigas que não estão no novo plano E que estão em uso
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
      
      // 9. Se houver contas antigas em uso que precisam de mapeamento, abre o modal
      if (contasAntigasEmUso.length > 0) {
          setFile(null); // Limpa o arquivo para evitar re-importação acidental
          onOpenMapeamento(contasParaInserir, contasAntigasEmUso);
          return;
      }
      
      // 10. Se não houver dependências NÃO MAPEADAS, procede com a importação direta (exclusão e inserção)
      
      const oldIds = allOldContas.map(c => c.id);
      
      if (oldIds.length > 0) {
          // CRÍTICO: Limpar TODAS as referências de FK antes de deletar o plano_contas
          
          // 10.1. Limpar referências em tabelas de configuração
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
              
          // 10.2. Limpar referências em saldo_contas e lancamentos (SET TO NULL)
          await supabase.from('saldo_contas')
              .update({ conta_contabil_id: null })
              .eq('proprietario_id', proprietarioId)
              .in('conta_contabil_id', oldIds);
              
          await supabase.from('lancamentos')
              .update({ conta_contabil_id: null })
              .eq('proprietario_id', proprietarioId)
              .in('conta_contabil_id', oldIds);
              
          // 10.3. Limpar contas existentes para o proprietário
          const { error: deleteError } = await supabase
            .from('plano_contas')
            .delete()
            .eq('proprietario_id', proprietarioId);

          if (deleteError) {
            throw new Error('Erro ao limpar contas existentes: ' + deleteError.message);
          }
      }

      // 11. Inserir novos dados
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
        
        {loadingMapeamento ? (
            <div className="flex justify-center items-center h-10"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
        ) : !isMapeamentoCompleto && proprietarioId ? (
            <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-500 rounded-md text-sm text-red-700 dark:text-red-300 flex items-start">
                <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />
                <p>O Mapeamento Contábil (1 a 6) está incompleto. Complete-o em <Link to="/configuracoes" className="underline font-semibold">Configurações &gt; Contabilidade</Link> antes de importar planos com mais de 2 níveis.</p>
            </div>
        ) : null}
        
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
            disabled={!file || loading || !proprietarioId}
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

// Adicionando a lista de naturezas para o passo 6 (criação de níveis faltantes)
const NATUREZAS = [
    { value: 'Ativo', label: 'Ativo (Balanço)' },
    { value: 'Passivo', label: 'Passivo (Balanço)' },
    { value: 'Patrimonio Liquido', label: 'Patrimônio Líquido (Balanço)' },
    { value: 'Receita', label: 'Receita (DRE)' },
    { value: 'Despesa', label: 'Despesa (DRE)' },
    { value: 'Resultado', label: 'Resultado (Lucro/Prejuízo)' },
    { value: 'Nenhum', label: 'Nenhum (Ignorar Nível)' },
];

export default ImportarPlanoContas;