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
import MapearSaldosDialog from './MapearSaldosDialog'; // Importando o novo componente

interface ImportarPlanoContasProps {
  onImportComplete: () => void;
}

// Novo tipo para o estado de mapeamento
interface OldSaldoData {
    id: string; // saldo_contas.id
    nome: string; // saldo_contas.nome
    saldo_inicial: number;
    old_conta_contabil_id: string;
    old_conta_contabil_nome: string; // PlanoContas.Descricao
}

const ImportarPlanoContas: React.FC<ImportarPlanoContasProps> = ({ onImportComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const { usuario, role, perfil } = useSessao();
  
  // Estados para o modal de mapeamento
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [oldSaldosToMap, setOldSaldosToMap] = useState<OldSaldoData[]>([]);
  const [newPlanoContas, setNewPlanoContas] = useState<PlanoContas[]>([]);

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
  
  const proprietarioId = getProprietarioId(); // Define a variável no escopo do componente

  const performDirectImport = async (proprietarioId: string, contasParaInserir: PlanoContas[]) => {
      // 1. Setar todas as FKs para NULL (para evitar a violação)
      await supabase.from('saldo_contas').update({ conta_contabil_id: null }).eq('proprietario_id', proprietarioId);
      await supabase.from('lancamentos').update({ conta_contabil_id: null }).eq('proprietario_id', proprietarioId);
      await supabase.from('configuracao_contas_receber').update({ conta_contabil_id: null }).eq('proprietario_id', proprietarioId);
      await supabase.from('configuracao_contas_pagar').update({ conta_contabil_id: null }).eq('proprietario_id', proprietarioId);
      await supabase.from('configuracoes_stripe').update({ conta_sintetica_id: null, conta_receber_id: null }).eq('proprietario_id', proprietarioId);
      
      // 2. Limpar contas existentes para o proprietário
      const { error: deleteError } = await supabase
        .from('plano_contas')
        .delete()
        .eq('proprietario_id', proprietarioId);

      if (deleteError) {
        throw new Error('Erro ao limpar contas existentes: ' + deleteError.message);
      }

      // 3. Inserir novos dados
      const { error: insertError } = await supabase
        .from('plano_contas')
        .insert(contasParaInserir);

      if (insertError) {
        throw new Error('Erro ao inserir contas: ' + insertError.message);
      }
  };

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
      // 1. Parsear o novo Plano de Contas
      const parsedData = await parseFile(file);

      if (parsedData.length === 0) {
        showError('O arquivo está vazio ou o formato está incorreto. Verifique se as colunas "Conta", "Descrição" e "Analítica" estão presentes.');
        setLoading(false);
        return;
      }
      
      const contasParaInserir = (parsedData as (ContaCSV | ContaJSON)[]).map(conta => ({
        proprietario_id: proprietarioId,
        Conta: conta.Conta,
        codigo_reduzido: conta['Código reduzido'] || null,
        Descricao: conta.Descrição.trim(),
        Analitica: conta.Analítica,
        // Campos booleanos são definidos como false por padrão no DB, mas para garantir
        is_conta_caixa_banco: false,
        is_conta_patrimonial: false,
        is_conta_resultado: false,
      })) as PlanoContas[];
      
      setNewPlanoContas(contasParaInserir);

      // 2. Verificar se existem contas de saldo (saldo_contas) vinculadas ao plano antigo
      const { data: oldSaldosData, error: oldSaldosError } = await supabase
        .from('saldo_contas')
        .select(`
            id,
            nome,
            saldo_inicial,
            conta_contabil_id,
            plano_contas ( Descricao )
        `)
        .eq('proprietario_id', proprietarioId)
        .not('conta_contabil_id', 'is', null);

      if (oldSaldosError) throw oldSaldosError;
      
      const oldSaldos = (oldSaldosData as any[]).map(s => ({
          id: s.id,
          nome: s.nome,
          saldo_inicial: s.saldo_inicial,
          old_conta_contabil_id: s.conta_contabil_id,
          old_conta_contabil_nome: s.plano_contas?.Descricao || 'Conta Antiga Desconhecida',
      })) as OldSaldoData[];

      if (oldSaldos.length > 0) {
        // Se houver saldos antigos, abre o modal de mapeamento
        setOldSaldosToMap(oldSaldos);
        setMappingDialogOpen(true);
      } else {
        // Se não houver saldos antigos, procede com a exclusão direta e inserção
        await performDirectImport(proprietarioId, contasParaInserir);
        onImportComplete();
        showSuccess(`Plano de Contas importado com sucesso! ${contasParaInserir.length} contas adicionadas.`);
      }

    } catch (error) {
      console.error('Erro durante a importação:', error);
      showError('Falha na importação: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleMappingComplete = () => {
      setMappingDialogOpen(false);
      onImportComplete();
  };
  
  // Função para fechar o modal (necessária para onOpenChange)
  const handleClose = (open: boolean) => {
      if (!open) {
          setMappingDialogOpen(false);
      }
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl">Importar Plano de Contas (CSV/JSON)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Selecione um arquivo CSV (<code>Conta;Código reduzido;Descrição;Analítica</code>) ou JSON (array de objetos).
            <span className="font-bold text-red-500 block mt-1">Atenção: A importação substituirá o plano de contas existente.</span>
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
        </CardContent>
      </Card>
      
      {/* Modal de Mapeamento de Saldos */}
      {proprietarioId && (
          <MapearSaldosDialog
              open={mappingDialogOpen}
              onOpenChange={handleClose}
              oldSaldos={oldSaldosToMap}
              newPlanoContas={newPlanoContas}
              proprietarioId={proprietarioId}
              onSaveComplete={handleMappingComplete}
          />
      )}
    </>
  );
};

export default ImportarPlanoContas;