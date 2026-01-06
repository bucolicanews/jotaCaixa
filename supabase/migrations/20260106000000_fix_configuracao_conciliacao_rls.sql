-- Migration: Fix RLS policies and unique constraint for configuracao_conciliacao
-- Purpose: Enable proper access control for configuration conciliation table
-- Issues Fixed:
--   1. RLS was enabled but no policies were defined (blocking all access)
--   2. Add UNIQUE constraint to prevent duplicate configurations per account
--   3. Add RLS policies for admin and system access

BEGIN;

-- Drop existing RLS policies if they exist (for re-runnability)
DROP POLICY IF EXISTS "configuracao_conciliacao_admin_select" ON public.configuracao_conciliacao;
DROP POLICY IF EXISTS "configuracao_conciliacao_admin_insert" ON public.configuracao_conciliacao;
DROP POLICY IF EXISTS "configuracao_conciliacao_admin_update" ON public.configuracao_conciliacao;
DROP POLICY IF EXISTS "configuracao_conciliacao_admin_delete" ON public.configuracao_conciliacao;
DROP POLICY IF EXISTS "configuracao_conciliacao_service_role_all" ON public.configuracao_conciliacao;

-- Drop existing unique constraint if it exists
ALTER TABLE public.configuracao_conciliacao DROP CONSTRAINT IF EXISTS configuracao_conciliacao_id_saldo_contas_key;
ALTER TABLE public.configuracao_conciliacao DROP CONSTRAINT IF EXISTS configuracao_conciliacao_proprietario_id_id_saldo_contas_key;

-- Add composite unique constraint (proprietario_id + id_saldo_contas)
-- This ensures each admin can only have ONE configuration per bank account
ALTER TABLE public.configuracao_conciliacao 
  ADD CONSTRAINT configuracao_conciliacao_proprietario_id_id_saldo_contas_key 
  UNIQUE (proprietario_id, id_saldo_contas);

-- Ensure RLS is enabled on the table
ALTER TABLE public.configuracao_conciliacao ENABLE ROW LEVEL SECURITY;

-- RLS Policy 1: Allow admins to SELECT their own configurations
CREATE POLICY "configuracao_conciliacao_admin_select" 
  ON public.configuracao_conciliacao 
  FOR SELECT 
  USING (proprietario_id = auth.uid());

-- RLS Policy 2: Allow admins to INSERT their own configurations
CREATE POLICY "configuracao_conciliacao_admin_insert" 
  ON public.configuracao_conciliacao 
  FOR INSERT 
  WITH CHECK (proprietario_id = auth.uid());

-- RLS Policy 3: Allow admins to UPDATE their own configurations
CREATE POLICY "configuracao_conciliacao_admin_update" 
  ON public.configuracao_conciliacao 
  FOR UPDATE 
  USING (proprietario_id = auth.uid())
  WITH CHECK (proprietario_id = auth.uid());

-- RLS Policy 4: Allow admins to DELETE their own configurations
CREATE POLICY "configuracao_conciliacao_admin_delete" 
  ON public.configuracao_conciliacao 
  FOR DELETE 
  USING (proprietario_id = auth.uid());

-- RLS Policy 5: Allow service_role to perform all operations (system operations)
CREATE POLICY "configuracao_conciliacao_service_role_all" 
  ON public.configuracao_conciliacao 
  FOR ALL 
  USING (auth.role() = 'service_role') 
  WITH CHECK (true);

COMMIT;
