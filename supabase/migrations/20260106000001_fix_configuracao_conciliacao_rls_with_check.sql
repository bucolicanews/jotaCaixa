-- Migration: Fix RLS policies on configuracao_conciliacao with WITH CHECK clauses
-- Purpose: Enable INSERT/UPDATE operations by adding proper WITH CHECK conditions
-- Issue: INSERT and UPDATE were blocked because WITH CHECK clause was missing

BEGIN;

-- Drop existing policies
DROP POLICY IF EXISTS "Admins podem gerenciar todas as configuracoes de conciliacao" ON public.configuracao_conciliacao;
DROP POLICY IF EXISTS "Empresas podem gerenciar suas configuracoes de conciliacao" ON public.configuracao_conciliacao;

-- Policy 1: Admins can manage their own configurations
-- Admins are users in tbl_admins table
-- They can only manage configs where proprietario_id = their admin ID
CREATE POLICY "Admins podem gerenciar todas as configuracoes de conciliacao"
ON public.configuracao_conciliacao
FOR ALL
TO authenticated
USING (
  (EXISTS (SELECT 1 FROM public.tbl_admins WHERE tbl_admins.id = auth.uid()))
  AND
  (proprietario_id = auth.uid())
)
WITH CHECK (
  (EXISTS (SELECT 1 FROM public.tbl_admins WHERE tbl_admins.id = auth.uid()))
  AND
  (proprietario_id = auth.uid())
);

-- Policy 2: Clients/employees can manage configurations associated with their client
-- This applies to:
-- - Direct clients: tbl_clientes.id = auth.uid()
-- - Employees assigned to clients: tbl_usuarios.cliente_id and tbl_usuarios.id = auth.uid()
CREATE POLICY "Empresas podem gerenciar suas configuracoes de conciliacao"
ON public.configuracao_conciliacao
FOR ALL
TO authenticated
USING (
  proprietario_id IN (
    SELECT tbl_clientes.id FROM public.tbl_clientes WHERE tbl_clientes.id = auth.uid()
    UNION
    SELECT tbl_usuarios.cliente_id FROM public.tbl_usuarios 
    WHERE tbl_usuarios.id = auth.uid() AND tbl_usuarios.cliente_id IS NOT NULL
  )
)
WITH CHECK (
  proprietario_id IN (
    SELECT tbl_clientes.id FROM public.tbl_clientes WHERE tbl_clientes.id = auth.uid()
    UNION
    SELECT tbl_usuarios.cliente_id FROM public.tbl_usuarios 
    WHERE tbl_usuarios.id = auth.uid() AND tbl_usuarios.cliente_id IS NOT NULL
  )
);

COMMIT;
