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

interface ImportarPlanoContasProps {
  onImportComplete: () => void;
}

// Novo tipo para o estado de mapeamento (unificado)
interface OldFKData {
    id: string;
    nome: string;
    tabela: 'saldo_contas' | 'config_cr' | 'config_cp' | 'config_stripe_sintetica' | 'config_stripe_receber';
    old_conta_contabil_id: string;
    old_conta_contabil_nome: string;
    saldo_inicial?: number; // Apenas para saldo_contas
    tipo_registro?: string; // Apenas para configs CR/CP
    
    // Campos booleanos da conta antiga (para herança) - CORREÇÃO TS2353
    is_conta_caixa_banco?: boolean;
    is_conta_patrimonial?: boolean;
    is_conta_resultado?: boolean;
}

const ImportarPlanoContas: React.FC<ImportarPlanoContasProps> = ({ onImportComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const { usuario, role, perfil } = useSessao();
  
  // Estados para o modal de mapeamento
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [oldFKsToMap, setOldFKsToMap] = useState<OldFKData[]>([]);
  const [newPlanoContas, setNewPlanoContas] = useState<PlanoContas[]>([]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      // Sugere o título baseado no nome do arquivo
      // setTitulo(selectedFile.name.replace(/\.(txt|html|doc|docx)$/i, '').trim());
    } else {
      setFile(null);
      // setTitulo('');
    }
  };

  const getProprietarioId = (): string | null => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null; // FIX: proprietario_id -> cliente_id
    return null;
  };
  
  const proprietarioId = getProprietarioId();

  // REMOVIDO: performDirectImport

  const fetchAllFKs = async (proprietarioId: string): Promise<OldFKData[]> => {
      const fks: OldFKData[] = [];
      
      // 1. Saldo Contas
      const { data: saldosData } = await supabase
        .from('saldo_contas')
        .select(`id, nome, saldo_inicial, conta_contabil_id, plano_contas ( Descricao, is_conta_caixa_banco, is_conta_patrimonial )`)
        .eq('proprietario_id', proprietarioId)
        .not('conta_contabil_id', 'is', null);
        
      (saldosData || []).forEach((s: any) => fks.push({
          id: s.id,
          nome: s.nome,
          tabela: 'saldo_contas',
          old_conta_contabil_id: s.conta_contabil_id,
          old_conta_contabil_nome: s.plano_contas?.Descricao || 'Conta Antiga Desconhecida',
          saldo_inicial: s.saldo_inicial,
          // Adicionando os booleanos da conta antiga para herança
          is_conta_caixa_banco: s.plano_contas?.is_conta_caixa_banco,
          is_conta_patrimonial: s.plano_contas?.is_conta_patrimonial,
      }));
      
      // 2. Configurações CR
      const { data: crData } = await supabase
        .from('configuracao_contas_receber')
        .select(`id, tipo_registro, conta_contabil_id, plano_contas ( Descricao, is_conta_resultado )`)
        .eq('proprietario_id', proprietarioId)
        .not('conta_contabil_id', 'is', null);
        
      (crData || []).forEach((c: any) => fks.push({
          id: c.id,
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
        .eq('proprietario_id', proprietarioId)
        .not('conta_contabil_id', 'is', null);
        
      (cpData || []).forEach((c: any) => fks.push({
          id: c.id,
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
        .select(`id, conta_sintetica_id, conta_receber_id, historico_padrao_id, plano_contas_sintetica:conta_sintetica_id ( Descricao, is_conta_caixa_banco, is_conta_patrimonial ), plano_contas_receber:conta_receber_id ( Descricao, is_conta_caixa_banco, is_conta_patrimonial )`)
        .eq('proprietario_id', proprietarioId);
        
      (stripeData || []).forEach((s: any) => {
          if (s.conta_sintetica_id) {
              fks.push({
                  id: s.id,
                  nome: 'Stripe: Conta Sintética',
                  tabela: 'config_stripe_sintetica',
                  old_conta_contabil_id: s.conta_sintetica_id,
                  old_conta_contabil_nome: s.plano_contas_sintetica?.Descricao || 'Conta Antiga Desconhecida',
                  tipo_registro: 'conta_sintetica_id',
                  is_conta_caixa_banco: s.plano_contas_sintetica?.is_conta_caixa_banco,
                  is_conta_patrimonial: s.plano_contas_sintetica?.is_conta_patrimonial,
              });
          }
          if (s.conta_receber_id) {
              fks.push({
                  id: s.id,
                  nome: 'Stripe: Conta Receber',
                  tabela: 'config_stripe_receber',
                  old_conta_contabil_id: s.conta_receber_id,
                  old_conta_contabil_nome: s.plano_contas_receber?.Descricao || 'Conta Antiga Desconhecida',
                  tipo_registro: 'conta_receber_id',
                  is_conta_caixa_banco: s.plano_contas_receber?.is_conta_caixa_banco,
                  is_conta_patrimonial: s.plano_contas_receber?.is_conta_patrimonial,
              });
          }
      });
      
      return fks;
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
      
      const contasParaInserir = (parsedData as (ContaCSV | ContaJSON)[]).map(conta => {
          const codigoReduzido = conta['Código reduzido'] || conta.Conta.replace(/\./g, '');
          
          return {
            proprietario_id: proprietarioId,
            Conta: conta.Conta,
            codigo_reduzido: codigoReduzido, // CORREÇÃO AQUI
            Descricao: conta.Descrição.trim(),
            Analitica: conta.Analítica,
            is_conta_caixa_banco: false,
            is_conta_patrimonial: false,
            is_conta_resultado: false,
          } as PlanoContas;
      });
      
      setNewPlanoContas(contasParaInserir);

      // 2. Verificar todas as FKs existentes
      const oldFKs = await fetchAllFKs(proprietarioId);

      if (oldFKs.length > 0) {
        // Se houver FKs antigas, abre o modal de mapeamento
        setOldFKsToMap(oldFKs);
        setMappingDialogOpen(true);
      } else {
        // Se não houver FKs antigas, procede com a exclusão direta e inserção (usando a Edge Function)
        
        // 3. Setar todas as FKs para NULL (para evitar a violação)
        await supabase.from('saldo_contas').update({ conta_contabil_id: null }).eq('proprietario_id', proprietarioId);
        await supabase.from('lancamentos').update({ conta_contabil_id: null }).eq('proprietario_id', proprietarioId);
        await supabase.from('configuracao_contas_receber').update({ conta_contabil_id: null }).eq('proprietario_id', proprietarioId);
        await supabase.from('configuracao_contas_pagar').update({ conta_contabil_id: null }).eq('proprietario_id', proprietarioId);
        await supabase.from('configuracoes_stripe').update({ conta_sintetica_id: null, conta_receber_id: null }).eq('proprietario_id', proprietarioId);
        
        // 4. Chamar Edge Function para Excluir/Inserir
        const { data, error: invokeError } = await supabase.functions.invoke('manage-plano-contas', {
            body: { proprietarioId, newPlanoContas: contasParaInserir },
        });
        
        if (invokeError) throw invokeError;
        if (data?.error) throw new Error(data.error);
        
        onImportComplete();
        // MENSAGEM DE SUCESSO ALTERADA
        showSuccess(`Cadastro do Plano de Contas realizado com sucesso.`);
      }

    } catch (error) {
      console.error('Erro durante a importação:', error);
      // MENSAGEM DE ERRO ALTERADA
      showError('Falha na importação do Plano de Contas: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleMappingComplete = () => {
      setMappingDialogOpen(false);
      onImportComplete();
  };
  
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
              accept=".csv,text/csv,.json,application/json" 
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
      
      {/* Modal de Mapeamento de FKs */}
      {proprietarioId && (
          <MapearTodasFKsDialog
              open={mappingDialogOpen}
              onOpenChange={handleClose}
              oldFKs={oldFKsToMap}
              newPlanoContas={newPlanoContas}
              proprietarioId={proprietarioId}
              onSaveComplete={handleMappingComplete}
          />
      )}
    </>
  );
};

export default ImportarPlanoContas;