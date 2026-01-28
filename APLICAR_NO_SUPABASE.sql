-- ===================================================================
-- SQL para Aplicar Manualmente no Supabase
-- Execute este script no SQL Editor do Supabase Dashboard
-- ===================================================================

-- 1. Adicionar coluna para armazenar a URL da página de pagamento PIX
ALTER TABLE public.admin_parcelas_receber 
ADD COLUMN IF NOT EXISTS pix_payment_page_url TEXT;

COMMENT ON COLUMN public.admin_parcelas_receber.pix_payment_page_url 
IS 'URL da página de pagamento PIX hospedada na aplicação (ex: https://app.com/pix/123)';

-- 2. Adicionar templates de WhatsApp personalizáveis
ALTER TABLE public.configuracoes_pagbank 
ADD COLUMN IF NOT EXISTS whatsapp_template_pix TEXT 
DEFAULT E'Olá {nome}! 👋\n\n📱 *Pagamento PIX Facilitado*\n\n👉 Clique no link para ver o QR Code e copiar o código:\n{codigo_pix}\n\n💰 Valor: *{valor}*\n📅 Vencimento: {vencimento}\n⏰ PIX válido até: {expiracao}\n\n✅ Rápido, fácil e seguro!';

ALTER TABLE public.configuracoes_pagbank 
ADD COLUMN IF NOT EXISTS whatsapp_template_link TEXT 
DEFAULT E'Olá {nome}!\n\nSegue o link para pagamento:\n💰 Valor: {valor}\n\n🔗 {link}';

COMMENT ON COLUMN public.configuracoes_pagbank.whatsapp_template_pix 
IS 'Template WhatsApp personalizado para pagamentos PIX. Placeholders: {nome}, {valor}, {descricao}, {codigo_pix} (link clicável no celular), {vencimento}, {expiracao}';

COMMENT ON COLUMN public.configuracoes_pagbank.whatsapp_template_link 
IS 'Template WhatsApp personalizado para links de pagamento (checkout). Placeholders: {nome}, {valor}, {descricao}, {link}, {expiracao}';

-- ===================================================================
-- Fim do script
-- ===================================================================
