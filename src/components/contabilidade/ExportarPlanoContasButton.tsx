import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import Papa from 'papaparse';
import { PlanoContas } from '@/types/plano-contas';
import { UsuarioProfile } from '@/types/usuario';

interface ExportarPlanoContasButtonProps {
    onExportStart?: () => void;
    onExportEnd?: () => void;
}

const ExportarPlanoContasButton: React.FC<ExportarPlanoContasButtonProps> = ({ onExportStart, onExportEnd }) => {
  const { perfil, role } = useSessao();
  const [loading, setLoading] = useState(false);

  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId();

  const handleExport = useCallback(async () => {
    if (!ownerId) {
      showError('ID do proprietário não encontrado.');
      return;
    }
    onExportStart?.();
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('plano_contas')
        .select('Conta, codigo_reduzido, Descricao, Analitica')
        .eq('proprietario_id', ownerId)
        .order('Conta', { ascending: true });

      if (error) throw error;

      const contas = data as PlanoContas[];

      if (contas.length === 0) {
        showError('Nenhuma conta encontrada para exportação.');
        setLoading(false);
        onExportEnd?.();
        return;
      }

      // Mapeamento para o formato Calima (Conta;Código reduzido;Descrição;Analítica)
      const dataToExport = contas.map(c => ({
        Conta: c.Conta,
        'Código reduzido': c.codigo_reduzido || '',
        Descrição: c.Descricao,
        Analítica: c.Analitica,
      }));

      const csv = Papa.unparse(dataToExport, {
        header: true,
        delimiter: ';',
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'plano_contas_calima.csv');
      link.click();

      showSuccess('Plano de Contas exportado com sucesso!');

    } catch (error: any) {
      console.error('Erro ao exportar plano de contas:', error);
      showError('Falha na exportação: ' + error.message);
    } finally {
      setLoading(false);
      onExportEnd?.();
    }
  }, [ownerId, onExportStart, onExportEnd]);

  return (
    <Button onClick={handleExport} disabled={loading} variant="secondary" className="w-full sm:w-auto">
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
      Exportar CSV
    </Button>
  );
};

export default ExportarPlanoContasButton;