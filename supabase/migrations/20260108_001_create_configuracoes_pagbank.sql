-- Migration: Criar tabela de configuração PagBank
-- Data: 2026-01-08
-- Descrição: Armazena credenciais e mapeamentos contábeis do PagBank por proprietário (Admin)

CREATE TABLE IF NOT EXISTS public.configuracoes_pagbank (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id UUID NOT NULL REFERENCES public.tbl_admins(id) ON DELETE CASCADE,
    
    -- Credenciais
    token_sandbox TEXT,
    token_producao TEXT,
    ambiente TEXT DEFAULT 'sandbox' CHECK (ambiente IN ('sandbox', 'producao')),
    
    -- Mapeamento Contábil
    conta_sintetica_id UUID REFERENCES public.plano_contas(id), -- Ex: 1.1.1.03 - PagBank
    historico_padrao_id UUID REFERENCES public.historicos(id),
    id_conta_resultado UUID REFERENCES public.plano_contas(id), -- Ex: 4.1.1.01 - Receita Operacional
    
    -- Configuração de Taxas
    conta_despesa_taxa_id UUID REFERENCES public.plano_contas(id), -- Ex: 5.1.2.01 - Despesas Bancárias
    historico_taxa_id UUID REFERENCES public.historicos(id),
    
    -- Webhook
    webhook_url TEXT DEFAULT 'https://caixa.jotaempresas.com/api/pagbank-webhook',
    webhook_secret TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(proprietario_id)
);

-- Trigger para atualizar updated_at
CREATE TRIGGER set_configuracoes_pagbank_updated_at
BEFORE UPDATE ON public.configuracoes_pagbank
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- RLS Policies
ALTER TABLE public.configuracoes_pagbank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin pode gerenciar próprias configurações PagBank"
ON public.configuracoes_pagbank
FOR ALL
USING (proprietario_id = auth.uid());

-- Comentários
COMMENT ON TABLE public.configuracoes_pagbank IS 'Configurações de integração com PagBank por administrador';
COMMENT ON COLUMN public.configuracoes_pagbank.token_sandbox IS 'Token de acesso ao ambiente sandbox do PagBank';
COMMENT ON COLUMN public.configuracoes_pagbank.token_producao IS 'Token de acesso ao ambiente de produção do PagBank';
COMMENT ON COLUMN public.configuracoes_pagbank.ambiente IS 'Ambiente ativo (sandbox ou producao)';
COMMENT ON COLUMN public.configuracoes_pagbank.conta_sintetica_id IS 'Conta contábil sintética que representa a conta PagBank (Ativo)';
COMMENT ON COLUMN public.configuracoes_pagbank.historico_padrao_id IS 'Histórico padrão para lançamentos de recebimentos via PagBank';
COMMENT ON COLUMN public.configuracoes_pagbank.id_conta_resultado IS 'Conta de resultado (DRE) para receitas via PagBank';
COMMENT ON COLUMN public.configuracoes_pagbank.conta_despesa_taxa_id IS 'Conta de despesa para taxas cobradas pelo PagBank';
COMMENT ON COLUMN public.configuracoes_pagbank.historico_taxa_id IS 'Histórico padrão para lançamentos de taxas PagBank';
COMMENT ON COLUMN public.configuracoes_pagbank.webhook_url IS 'URL pública para receber notificações do PagBank';
COMMENT ON COLUMN public.configuracoes_pagbank.webhook_secret IS 'Secret para validação HMAC de webhooks';
