-- Migration: Add WhatsApp template fields for PIX and Link
-- Created: 2026-01-27

ALTER TABLE configuracoes_pagbank 
ADD COLUMN IF NOT EXISTS whatsapp_template_pix TEXT DEFAULT E'Olá {nome}! 👋\n\n📱 *Pagamento PIX Facilitado*\n\n👉 Clique no link para ver o QR Code e copiar o código:\n{codigo_pix}\n\n💰 Valor: *{valor}*\n📅 Vencimento: {vencimento}\n⏰ PIX válido até: {expiracao}\n\n✅ Rápido, fácil e seguro!';

ALTER TABLE configuracoes_pagbank 
ADD COLUMN IF NOT EXISTS whatsapp_template_link TEXT DEFAULT E'Olá {nome}!\n\nSegue o link para pagamento:\n💰 Valor: {valor}\n\n🔗 {link}';

-- Add comments for documentation
COMMENT ON COLUMN configuracoes_pagbank.whatsapp_template_pix IS 'Template WhatsApp personalizado para pagamentos PIX. Placeholders: {nome}, {valor}, {descricao}, {codigo_pix} (link clicável no celular), {vencimento}, {expiracao}';
COMMENT ON COLUMN configuracoes_pagbank.whatsapp_template_link IS 'Template WhatsApp personalizado para links de pagamento (checkout). Placeholders: {nome}, {valor}, {descricao}, {link}, {expiracao}';
