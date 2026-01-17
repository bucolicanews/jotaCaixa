import { useState, useEffect } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Save, Check, AlertCircle, ShieldCheck, Globe, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSessao } from '@/hooks/use-sessao';
import type { PagBankConfig } from '@/types/pagbank';

interface PlanoContas {
  id: string;
  Conta: string;
  Descricao: string;
}

interface Historico {
  id: string;
  codigo: string;
  descricao: string;
}

export default function ConfiguracoesPagBank() {
  const { ownerId } = useSessao();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<Partial<PagBankConfig>>({
    ambiente: 'sandbox',
    webhook_url: '',
  });
  const [planoContas, setPlanoContas] = useState<PlanoContas[]>([]);
  const [historicos, setHistoricos] = useState<Historico[]>([]);

  useEffect(() => {
    if (!ownerId) return;
    carregarDados();
  }, [ownerId]);

  const carregarDados = async () => {
    try {
      setLoading(true);

      const [configRes, planoRes, histRes] = await Promise.all([
        supabase
          .from('configuracoes_pagbank')
          .select('*')
          .eq('proprietario_id', ownerId)
          .maybeSingle(),
        supabase
          .from('plano_contas')
          .select('id, Conta, Descricao')
          .eq('proprietario_id', ownerId)
          .eq('Analitica', 'Sim')
          .order('Conta'),
        supabase
          .from('historicos')
          .select('id, codigo, descricao')
          .eq('proprietario_id', ownerId)
          .order('codigo'),
      ]);

      if (configRes.data) {
        setConfig(configRes.data);
      } else {
        // Default webhook URL if not set
        const projectId = window.location.hostname.split('.')[0];
        setConfig(prev => ({
            ...prev,
            webhook_url: `https://jqoirlswewggyppgvgnv.supabase.co/functions/v1/pagbank-webhook`
        }));
      }

      if (planoRes.data) setPlanoContas(planoRes.data);
      if (histRes.data) setHistoricos(histRes.data);
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.token_producao && config.ambiente === 'producao') {
        toast.error('O token de produção é obrigatório para o ambiente de Produção.');
        return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('configuracoes_pagbank')
        .upsert({
          proprietario_id: ownerId,
          ...config,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'proprietario_id',
        });

      if (error) throw error;
      toast.success('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <LayoutPrincipal>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <div className="container mx-auto py-6 space-y-6 max-w-5xl">
        <div className="flex justify-between items-start">
            <div>
                <h1 className="text-3xl font-bold">Integração PagBank</h1>
                <p className="text-muted-foreground">
                    Gerencie suas credenciais e mapeamentos contábeis para pagamentos automáticos.
                </p>
            </div>
            <Badge variant={config.ambiente === 'producao' ? 'success' : 'warning'} className="text-sm px-3 py-1">
                {config.ambiente === 'producao' ? 'MODO PRODUÇÃO' : 'MODO SANDBOX'}
            </Badge>
        </div>

        {config.ambiente === 'producao' && (
            <Alert className="bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                <AlertTitle className="text-green-800 dark:text-green-400 font-bold">Ambiente de Produção Ativo</AlertTitle>
                <AlertDescription className="text-green-700 dark:text-green-500">
                    O sistema está operando com transações reais. Certifique-se de que todos os mapeamentos contábeis abaixo estão corretos.
                </AlertDescription>
            </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Globe className="w-5 h-5 text-primary" /> Credenciais e Ambiente
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                            <div className="space-y-0.5">
                                <Label className="text-base">Ativar Modo Produção</Label>
                                <p className="text-sm text-muted-foreground">
                                    Mude para processar pagamentos reais de seus clientes.
                                </p>
                            </div>
                            <Switch
                                checked={config.ambiente === 'producao'}
                                onCheckedChange={(checked) => setConfig({ ...config, ambiente: checked ? 'producao' : 'sandbox' })}
                            />
                        </div>

                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="token_producao">Token de Produção (PagBank iBanking)</Label>
                                <Input
                                    id="token_producao"
                                    type="password"
                                    placeholder="Insira o token gerado no iBanking"
                                    value={config.token_producao || ''}
                                    onChange={(e) => setConfig({ ...config, token_producao: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="token_sandbox">Token de Sandbox (Testes)</Label>
                                <Input
                                    id="token_sandbox"
                                    type="password"
                                    placeholder="Token de teste"
                                    value={config.token_sandbox || ''}
                                    onChange={(e) => setConfig({ ...config, token_sandbox: e.target.value })}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Save className="w-5 h-5 text-primary" /> Mapeamento Contábil
                        </CardTitle>
                        <CardDescription>Indispensável para que a baixa automática funcione.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Conta PagBank (Ativo)</Label>
                                <Select value={config.conta_sintetica_id || ''} onValueChange={(v) => setConfig({...config, conta_sintetica_id: v})}>
                                    <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                                    <SelectContent>
                                        {planoContas.filter(c => c.Conta.startsWith('1.')).map(c => (
                                            <SelectItem key={c.id} value={c.id}>{c.Conta} - {c.Descricao}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Conta de Receita (DRE)</Label>
                                <Select value={config.id_conta_resultado || ''} onValueChange={(v) => setConfig({...config, id_conta_resultado: v})}>
                                    <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                                    <SelectContent>
                                        {planoContas.filter(c => c.Conta.startsWith('4.')).map(c => (
                                            <SelectItem key={c.id} value={c.id}>{c.Conta} - {c.Descricao}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Conta de Despesa (Taxas Bancárias)</Label>
                            <Select value={config.conta_despesa_taxa_id || ''} onValueChange={(v) => setConfig({...config, conta_despesa_taxa_id: v})}>
                                <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                                <SelectContent>
                                    {planoContas.filter(c => c.Conta.startsWith('5.')).map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.Conta} - {c.Descricao}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                            <div className="space-y-2">
                                <Label>Histórico Padrão (Recebimentos)</Label>
                                <Select value={config.historico_padrao_id || ''} onValueChange={(v) => setConfig({...config, historico_padrao_id: v})}>
                                    <SelectTrigger><SelectValue placeholder="Selecione o histórico" /></SelectTrigger>
                                    <SelectContent>
                                        {historicos.map(h => (
                                            <SelectItem key={h.id} value={h.id}>{h.codigo} - {h.descricao}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Histórico Padrão (Taxas)</Label>
                                <Select value={config.historico_taxa_id || ''} onValueChange={(v) => setConfig({...config, historico_taxa_id: v})}>
                                    <SelectTrigger><SelectValue placeholder="Selecione o histórico" /></SelectTrigger>
                                    <SelectContent>
                                        {historicos.map(h => (
                                            <SelectItem key={h.id} value={h.id}>{h.codigo} - {h.descricao}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Webhook</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>URL do Webhook</Label>
                            <Input readOnly value={config.webhook_url} className="bg-muted font-mono text-xs" />
                            <p className="text-[10px] text-muted-foreground">
                                Cole esta URL no Portal PagBank (Vendas > Integrações)
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Secret do Webhook (Opcional)</Label>
                            <Input 
                                type="password" 
                                value={config.webhook_secret || ''} 
                                onChange={(e) => setConfig({...config, webhook_secret: e.target.value})}
                                placeholder="Secret para validação HMAC"
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2"><Info className="w-4 h-4" /> Homologação</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs space-y-2 text-blue-800 dark:text-blue-300">
                        <p>Para finalizar a homologação:</p>
                        <ol className="list-decimal list-inside space-y-1">
                            <li>Ative o <strong>Modo Produção</strong></li>
                            <li>Gere uma cobrança PIX real</li>
                            <li>Abra o Console (F12) e copie os logs</li>
                            <li>Envie para o suporte do PagBank</li>
                        </ol>
                    </CardContent>
                </Card>

                <Button onClick={handleSave} disabled={saving} className="w-full h-12 shadow-md">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar Todas as Configurações
                </Button>
            </div>
        </div>
      </div>
    </LayoutPrincipal>
  );
}