import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Loader2, Upload, Link as LinkIcon, FileDown } from 'lucide-react';
import { format } from 'date-fns';
import Papa from 'papaparse';

interface Registration {
  id: number;
  plano_de_contas: any;
  historicos: any;
  created_at: string;
}

interface FormConfiguracaoTabelasPadraoProps {
  adminId: string | null;
}

const parseCsv = (text: string) => {
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    throw new Error(result.errors[0].message);
  }

  return result.data;
};

const parseContent = (text: string, format: 'csv' | 'json' | null) => {
  if (format === 'json') {
    return JSON.parse(text);
  }

  if (format === 'csv') {
    return parseCsv(text);
  }

  try {
    return JSON.parse(text);
  } catch {
    return parseCsv(text);
  }
};

const detectFormat = (sourceName: string) => {
  const lower = sourceName.toLowerCase();
  if (lower.endsWith('.json')) return 'json' as const;
  if (lower.endsWith('.csv')) return 'csv' as const;
  return null;
};

const readFileText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

const FormConfiguracaoTabelasPadrao: React.FC<FormConfiguracaoTabelasPadraoProps> = ({ adminId }) => {
  const [planData, setPlanData] = useState<any | null>(null);
  const [historyData, setHistoryData] = useState<any | null>(null);
  const [planSource, setPlanSource] = useState<string | null>(null);
  const [historySource, setHistorySource] = useState<string | null>(null);
  const [planLink, setPlanLink] = useState('');
  const [historyLink, setHistoryLink] = useState('');
  const [isFetchingPlan, setIsFetchingPlan] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [entries, setEntries] = useState<Registration[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);

  const fetchEntries = useCallback(async () => {
    if (!adminId) return;
    setLoadingEntries(true);
    const { data, error } = await supabase
      .from('configuracao_tabelas_padrao')
      .select('id, plano_de_contas, historicos, created_at')
      .eq('id_admin', adminId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      showError('Falha ao carregar tabelas padrão: ' + error.message);
      setEntries([]);
    } else {
      setEntries(data as Registration[]);
    }
    setLoadingEntries(false);
  }, [adminId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleFileLoad = async (file: File, type: 'plan' | 'history') => {
    try {
      const text = await readFileText(file);
      const format = detectFormat(file.name);
      const parsed = parseContent(text, format);
      if (type === 'plan') {
        setPlanData(parsed);
        setPlanSource(file.name);
      } else {
        setHistoryData(parsed);
        setHistorySource(file.name);
      }
      showSuccess(`${type === 'plan' ? 'Plano de contas' : 'Históricos'} carregado com sucesso.`);
    } catch (error: any) {
      console.error('Erro ao carregar arquivo:', error);
      showError('Falha ao interpretar o arquivo: ' + error.message);
    }
  };

  const handleLinkFetch = async (url: string, type: 'plan' | 'history') => {
    try {
      const controller = type === 'plan' ? setIsFetchingPlan : setIsFetchingHistory;
      controller(true);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`O arquivo remoto retornou ${response.status}`);
      }
      const text = await response.text();
      const format = detectFormat(url) ?? null;
      const parsed = parseContent(text, format);
      if (type === 'plan') {
        setPlanData(parsed);
        setPlanSource(url);
      } else {
        setHistoryData(parsed);
        setHistorySource(url);
      }
      showSuccess(`${type === 'plan' ? 'Plano de contas' : 'Históricos'} carregado via link.`);
    } catch (error: any) {
      console.error('Erro ao buscar link:', error);
      showError('Falha ao buscar o link: ' + error.message);
    } finally {
      if (type === 'plan') {
        setIsFetchingPlan(false);
      } else {
        setIsFetchingHistory(false);
      }
    }
  };

  const handleSave = async () => {
    if (!adminId) {
      showError('Administrador não identificado.');
      return;
    }

    if (!planData && !historyData) {
      showError('Carregue ao menos um dos dois arquivos (plano ou históricos).');
      return;
    }

    setIsSaving(true);
    try {
      const payload: Record<string, any> = {
        id_admin: adminId,
      };
      if (planData) {
        payload.plano_de_contas = planData;
      }
      if (historyData) {
        payload.historicos = historyData;
      }

      const { error } = await supabase
        .from('configuracao_tabelas_padrao')
        .insert(payload);

      if (error) {
        throw error;
      }

      showSuccess('Tabelas padrão cadastradas com sucesso.');
      setPlanData(null);
      setHistoryData(null);
      setPlanFile(null);
      setHistoryFile(null);
      setPlanLink('');
      setHistoryLink('');
      setPlanSource(null);
      setHistorySource(null);
      fetchEntries();
    } catch (error: any) {
      showError('Falha ao salvar: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const renderSummary = (data: any | null) => {
    if (!data) return 'Nenhum dado carregado';
    if (Array.isArray(data)) {
      return `${data.length} registros`;
    }
    if (typeof data === 'object') {
      return `${Object.keys(data).length} campos`;
    }
    return 'Dados carregados';
  };

  const handleDownload = (data: any, filename: string) => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cadastrar Tabelas Padrão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Plano de Contas (CSV/JSON)</span>
              </div>
              <Input
                type="file"
                accept=".csv,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileLoad(file, 'plan');
                }}
              />
              <div className="flex gap-2">
                <Input
                  placeholder="https://.../plano_contas_padrao.csv"
                  value={planLink}
                  onChange={(e) => setPlanLink(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() => handleLinkFetch(planLink, 'plan')}
                  disabled={!planLink || isFetchingPlan}
                >
                  {isFetchingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                  Carregar do link
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {planSource ? `Fonte: ${planSource}` : renderSummary(planData)}
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Históricos (CSV/JSON)</span>
              </div>
              <Input
                type="file"
                accept=".csv,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileLoad(file, 'history');
                }}
              />
              <div className="flex gap-2">
                <Input
                  placeholder="https://.../historicos_padrao.csv"
                  value={historyLink}
                  onChange={(e) => setHistoryLink(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() => handleLinkFetch(historyLink, 'history')}
                  disabled={!historyLink || isFetchingHistory}
                >
                  {isFetchingHistory ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                  Carregar do link
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {historySource ? `Fonte: ${historySource}` : renderSummary(historyData)}
              </p>
            </div>
          </div>
          <Separator />
          <Button
            onClick={handleSave}
            disabled={!adminId || (!planData && !historyData) || isSaving}
            className="w-full"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Tabelas Padrão
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex justify-between items-center">
          <div>
            <CardTitle className="text-lg">Histórico de Uploads</CardTitle>
            <p className="text-sm text-muted-foreground">Registros mais recentes cadastrados pelo seu perfil.</p>
          </div>
          {loadingEntries && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ainda não há tabelas padrão cadastradas.
            </p>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div key={entry.id} className="border border-border rounded-lg p-4 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span className="font-semibold text-sm">ID #{entry.id}</span>
                    <span className="text-xs text-muted-foreground">
                      {entry.created_at ? format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm') : 'Sem data'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(entry.plano_de_contas, `plano_padrao_${entry.id}.json`)}
                      disabled={!entry.plano_de_contas}
                    >
                      <FileDown className="mr-2 h-3 w-3" /> Plano
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(entry.historicos, `historico_padrao_${entry.id}.json`)}
                      disabled={!entry.historicos}
                    >
                      <FileDown className="mr-2 h-3 w-3" /> Históricos
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {entry.plano_de_contas ? 'Plano carregado' : 'Plano vazio'} · {entry.historicos ? 'Históricos carregados' : 'Históricos vazios'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FormConfiguracaoTabelasPadrao;
