-- Migration: Adicionar campos conta_id e conta_despesa_taxa para compatibilidade
-- Data: 2026-01-23
-- Descrição: Adiciona campos alternativos para mapeamento de contas PagBank

-- Adicionar campo conta_id como alias de conta_sintetica_id
ALTER TABLE public.configuracoes_pagbank 
ADD COLUMN IF NOT EXISTS conta_id UUID REFERENCES public.plano_contas(id);

-- Adicionar campo conta_despesa_taxa como alias de conta_despesa_taxa_id
ALTER TABLE public.configuracoes_pagbank 
ADD COLUMN IF NOT EXISTS conta_despesa_taxa UUID REFERENCES public.plano_contas(id);

-- Adicionar campo whatsapp_template
ALTER TABLE public.configuracoes_pagbank 
ADD COLUMN IF NOT EXISTS whatsapp_template TEXT DEFAULT 'Olá {nome}! Segue o link para pagamento de R$ {valor} referente a {descricao}: {link}';

-- Adicionar campo dias_expiracao_link (já foi adicionado em migration anterior, mas garantir)
ALTER TABLE public.configuracoes_pagbank 
ADD COLUMN IF NOT EXISTS dias_expiracao_link INTEGER DEFAULT 7;

-- Comentários
COMMENT ON COLUMN public.configuracoes_pagbank.conta_id IS 'Conta contábil que representa a conta PagBank (Ativo) - mesmo que conta_sintetica_id';
COMMENT ON COLUMN public.configuracoes_pagbank.conta_despesa_taxa IS 'Conta de despesa para taxas cobradas pelo PagBank - mesmo que conta_despesa_taxa_id';
COMMENT ON COLUMN public.configuracoes_pagbank.whatsapp_template IS 'Template de mensagem para envio via WhatsApp';
COMMENT ON COLUMN public.configuracoes_pagbank.dias_expiracao_link IS 'Número de dias para expiração do link de pagamento';
