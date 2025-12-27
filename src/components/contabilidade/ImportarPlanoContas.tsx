import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Loader2 } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';
import { parseFile } from '@/utils/file-parser';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { PlanoContas } from '@/types/plano-contas';
import { ClienteProfile } from '@/types/usuario';
import MapearTodasFKsDialog from './MapearTodasFKsDialog';

interface ImportarPlanoContasProps {
  onImportComplete: () => void;
}

interface OldFKData {
    id: string;
    record_id: string;
    nome: string;
    tabela:
      | 'saldo_contas'
      | 'config_cr'
      | 'config_cp'
      | 'config_stripe_sintetica'
      | 'config_stripe_receber'
      | 'config_contrato_ativo'
      | 'config_contrato_receita'
      | 'lancamentos_conta'
      | 'lancamentos_resultado';
    old_conta_contabil_id: string;
    old_conta_contabil_nome: string;
    saldo_inicial?: number;
    tipo_registro?: string;
    is_conta_caixa_banco?: boolean;
    is_conta_patrimonial?: boolean;
    is_conta_resultado?: boolean;
}

const ImportarPlanoContas: React.FC<ImportarPlanoContasProps> = ({ onImportComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const { usuario, role, perfil } = useSessao();
  
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [oldFKsToMap, setOldFKsToMap] = useState<OldFKData[]>([]);
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
    if (role === 'Usuario') {
        const user = perfil as any;
        return user?.cliente_id || user?.admin_id || null;
    }
    return null;
  };
  
  const proprietarioId = getProprietarioId();

  const fetchAllFKs = async (targetId: string): Promise<OldFKData[]> => {
      const fks: OldFKData[] = [];
      
      // 1. Saldo Contas
      const { data: saldosData } = await supabase
        .from('saldo_contas')
        .select(`id, nome, saldo_inicial, conta_contabil_id, plano_contas ( Descricao, is_conta_caixa_banco, is_conta_patrimonial )`)
        .eq('proprietario_id', targetId)
        .not('conta_contabil_id', 'is', null);
        
      (saldosData || []).forEach((s: any) => fks.push({
          id: s.id,
          record_id: s.id,
          nome: s.nome,
          tabela: 'saldo_contas',
          old_conta_contabil_id: s.conta_contabil_id,
          old_conta_contabil_nome: s.plano_contas?.Descricao || 'Conta Antiga',
          saldo_inicial: s.saldo_inicial,
          is_conta_caixa_banco: s.plano_contas?.is_conta_caixa_banco,
          is_conta_patrimonial: s.plano_contas?.is_conta_patrimonial,
      }));
      
      // 2. Configurações CR
      const { data: crData } = await supabase
        .from('configuracao_contas_receber')
        .select(`id, tipo_registro, conta_contabil_id, plano_contas ( Descricao, is_conta_resultado )`)
        .eq('proprietario_id', targetId)
        .not('conta_contabil_id', 'is', null);
        
      (crData || []).forEach((c: any) => fks.push({
          id: c.id,
          record_id: c.id,
          nome: `CR: ${c.tipo_registro}`,
          tabela: 'config_cr',
          old_conta_contabil_id: c.conta_contabil_id,
          old_conta_contabil_nome: c.plano_contas?.Descricao || 'Conta Antiga',
          tipo_registro: c.tipo_registro,
          is_conta_resultado: c.plano_contas?.is_conta_resultado,
      }));
      
      // 3. Configurações CP
      const { data: cpData } = await supabase
        .from('configuracao_contas_pagar')
        .select(`id, tipo_registro, conta_contabil_id, plano_contas ( Descricao, is_conta_resultado )`)
        .eq('proprietario_id', targetId)
        .not('conta_contabil_id', 'is', null);
        
      (cpData || []).forEach((c: any) => fks.push({
          id: c.id,
          record_id: c.id,
          nome: `CP: ${c.tipo_registro}`,
          tabela: 'config_cp',
          old_conta_contabil_id: c.conta_contabil_id,
          old_conta_contabil_nome: c.plano_contas?.Descricao || 'Conta Antiga',
          tipo_registro: c.tipo_registro,
          is_conta_resultado: c.plano_contas?.is_conta_resultado,
      }));

      return fks;
  };

  const handleImport = async () => {
    if (!file || !proprietarioId) {
      showError('Selecione um arquivo e verifique sua sessão.');
      return;
    }

    setLoading(true);

    try {
      const parsedData = await parseFile(file);

      if (parsedData.length === 0) {
        showError('O arquivo está vazio ou o formato das colunas está incorreto.');
        setLoading(false);
        return;
      }
      
      // Higieniza os dados garantindo apenas as colunas válidas e tipos corretos
      const contasParaInserir = (parsedData as any[])
        .map((conta: any) => {
          const contaCodigo = conta.Conta || conta.conta;
          const descricaoRaw = conta['Descrição'] || conta.Descricao || conta.descricao;
          
          if (!contaCodigo || !descricaoRaw) return null;

          const analiticaRaw = (conta['Analítica'] || conta.Analitica || conta.analitica) === 'Sim' ? 'Sim' : 'Não';
          const codigoReduzido = conta['Código reduzido'] || conta.codigo_reduzido || String(contaCodigo).replace(/\./g, '');

          // Retorna estritamente as colunas esperadas pelo DB
          return {
            proprietario_id: proprietarioId,
            Conta: String(contaCodigo).trim(),
            codigo_reduzido: String(codigoReduzido).trim(),
            Descricao: String(descricaoRaw).trim(),
            Analitica: analiticaRaw,
            is_conta_caixa_banco: !!conta.is_conta_caixa_banco,
            is_conta_patrimonial: !!conta.is_conta_patrimonial,
            is_conta_resultado: !!conta.is_conta_resultado,
            is_caixa: !!conta.is_caixa,
            is_banco: !!conta.is_banco,
            is_a_receber: !!conta.is_a_receber,
            is_a_pagar: !!conta.is_a_pagar,
          } as PlanoContas;
        })
        .filter((conta): conta is PlanoContas => Boolean(conta));
      
      if (contasParaInserir.length === 0) {
          throw new Error("Nenhuma conta válida encontrada. Verifique se as colunas 'Conta' e 'Descrição' estão corretas.");
      }

      setNewPlanoContas(contasParaInserir);

      // Busca vínculos existentes para restauração
      const oldFKs = await fetchAllFKs(proprietarioId);

      if (oldFKs.length > 0) {
        setOldFKsToMap(oldFKs);
        setMappingDialogOpen(true);
      } else {
        // Importação direta se não houver dados vinculados
        const { data, error: invokeError } = await supabase.functions.invoke('manage-plano-contas', {
            body: { proprietarioId, newPlanoContas: contasParaInserir },
        });
        
        if (invokeError) throw invokeError;
        if (data?.error) throw new Error(data.error);
        
        onImportComplete();
        showSuccess(`Plano de Contas (${contasParaInserir.length} contas) importado com sucesso.`);
      }

    } catch (error: any) {
      console.error('Erro na importação:', error);
      // Extrai a mensagem de erro detalhada da resposta da Edge Function se disponível
      const errorMsg = error.response ? await error.response.json().then((d: any) => d.error || d.message) : error.message;
      showError('Falha na importação: ' + (errorMsg || 'Verifique o formato do arquivo.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader><CardTitle className="text-xl">Importar Plano de Contas</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A importação substituirá o plano atual. Certifique-se de que as flags de marcadores (Caixa, Banco, etc) estão preenchidas.
          </p>
          <div className="flex items-center space-x-2">
            <Input type="file" accept=".csv,.json" onChange={handleFileChange} className="flex-1" disabled={loading} />
            <Button onClick={handleImport} disabled={!file || loading || !proprietarioId}>
              {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Upload className="h-4 w-4" />}
              Importar
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {proprietarioId && (
          <MapearTodasFKsDialog
              open={mappingDialogOpen}
              onOpenChange={setMappingDialogOpen}
              oldFKs={oldFKsToMap}
              newPlanoContas={newPlanoContas}
              proprietarioId={proprietarioId}
              onSaveComplete={onImportComplete}
          />
      )}
    </>
  );
};

export default ImportarPlanoContas;