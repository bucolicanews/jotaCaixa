-- ============================================================================
-- SCRIPT PARA CORRIGIR POLÍTICAS RLS PARA CLIENTES (tbl_clientes)
-- Execute este script no SQL Editor do Supabase
-- ============================================================================
-- ESTRUTURA: 
--   - tbl_admins.id = auth.uid() (Admin)
--   - tbl_clientes.id = auth.uid() (Cliente)  
--   - proprietario_id nas tabelas = id do Admin ou Cliente
-- ============================================================================

-- PASSO 1: VERIFICAR POLÍTICAS ATUAIS (execute primeiro para diagnóstico)
-- ============================================================================

-- Ver todas as políticas da tabela saldo_contas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'saldo_contas';

-- Ver todas as políticas da tabela plano_contas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'plano_contas';

-- Ver todas as políticas da tabela lancamentos
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'lancamentos';

-- ============================================================================
-- PASSO 2: CORRIGIR POLÍTICAS PARA SALDO_CONTAS
-- ============================================================================

-- Remover políticas antigas (se existirem)
DROP POLICY IF EXISTS "saldo_contas_select_policy" ON saldo_contas;
DROP POLICY IF EXISTS "saldo_contas_insert_policy" ON saldo_contas;
DROP POLICY IF EXISTS "saldo_contas_update_policy" ON saldo_contas;
DROP POLICY IF EXISTS "saldo_contas_delete_policy" ON saldo_contas;
DROP POLICY IF EXISTS "admin_select_saldo_contas" ON saldo_contas;
DROP POLICY IF EXISTS "admin_insert_saldo_contas" ON saldo_contas;
DROP POLICY IF EXISTS "admin_update_saldo_contas" ON saldo_contas;
DROP POLICY IF EXISTS "admin_delete_saldo_contas" ON saldo_contas;

-- Habilitar RLS (caso não esteja)
ALTER TABLE saldo_contas ENABLE ROW LEVEL SECURITY;

-- NOVA POLÍTICA: Permite SELECT para Admin, Cliente e funcionários (admin_usuarios)
CREATE POLICY "saldo_contas_select_policy" ON saldo_contas
FOR SELECT USING (
    proprietario_id = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM admin_usuarios au
        WHERE au.id = auth.uid()
          AND au.admin_id = saldo_contas.proprietario_id
    )
);

-- NOVA POLÍTICA: Permite INSERT para Admin e Cliente
CREATE POLICY "saldo_contas_insert_policy" ON saldo_contas
FOR INSERT WITH CHECK (
    proprietario_id = auth.uid()
);

-- NOVA POLÍTICA: Permite UPDATE para Admin e Cliente
CREATE POLICY "saldo_contas_update_policy" ON saldo_contas
FOR UPDATE USING (
    proprietario_id = auth.uid()
);

-- NOVA POLÍTICA: Permite DELETE para Admin e Cliente
CREATE POLICY "saldo_contas_delete_policy" ON saldo_contas
FOR DELETE USING (
    proprietario_id = auth.uid()
);

-- ============================================================================
-- PASSO 3: CORRIGIR POLÍTICAS PARA PLANO_CONTAS
-- ============================================================================

-- Remover políticas antigas (se existirem)
DROP POLICY IF EXISTS "plano_contas_select_policy" ON plano_contas;
DROP POLICY IF EXISTS "plano_contas_insert_policy" ON plano_contas;
DROP POLICY IF EXISTS "plano_contas_update_policy" ON plano_contas;
DROP POLICY IF EXISTS "plano_contas_delete_policy" ON plano_contas;
DROP POLICY IF EXISTS "admin_select_plano_contas" ON plano_contas;
DROP POLICY IF EXISTS "admin_insert_plano_contas" ON plano_contas;
DROP POLICY IF EXISTS "admin_update_plano_contas" ON plano_contas;
DROP POLICY IF EXISTS "admin_delete_plano_contas" ON plano_contas;

