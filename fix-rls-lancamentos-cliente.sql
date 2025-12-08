-- ============================================================================
-- SCRIPT PARA VERIFICAR/CORRIGIR POLÍTICA RLS DE LANCAMENTOS
-- Execute este script no SQL Editor do Supabase
-- ============================================================================

-- ============================================================================
-- PASSO 1: VERIFICAR POLÍTICAS ATUAIS
-- ============================================================================

SELECT tablename, policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'lancamentos'
ORDER BY policyname;

-- ============================================================================
-- PASSO 2: VERIFICAR SE A POLÍTICA ATUAL ESTÁ CORRETA
-- ============================================================================

-- A política atual deve ser:
-- proprietario_id = auth.uid()
--
-- Para ADMIN: usuario.id = auth.uid() = proprietario_id ✅
-- Para CLIENTE: empresa_id = auth.uid() = proprietario_id ✅
--
-- Se a política já está assim, NÃO precisa alterar.
-- O problema provavelmente está no código TypeScript.

-- ============================================================================
-- DIAGNÓSTICO: Verificar dados do cliente
-- ============================================================================

-- Verificar se o cliente existe 
-- (substitua pelo email do cliente com problema)
SELECT id, email FROM tbl_clientes WHERE email = 'SEU_EMAIL_AQUI';

-- Verificar lançamentos do cliente
-- (substitua pelo ID do cliente)
SELECT id, proprietario_id, tipo, valor, conta_contabil_id, origem, descricao
FROM lancamentos 
WHERE proprietario_id = 'ID_DO_CLIENTE_AQUI'
ORDER BY data_movimentacao DESC
LIMIT 20;

-- ============================================================================
-- NOTA SOBRE A CORREÇÃO:
-- ============================================================================
-- 
-- O problema NÃO estava na política RLS.
-- O problema estava no código TypeScript (RegistrarPagamentoCPDialog.tsx)
-- onde o proprietarioId não estava sendo definido corretamente para CLIENTE.
--
-- ANTES (bug):
--   const proprietarioId = usuario?.id;  // Sempre usava usuario.id
--
-- DEPOIS (correção):
--   const empresaId = parcela?.empresa_id;
--   const proprietarioId = isAdmin ? usuario?.id : empresaId;
--
-- Agora:
-- - Para ADMIN: proprietarioId = usuario.id (ID do admin logado)
-- - Para CLIENTE: proprietarioId = empresa_id da parcela (que é = auth.uid())
-- ============================================================================
