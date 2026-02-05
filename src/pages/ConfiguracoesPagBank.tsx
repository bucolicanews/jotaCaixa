import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Globe, Info, MessageSquare, Percent, Landmark } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { BASE_URL } from '@/config/app-config';
import type { PagBankConfig } from '@/types/pagbank';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

interface PlanoContas {
  id: string;
  Conta: string;
  Descricao: string;
}

interface SaldoConta {
  id: string;
  nome: string;
  conta_contabil_id: string | null;
}

interface Historico {
  id: string;
  codigo: string | null;
  descricao: string;
}

export default function ConfiguracoesPagBank() {
  const { ownerId } = useSessao();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<Partial<PagBankConfig>>({
    ambiente: 'sandbox',
    webhook_url: `${BASE_URL}/api/pagbank-webhook`,
    whatsapp_template: 'Olá {nome}! Segue o link para pagamento de R$ {valor} referente a {descricao}: {link}',
    whatsapp_template_pix: 'Olá {nome}!\n\n📱 Clique no link abaixo para pagar via PIX:\n\n{codigo_pix}\n\n💰 Valor: {valor}\n📅 Vencimento: {vencimento}\n⏰ Válido até: {expiracao}',
    whatsapp_template_link: 'Olá {nome}!\n\nSegue o link para pagamento:\n💰 Valor: {valor}\n\n🔗 {link}',
    aplica_juros_multa: true,
    percentual_multa: 2.0,
    percentual_juros_mes: 1.0,
  });
  
  const [planoContas, setPlanoContas] = useState<PlanoContas[]>([]);
  const [saldoContas, setSaldoContas] = useState<SaldoConta[]>([]);
  const [historicos, setHistoricos] = useState<Historico[]>([]);

  const carregarDados = useCallback(async () => {
    if (!ownerId) return;
    
    try {
      setLoading(true);

      const [configRes, planoRes, saldoRes, histRes] = await Promise.all([
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
          .from('saldo_contas')
          .select('id, nome, conta_contabil_id')
          .eq('proprietario_id', ownerId)
          .order('nome'),
        supabase
          .from('historicos')
          .select('id, codigo, descricao')
          .eq('proprietario_id', ownerId)
          .order('codigo'),
      ]);

      if (configRes.data) {
        setConfig({
            ...configRes.data,
            webhook_url: configRes.data.webhook_url || `${BASE_URL}/api/pagbank-webhook`,
            whatsapp_template: configRes.data.whatsapp_template || 'Olá {nome}! Segue o link para pagamento de R$ {valor} referente a {descricao}: {link}',
            whatsapp_template_pix: configRes.data.whatsapp_template_pix || 'Olá {nome}!\n\n📱 Clique no link abaixo para pagar via PIX:\n\n{codigo_pix}\n\n💰 Valor: {valor}\n📅 Vencimento: {vencimento}\n⏰ Válido até: {expiracao}',
            whatsapp_template_link: configRes.data.whatsapp_template_link || 'Olá {nome}!\n\nSegue o link para pagamento:\n💰 Valor: {valor}\n\n🔗 {link}',
        });
      }

      if (planoRes.data) setPlanoContas(planoRes.data);
      if (saldoRes.data) setSaldoContas(saldoRes.data);
      if (histRes.data) setHistoricos(histRes.data as Historico[]);
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      showError('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const handleSave = async () => {
    if (!ownerId) {
        showError('Dono não identificado.');
        return;
    }

    if (!config.token_producao && config.ambiente === 'producao') {
        showError('O token de produção é obrigatório para o ambiente de Produção.');
        return;
    }

    try {
      setSaving(true);
      
      // HIGIENIZAÇÃO DO PAYLOAD: Removemos metadados automáticos para evitar conflitos (409)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, created_at, updated_at, proprietario_id, ...cleanData } = config as any;

      const payload = {
        proprietario_id: ownerId,
        ...cleanData,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('configuracoes_pagbank')
        .upsert(payload, {
          onConflict: 'proprietario_id',
        });

      if (error) throw error;
      showSuccess('Configurações salvas com sucesso!');
      await carregarDados(); // Recarrega para ter os IDs atualizados
    } catch (error: any) {
      console.error('Erro ao salvar:', error);
      showError('Erro ao salvar configurações: ' + (error.message || 'Verifique os dados.'));
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
                        <CardDescription>Configure onde os valores recebidos e as taxas serão registrados no seu financeiro e contabilidade.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-blue-600 font-bold">Conta PagBank (Ativo) *</Label>
                                <Select value={config.conta_id || ''} onValueChange={(v) => setConfig({...config, conta_id: v})}>
                                    <SelectTrigger className="border-blue-300"><SelectValue placeholder="Selecione a conta bancária" /></SelectTrigger>
                                    <SelectContent>
                                        {saldoContas.length === 0 ? (
                                            <SelectItem value="none" disabled>Nenhuma conta cadastrada em Bancos/Caixas</SelectItem>
                                        ) : (
                                            saldoContas.map(c => (
                                                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-muted-foreground italic">Selecione o registro criado na tela "Bancos / Caixas".</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Conta de Receita (DRE)</Label>
                                <Select value={config.id_conta_resultado || ''} onValueChange={(v) => setConfig({...config, id_conta_resultado: v})}>
                                    <SelectTrigger><SelectValue placeholder="Selecione a conta de resultado" /></SelectTrigger>
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
                                <SelectTrigger><SelectValue placeholder="Selecione a conta de despesa" /></SelectTrigger>
                                <SelectContent>
                                    {planoContas.filter(c => c.Conta.startsWith('5.') || c.Conta.startsWith('6.')).map(c => (
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
                                            <SelectItem key={h.id} value={h.id}>{h.codigo ? `[${h.codigo}] ` : ''}{h.descricao}</SelectItem>
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
                                            <SelectItem key={h.id} value={h.id}>{h.codigo ? `[${h.codigo}] ` : ''}{h.descricao}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Percent className="w-5 h-5 text-primary" /> Juros e Multa Automáticos
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                            <div className="space-y-0.5">
                                <Label className="text-base">Aplicar Juros e Multa</Label>
                                <p className="text-sm text-muted-foreground">Calcula automaticamente ao gerar cobranças de parcelas vencidas.</p>
                            </div>
                            <Switch
                                checked={config.aplica_juros_multa || false}
                                onCheckedChange={(checked) => setConfig({ ...config, aplica_juros_multa: checked })}
                            />
                        </div>
                        
                        {config.aplica_juros_multa && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Multa (%)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={config.percentual_multa || 2.0}
                                        onChange={(e) => setConfig({ ...config, percentual_multa: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Juros ao Mês (%)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={config.percentual_juros_mes || 1.0}
                                        onChange={(e) => setConfig({ ...config, percentual_juros_mes: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Configurações de Envio</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Email Remetente (Resend)</Label>
                            <Input 
                                type="email" 
                                value={config.email_remetente || ''} 
                                onChange={(e) => setConfig({...config, email_remetente: e.target.value})}
                                placeholder="cobranca@suaempresa.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Resend API Key</Label>
                            <Input 
                                type="password" 
                                value={config.resend_api_key || ''} 
                                onChange={(e) => setConfig({...config, resend_api_key: e.target.value})}
                                placeholder="re_..."
                            />
                        </div>
                        <Separator />
                        <div className="space-y-2">
                            <Label>URL do Webhook</Label>
                            <Input readOnly value={config.webhook_url} className="bg-muted font-mono text-[10px]" />
                        </div>
                    </CardContent>
                </Card>

                <Button onClick={handleSave} disabled={saving} className="w-full h-12 shadow-md">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar Configurações
                </Button>
            </div>
        </div>
      </div>
    </LayoutPrincipal>
  );
}