-- Habilitar RLS (caso não esteja)
ALTER TABLE plano_contas ENABLE ROW LEVEL SECURITY;

-- NOVA POLÍTICA: Permite SELECT para Admin, Cliente e funcionários (admin_usuarios)
CREATE POLICY "plano_contas_select_policy" ON plano_contas
FOR SELECT USING (
    proprietario_id = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM admin_usuarios au
        WHERE au.id = auth.uid()
          AND au.admin_id = plano_contas.proprietario_id
    )
);

-- NOVA POLÍTICA: Permite INSERT para Admin e Cliente
CREATE POLICY "plano_contas_insert_policy" ON plano_contas
FOR INSERT WITH CHECK (
    proprietario_id = auth.uid()
);

-- NOVA POLÍTICA: Permite UPDATE para Admin e Cliente
CREATE POLICY "plano_contas_update_policy" ON plano_contas
FOR UPDATE USING (
    proprietario_id = auth.uid()
);

-- NOVA POLÍTICA: Permite DELETE para Admin e Cliente
CREATE POLICY "plano_contas_delete_policy" ON plano_contas
FOR DELETE USING (
    proprietario_id = auth.uid()
);

-- ============================================================================
-- PASSO 4: CORRIGIR POLÍTICAS PARA LANCAMENTOS
-- ============================================================================

-- Remover políticas antigas (se existirem)
DROP POLICY IF EXISTS "lancamentos_select_policy" ON lancamentos;
DROP POLICY IF EXISTS "lancamentos_insert_policy" ON lancamentos;
DROP POLICY IF EXISTS "lancamentos_update_policy" ON lancamentos;
DROP POLICY IF EXISTS "lancamentos_delete_policy" ON lancamentos;
DROP POLICY IF EXISTS "admin_select_lancamentos" ON lancamentos;
DROP POLICY IF EXISTS "admin_insert_lancamentos" ON lancamentos;
DROP POLICY IF EXISTS "admin_update_lancamentos" ON lancamentos;
DROP POLICY IF EXISTS "admin_delete_lancamentos" ON lancamentos;

-- Habilitar RLS (caso não esteja)
ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;

-- NOVA POLÍTICA: Permite SELECT para Admin, Cliente e funcionários (admin_usuarios)
CREATE POLICY "lancamentos_select_policy" ON lancamentos
FOR SELECT USING (
    proprietario_id = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM admin_usuarios au
        WHERE au.id = auth.uid()
          AND au.admin_id = lancamentos.proprietario_id
    )
);

-- NOVA POLÍTICA: Permite INSERT para Admin e Cliente
CREATE POLICY "lancamentos_insert_policy" ON lancamentos
FOR INSERT WITH CHECK (
    proprietario_id = auth.uid()
);

-- NOVA POLÍTICA: Permite UPDATE para Admin e Cliente
CREATE POLICY "lancamentos_update_policy" ON lancamentos
FOR UPDATE USING (
    proprietario_id = auth.uid()
);

-- NOVA POLÍTICA: Permite DELETE para Admin e Cliente
CREATE POLICY "lancamentos_delete_policy" ON lancamentos
FOR DELETE USING (
    proprietario_id = auth.uid()
);

-- ============================================================================
-- PASSO 5: VERIFICAR SE AS POLÍTICAS FORAM CRIADAS CORRETAMENTE
-- ============================================================================

SELECT tablename, policyname, cmd FROM pg_policies 
WHERE tablename IN ('saldo_contas', 'plano_contas', 'lancamentos')
ORDER BY tablename, policyname;

-- ============================================================================
-- DIAGNÓSTICO: Verificar dados do cliente específico
-- ============================================================================

-- Verificar se o cliente existe na tbl_clientes (id = auth.uid())
SELECT id, email FROM tbl_clientes WHERE email = 'jotaempresasonline@gmail.com';

-- Verificar contas salvas para esse cliente
SELECT id, nome, proprietario_id FROM saldo_contas WHERE proprietario_id = '6973a8cb-9891-482a-87d4-df2bb5621cd1';
