import { useState, useEffect } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, Check, AlertCircle } from 'lucide-react';
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
  console.log('[ConfiguracoesPagBank] Componente montado');
  const { usuario, ownerId } = useSessao();
  console.log('[ConfiguracoesPagBank] Usuario:', usuario?.id, 'OwnerId:', ownerId);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<Partial<PagBankConfig>>({
    ambiente: 'sandbox',
    webhook_url: 'https://caixa.jotaempresas.com/api/pagbank-webhook',
  });
  const [planoContas, setPlanoContas] = useState<PlanoContas[]>([]);
  const [historicos, setHistoricos] = useState<Historico[]>([]);

  useEffect(() => {
    console.log('[ConfiguracoesPagBank] useEffect disparado, ownerId:', ownerId);
    
    if (!ownerId) {
      console.log('[ConfiguracoesPagBank] OwnerId ainda não carregado, aguardando...');
      setLoading(false);
      return;
    }

    console.log('[ConfiguracoesPagBank] OwnerId disponível, carregando dados...');
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
          .single(),
        supabase
          .from('plano_contas')
          .select('id, Conta, Descricao')
          .eq('proprietario_id', ownerId)
          .order('Conta'),
        supabase
          .from('historicos')
          .select('id, codigo, descricao')
          .eq('proprietario_id', ownerId)
          .order('codigo'),
      ]);

      console.log('[ConfiguracoesPagBank] Respostas recebidas:', {
        config: configRes.data,
        planoContas: planoRes.data?.length || 0,
        historicos: histRes.data?.length || 0,
        planoError: planoRes.error,
        histError: histRes.error,
      });

      if (configRes.data) {
        setConfig(configRes.data);
      }

      if (planoRes.data) {
        console.log('[ConfiguracoesPagBank] Plano de contas carregado:', planoRes.data.slice(0, 3));
        setPlanoContas(planoRes.data);
      } else if (planoRes.error) {
        console.error('[ConfiguracoesPagBank] Erro ao buscar plano de contas:', planoRes.error);
      }

      if (histRes.data) {
        console.log('[ConfiguracoesPagBank] Históricos carregados:', histRes.data.slice(0, 3));
        setHistoricos(histRes.data);
      } else if (histRes.error) {
        console.error('[ConfiguracoesPagBank] Erro ao buscar históricos:', histRes.error);
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('configuracoes_pagbank')
        .upsert({
          proprietario_id: ownerId,
          ...config,
        }, {
          onConflict: 'proprietario_id',
        });

      if (error) throw error;

      toast.success('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  console.log('[ConfiguracoesPagBank] Renderizando com:', {
    planoContasLength: planoContas.length,
    historicosLength: historicos.length,
    primeiroPlano: planoContas[0],
    primeiroHistorico: historicos[0],
  });

  return (
    <LayoutPrincipal>
      <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configurações PagBank</h1>
        <p className="text-muted-foreground">
          Configure a integração com a API do PagBank para gerar links de pagamento e processar recebimentos automaticamente.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credenciais de Acesso</CardTitle>
          <CardDescription>
            Insira os tokens de acesso fornecidos pelo PagBank. Use o ambiente Sandbox para testes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label>Ambiente Ativo</Label>
              <p className="text-sm text-muted-foreground">
                {config.ambiente === 'sandbox' ? 'Modo de Teste (Sandbox)' : 'Modo de Produção'}
              </p>
            </div>
            <Switch
              checked={config.ambiente === 'producao'}
              onCheckedChange={(checked) => setConfig({ ...config, ambiente: checked ? 'producao' : 'sandbox' })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="token_sandbox">Token Sandbox</Label>
            <Input
              id="token_sandbox"
              type="password"
              placeholder="Token de teste do PagBank"
              value={config.token_sandbox || ''}
              onChange={(e) => setConfig({ ...config, token_sandbox: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="token_producao">Token Produção</Label>
            <Input
              id="token_producao"
              type="password"
              placeholder="Token de produção do PagBank"
              value={config.token_producao || ''}
              onChange={(e) => setConfig({ ...config, token_producao: e.target.value })}
            />
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Importante:</strong> Mantenha seus tokens em segurança. Não compartilhe com terceiros.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mapeamento Contábil</CardTitle>
          <CardDescription>
            Configure as contas contábeis que serão usadas nos lançamentos automáticos de recebimentos via PagBank.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="conta_sintetica">Conta PagBank (Ativo Circulante)</Label>
            <Select 
              value={config.conta_sintetica_id || ''} 
              onValueChange={(value) => setConfig({ ...config, conta_sintetica_id: value })}
            >
              <SelectTrigger id="conta_sintetica">
                <SelectValue placeholder="Selecione a conta contábil do PagBank" />
              </SelectTrigger>
              <SelectContent>
                {planoContas.length === 0 ? (
                  <SelectItem value="sem-dados" disabled>Nenhuma conta encontrada</SelectItem>
                ) : (
                  planoContas.filter(c => c.Conta?.startsWith('1.1')).map((conta) => (
                    <SelectItem key={conta.id} value={conta.id}>
                      {conta.Conta} - {conta.Descricao}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Ex: 1.1.1.03 - PagBank
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="id_conta_resultado">Conta de Receita (DRE)</Label>
            <Select 
              value={config.id_conta_resultado || ''} 
              onValueChange={(value) => setConfig({ ...config, id_conta_resultado: value })}
            >
              <SelectTrigger id="id_conta_resultado">
                <SelectValue placeholder="Selecione a conta de receita" />
              </SelectTrigger>
              <SelectContent>
                {planoContas.length === 0 ? (
                  <SelectItem value="sem-dados" disabled>Nenhuma conta encontrada</SelectItem>
                ) : (
                  planoContas.filter(c => c.Conta?.startsWith('4.')).map((conta) => (
                    <SelectItem key={conta.id} value={conta.id}>
                      {conta.Conta} - {conta.Descricao}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Ex: 4.1.1.01 - Receita Operacional
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="conta_despesa_taxa">Conta de Despesa (Taxas PagBank)</Label>
            <Select 
              value={config.conta_despesa_taxa_id || ''} 
              onValueChange={(value) => setConfig({ ...config, conta_despesa_taxa_id: value })}
            >
              <SelectTrigger id="conta_despesa_taxa">
                <SelectValue placeholder="Selecione a conta de despesa bancária" />
              </SelectTrigger>
              <SelectContent>
                {planoContas.length === 0 ? (
                  <SelectItem value="sem-dados" disabled>Nenhuma conta encontrada</SelectItem>
                ) : (
                  planoContas.filter(c => c.Conta?.startsWith('5.')).map((conta) => (
                    <SelectItem key={conta.id} value={conta.id}>
                      {conta.Conta} - {conta.Descricao}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Ex: 5.1.2.01 - Despesas Bancárias
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="historico_padrao">Histórico Padrão (Recebimentos)</Label>
            <Select 
              value={config.historico_padrao_id || ''} 
              onValueChange={(value) => setConfig({ ...config, historico_padrao_id: value })}
            >
              <SelectTrigger id="historico_padrao">
                <SelectValue placeholder="Selecione o histórico padrão" />
              </SelectTrigger>
              <SelectContent>
                {historicos.length === 0 ? (
                  <SelectItem value="sem-dados" disabled>Nenhum histórico encontrado</SelectItem>
                ) : (
                  historicos.map((hist) => (
                    <SelectItem key={hist.id} value={hist.id}>
                      {hist.codigo} - {hist.descricao}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="historico_taxa">Histórico (Taxas PagBank)</Label>
            <Select 
              value={config.historico_taxa_id || ''} 
              onValueChange={(value) => setConfig({ ...config, historico_taxa_id: value })}
            >
              <SelectTrigger id="historico_taxa">
                <SelectValue placeholder="Selecione o histórico de taxas" />
              </SelectTrigger>
              <SelectContent>
                {historicos.length === 0 ? (
                  <SelectItem value="sem-dados" disabled>Nenhum histórico encontrado</SelectItem>
                ) : (
                  historicos.map((hist) => (
                    <SelectItem key={hist.id} value={hist.id}>
                      {hist.codigo} - {hist.descricao}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook</CardTitle>
          <CardDescription>
            URL pública para receber notificações automáticas de pagamentos do PagBank.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook_url">URL do Webhook</Label>
            <Input
              id="webhook_url"
              type="url"
              value={config.webhook_url || ''}
              onChange={(e) => setConfig({ ...config, webhook_url: e.target.value })}
            />
            <p className="text-sm text-muted-foreground">
              Configure esta URL no Portal do Desenvolvedor PagBank
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook_secret">Secret (HMAC - Opcional)</Label>
            <Input
              id="webhook_secret"
              type="password"
              placeholder="Secret para validação HMAC"
              value={config.webhook_secret || ''}
              onChange={(e) => setConfig({ ...config, webhook_secret: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuracoes de Email</CardTitle>
          <CardDescription>
            Configure o envio de links de pagamento por email para os clientes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email_remetente">Email Remetente</Label>
            <Input
              id="email_remetente"
              type="email"
              placeholder="cobranca@suaempresa.com"
              value={(config as any).email_remetente || ''}
              onChange={(e) => setConfig({ ...config, email_remetente: e.target.value } as any)}
            />
            <p className="text-sm text-muted-foreground">
              Email que aparecerá como remetente nas cobranças
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resend_api_key">Chave API Resend (Opcional)</Label>
            <Input
              id="resend_api_key"
              type="password"
              placeholder="re_xxxxxxxxxxxx"
              value={(config as any).resend_api_key || ''}
              onChange={(e) => setConfig({ ...config, resend_api_key: e.target.value } as any)}
            />
            <p className="text-sm text-muted-foreground">
              Obtenha sua chave em <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">resend.com</a> (gratuito ate 100 emails/dia)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mensagem WhatsApp</CardTitle>
          <CardDescription>
            Personalize a mensagem enviada via WhatsApp com o link de pagamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="whatsapp_template">Template da Mensagem</Label>
            <textarea
              id="whatsapp_template"
              className="w-full min-h-[100px] p-3 border rounded-md text-sm"
              placeholder="Ola {nome}! Segue o link para pagamento de R$ {valor} referente a {descricao}: {link}"
              value={(config as any).whatsapp_template || 'Ola {nome}! Segue o link para pagamento de R$ {valor} referente a {descricao}: {link}'}
              onChange={(e) => setConfig({ ...config, whatsapp_template: e.target.value } as any)}
            />
            <p className="text-sm text-muted-foreground">
              Variaveis disponiveis: {'{nome}'}, {'{valor}'}, {'{descricao}'}, {'{link}'}, {'{vencimento}'}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Salvar Configurações
            </>
          )}
        </Button>
      </div>
    </div>
    </LayoutPrincipal>
  );
}
