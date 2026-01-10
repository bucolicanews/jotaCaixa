-- Migration: Adicionar campos para Checkout PagBank e configurações de email
-- Data: 2026-01-09
-- Descrição: Adiciona suporte a checkout unificado e envio de email

-- 1. Adicionar campos de checkout na tabela de parcelas
ALTER TABLE admin_parcelas_receber
ADD COLUMN IF NOT EXISTS pagbank_checkout_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS pagbank_checkout_link TEXT;

-- 2. Adicionar configurações de email em configuracoes_pagbank
ALTER TABLE configuracoes_pagbank
ADD COLUMN IF NOT EXISTS email_remetente VARCHAR(255),
ADD COLUMN IF NOT EXISTS resend_api_key VARCHAR(255),
ADD COLUMN IF NOT EXISTS whatsapp_template TEXT DEFAULT 'Olá {nome}! Segue o link para pagamento de R$ {valor} referente a {descricao}: {link}';

-- 3. Comentários para documentação
COMMENT ON COLUMN admin_parcelas_receber.pagbank_checkout_id IS 'ID do checkout PagBank (link unificado)';
COMMENT ON COLUMN admin_parcelas_receber.pagbank_checkout_link IS 'Link do checkout onde cliente escolhe forma de pagamento';
COMMENT ON COLUMN configuracoes_pagbank.email_remetente IS 'Email de envio para notificações de cobrança';
COMMENT ON COLUMN configuracoes_pagbank.resend_api_key IS 'Chave API do Resend para envio de emails';
COMMENT ON COLUMN configuracoes_pagbank.whatsapp_template IS 'Template da mensagem WhatsApp com variáveis {nome}, {valor}, {descricao}, {link}';
