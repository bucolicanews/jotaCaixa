import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import Papa from 'papaparse';
import { Historico } from '@/types/historico';
import { UsuarioProfile } from '@/types/usuario';

const ExportarHistoricos: React.FC = () => {
  const { perfil, role } = useSessao(); // Removido 'usuario'
  const [loading, setLoading] = useState(false);

  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id; // FIX: proprietario_id -> cliente_id
    return null;
  };
  
  const ownerId = getOwnerId();

  const handleExport = useCallback(async () => {
    if (!ownerId) {
      showError('ID do proprietário não encontrado.');
      return;
    }
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('historicos')
        .select('codigo, descricao')
        .eq('proprietario_id', ownerId)
        .order('codigo', { ascending: true });

      if (error) throw error;

      const historicos = data as Historico[];

      if (historicos.length === 0) {
        showError('Nenhum histórico encontrado para exportação.');
        setLoading(false);
        return;
      }

      // Mapeamento para o formato Calima (Código;Descrição)
      const dataToExport = historicos.map(h => ({
        Código: h.codigo || '',
        Descrição: h.descricao,
      }));

      const csv = Papa.unparse(dataToExport, {
        header: true,
        delimiter: ';',
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'historicos_calima.csv');
      link.click();

      showSuccess('Históricos exportados com sucesso!');

    } catch (error: any) {
      console.error('Erro ao exportar históricos:', error);
      showError('Falha na exportação: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center"><History className="w-5 h-5 mr-2" /> Exportar Históricos</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Exporta a lista de históricos cadastrados no formato CSV (Código;Descrição) para importação no Calima.
        </p>
        <Button onClick={handleExport} disabled={loading} className="w-full">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
          Baixar Históricos CSV
        </Button>
      </CardContent>
    </Card>
  );
};

export default ExportarHistoricos;