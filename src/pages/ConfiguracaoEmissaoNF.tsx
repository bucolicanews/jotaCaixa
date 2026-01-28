import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Receipt, Link, Mail, MessageSquare, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { useOwner } from '@/hooks/use-owner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface NFConfig {
    webhook_n8n_url: string | null;
    template_whatsapp: string | null;
    template_email: string | null;
}

const DEFAULT_CONFIG: NFConfig = {
    webhook_n8n_url: '',
    template_whatsapp: 'Olá {cliente_nome}! Sua Nota Fiscal Nº {numero_nota} no valor de {valor} foi emitida. Segue o anexo.',
    template_email: 'Prezado(a) {cliente_nome},\n\nSua Nota Fiscal Nº {numero_nota} no valor de {valor} foi emitida. Segue o anexo em PDF.\n\nAtenciosamente,\n{empresa_nome}',
};

const ConfiguracaoEmissaoNF: React.FC = () => {
    const { ownerId } = useOwner();
    const { role } = useSessao();
    const [config, setConfig] = useState<NFConfig>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fetchConfig = useCallback(async () => {
        if (!ownerId) return;
        setLoading(true);
        
        const { data, error } = await supabase
            .from('configuracoes_emissao_nf')
            .select('*')
            .eq('proprietario_id', ownerId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            showError('Erro ao carregar configurações: ' + error.message);
        } else if (data) {
            setConfig({ ...DEFAULT_CONFIG, ...data });
        }
        setLoading(false);
    }, [ownerId]);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const handleSave = async () => {
        if (!ownerId) {
            showError('Proprietário não identificado.');
            return;
        }
        setSaving(true);

        const dataToSave = {
            proprietario_id: ownerId,
            webhook_n8n_url: config.webhook_n8n_url || null,
            template_whatsapp: config.template_whatsapp || null,
            template_email: config.template_email || null,
        };

        try {
            const { error } = await supabase
                .from('configuracoes_emissao_nf')
                .upsert(dataToSave, { onConflict: 'proprietario_id' });

            if (error) throw error;

            showSuccess('Configurações de NF salvas com sucesso!');
        } catch (error: any) {
            showError('Falha ao salvar: ' + error.message);
        } finally {
            setSaving(false);
        }
    };
    
    const isReadOnly = !['Admin', 'Cliente'].includes(role);

    if (loading) {
        return (
            <LayoutPrincipal>
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </LayoutPrincipal>
        );
    }

    return (
        <LayoutPrincipal>
            <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
                <Receipt className="w-6 h-6 mr-2" /> Configuração de Emissão NF
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Webhook N8N (Emissão Automática)</CardTitle>
                        <CardDescription>
                            Configure a URL do seu webhook N8N para automatizar a emissão e o envio da NF.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-900/20">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            <AlertTitle className="text-amber-800 dark:text-amber-200">Atenção</AlertTitle>
                            <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                                O sistema enviará o ID da parcela, o ID do proprietário e a URL do anexo (após upload) para este webhook. O webhook deve retornar um status 200 OK para confirmar o envio.
                            </AlertDescription>
                        </Alert>
                        <div className="space-y-2">
                            <Label htmlFor="webhook_n8n_url" className="flex items-center">
                                <Link className="w-4 h-4 mr-2" /> URL do Webhook N8N
                            </Label>
                            <Input
                                id="webhook_n8n_url"
                                type="url"
                                placeholder="https://seu-n8n.com/webhook/..."
                                value={config.webhook_n8n_url || ''}
                                onChange={(e) => setConfig({ ...config, webhook_n8n_url: e.target.value })}
                                disabled={isReadOnly}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-primary" /> Template WhatsApp
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Textarea
                            rows={5}
                            value={config.template_whatsapp || ''}
                            onChange={(e) => setConfig({ ...config, template_whatsapp: e.target.value })}
                            placeholder={DEFAULT_CONFIG.template_whatsapp || ''}
                            disabled={isReadOnly}
                        />
                        <p className="text-xs text-muted-foreground">
                            <strong>Tags disponíveis:</strong> <code>{'{cliente_nome}'}</code>, <code>{'{numero_nota}'}</code>, <code>{'{valor}'}</code>, <code>{'{empresa_nome}'}</code>, <code>{'{link_anexo}'}</code>
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Mail className="w-5 h-5 text-primary" /> Template Email
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Textarea
                            rows={5}
                            value={config.template_email || ''}
                            onChange={(e) => setConfig({ ...config, template_email: e.target.value })}
                            placeholder={DEFAULT_CONFIG.template_email || ''}
                            disabled={isReadOnly}
                        />
                        <p className="text-xs text-muted-foreground">
                            <strong>Tags disponíveis:</strong> <code>{'{cliente_nome}'}</code>, <code>{'{numero_nota}'}</code>, <code>{'{valor}'}</code>, <code>{'{empresa_nome}'}</code>, <code>{'{link_anexo}'}</code>
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Button onClick={handleSave} disabled={saving || isReadOnly} className="w-full h-12 mt-6">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar Configurações
            </Button>
        </LayoutPrincipal>
    );
};