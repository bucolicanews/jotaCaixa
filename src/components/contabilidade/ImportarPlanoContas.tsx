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
import MapearTodasFKsDialog from './MapearTodasFKsDialog';

const PADROES_CONTRATO = {
  conta_debito: { Conta: '1.1.02.0002', Descricao: 'Clientes Contratos a Receber' },
  conta_credito: { Conta: '4.1.01.0001', Descricao: 'Prestação de Serviços Contábeis' },
};

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
          old_conta_contabil_nome: s.plano_contas?.Descricao || 'Conta Antiga Desconhecida',
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
          old_conta_contabil_nome: c.plano_contas?.Descricao || 'Conta Antiga Desconhecida',
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
          old_conta_contabil_nome: c.plano_contas?.Descricao || 'Conta Antiga Desconhecida',
          tipo_registro: c.tipo_registro,
          is_conta_resultado: c.plano_contas?.is_conta_resultado,
      }));
      
      // 4. Configurações Stripe
      const { data: stripeData } = await supabase
        .from('configuracoes_stripe')
        .select(`id, conta_sintetica_id, conta_receber_id, plano_contas_sintetica:conta_sintetica_id ( Descricao, is_conta_caixa_banco, is_conta_patrimonial ), plano_contas_receber:conta_receber_id ( Descricao, is_conta_caixa_banco, is_conta_patrimonial )`)
        .eq('proprietario_id', targetId);
        
      (stripeData || []).forEach((s: any) => {
          if (s.conta_sintetica_id) {
              fks.push({
                  id: `${s.id}|conta_sintetica_id`,
                  record_id: s.id,
                  nome: 'Stripe: Conta Sintética',
                  tabela: 'config_stripe_sintetica',
                  old_conta_contabil_id: s.conta_sintetica_id,
                  old_conta_contabil_nome: s.plano_contas_sintetica?.Descricao || 'Conta Antiga Desconhecida',
                  is_conta_caixa_banco: s.plano_contas_sintetica?.is_conta_caixa_banco,
                  is_conta_patrimonial: s.plano_contas_sintetica?.is_conta_patrimonial,
              });
          }
          if (s.conta_receber_id) {
              fks.push({
                  id: `${s.id}|conta_receber_id`,
                  record_id: s.id,
                  nome: 'Stripe: Conta Receber',
                  tabela: 'config_stripe_receber',
                  old_conta_contabil_id: s.conta_receber_id,
                  old_conta_contabil_nome: s.plano_contas_receber?.Descricao || 'Conta Antiga Desconhecida',
                  is_conta_caixa_banco: s.plano_contas_receber?.is_conta_caixa_banco,
                  is_conta_patrimonial: s.plano_contas_receber?.is_conta_patrimonial,
              });
          }
      });
      
      // 5. Configurações Contrato (REVISADO)
      const { data: contratoData } = await supabase
        .from('configuracao_contratos')
        .select(`id, id_conta_clientes_receber, id_conta_receita_contrato, 
                 plano_contas_clientes:id_conta_clientes_receber ( Descricao, is_conta_patrimonial ),
                 plano_contas_receita:id_conta_receita_contrato ( Descricao, is_conta_resultado )
                `)
        .eq('proprietario_id', targetId)
        .maybeSingle();

      if (contratoData) {
        if (contratoData.id_conta_clientes_receber) {
          fks.push({
            id: `${contratoData.id}|id_conta_clientes_receber`,
            record_id: contratoData.id,
            nome: 'Contrato: Clientes a Receber (Ativo)',
            tabela: 'config_contrato_ativo',
            old_conta_contabil_id: contratoData.id_conta_clientes_receber,
            old_conta_contabil_nome: contratoData.plano_contas_clientes?.Descricao || 'Clientes a Receber (Antiga)',
            is_conta_patrimonial: true,
          });
        }
        if (contratoData.id_conta_receita_contrato) {
          fks.push({
            id: `${contratoData.id}|id_conta_receita_contrato`,
            record_id: contratoData.id,
            nome: 'Contrato: Receita (Resultado)',
            tabela: 'config_contrato_receita',
            old_conta_contabil_id: contratoData.id_conta_receita_contrato,
            old_conta_contabil_nome: contratoData.plano_contas_receita?.Descricao || 'Receita Contratos (Antiga)',
            is_conta_resultado: true,
          });
        }
      }
     
      // 6. Lançamentos (Uso direto de contas)
      const { data: lancData } = await supabase
        .from('lancamentos')
        .select(`conta_contabil_id, conta_resultado_id`)
        .eq('proprietario_id', targetId);

      const lancContaSet = new Set<string>();
      const lancResultadoSet = new Set<string>();

      (lancData || []).forEach((l: any) => {
        if (l.conta_contabil_id) lancContaSet.add(l.conta_contabil_id);
        if (l.conta_resultado_id) lancResultadoSet.add(l.conta_resultado_id);
      });

      const nomeByPlanoContasId: Record<string, string> = {};
      const allLancPlanoContasIds = Array.from(new Set([...lancContaSet, ...lancResultadoSet]));

      if (allLancPlanoContasIds.length > 0) {
        const { data: planoContasNomes } = await supabase
          .from('plano_contas')
          .select('id, Descricao')
          .in('id', allLancPlanoContasIds);

        (planoContasNomes || []).forEach((c: any) => {
          if (c?.id) nomeByPlanoContasId[c.id] = c?.Descricao || '';
        });
      }

      lancContaSet.forEach((oldId) => {
        fks.push({
          id: `${oldId}|lancamentos_conta`,
          record_id: oldId,
          nome: 'Lançamentos: Conta Contábil',
          tabela: 'lancamentos_conta',
          old_conta_contabil_id: oldId,
          old_conta_contabil_nome: nomeByPlanoContasId[oldId] || 'Conta Desconhecida',
        });
      });

      lancResultadoSet.forEach((oldId) => {
        fks.push({
          id: `${oldId}|lancamentos_resultado`,
          record_id: oldId,
          nome: 'Lançamentos: Conta Resultado',
          tabela: 'lancamentos_resultado',
          old_conta_contabil_id: oldId,
          old_conta_contabil_nome: nomeByPlanoContasId[oldId] || 'Conta Desconhecida',
        });
      });

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
        showError('O arquivo está vazio ou incorreto.');
        setLoading(false);
        return;
      }
      
      const contasParaInserir = (parsedData as any[])
        .map((conta: any) => {
          const contaCodigo = conta.Conta || conta.conta;
          if (!contaCodigo) return null;

          const descricaoRaw = conta['Descrição'] || conta.Descricao || conta.descricao || '';
          const analiticaRaw = (conta['Analítica'] || conta.Analitica || conta.analitica) === 'Sim' ? 'Sim' : 'Não';
          const codigoReduzido = conta['Código reduzido'] || conta.codigo_reduzido || contaCodigo.replace(/\./g, '');

          return {
            proprietario_id: proprietarioId,
            Conta: String(contaCodigo),
            codigo_reduzido: String(codigoReduzido),
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
      
      setNewPlanoContas(contasParaInserir);

      const oldFKs = await fetchAllFKs(proprietarioId);

      if (oldFKs.length > 0) {
        setOldFKsToMap(oldFKs);
        setMappingDialogOpen(true);
      } else {
        const { data, error: invokeError } = await supabase.functions.invoke('manage-plano-contas', {
            body: { proprietarioId, newPlanoContas: contasParaInserir },
        });
        
        if (invokeError) throw invokeError;
        if (data?.error) throw new Error(data.error);
        
        onImportComplete();
        showSuccess(`Plano de Contas substituído com sucesso.`);
      }

    } catch (error: any) {
      console.error('Erro na importação:', error);
      showError('Falha na importação: ' + error.message);
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
            A importação substituirá o plano atual. Referências de saldo e faturamento deverão ser remapeadas.
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