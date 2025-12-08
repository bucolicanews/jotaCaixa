-- ===========================================
-- SCRIPT PARA PADRONIZAR COLUNA DESCRICAO
-- Tabela: contas_pagar (cliente)
-- Data: 2025-12-07
-- ===========================================

-- ANTES: A coluna se chama "Descricao" (com D maiúsculo)
-- DEPOIS: A coluna será "descricao" (tudo minúsculo)

-- EXECUTAR NO SUPABASE SQL EDITOR:

ALTER TABLE contas_pagar 
RENAME COLUMN "Descricao" TO descricao;

-- VERIFICAR SE A ALTERAÇÃO FOI APLICADA:
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'contas_pagar' AND column_name = 'descricao';
