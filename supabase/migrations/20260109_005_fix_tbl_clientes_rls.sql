-- Migration: Ajustar RLS para tbl_clientes
-- Data: 2026-01-09
-- Descrição: Permitir ADMIN e usuários habilitados gerenciarem clientes

-- 1. Habilitar RLS na tabela (se não estiver habilitado)
ALTER TABLE public.tbl_clientes ENABLE ROW LEVEL SECURITY;

-- 2. Policy para SELECT
DROP POLICY IF EXISTS "Admin e usuarios podem ver tbl_clientes" ON public.tbl_clientes;
CREATE POLICY "Admin e usuarios podem ver tbl_clientes"
ON public.tbl_clientes
FOR SELECT
USING (
  -- Cliente vê apenas seu próprio registro
  id = auth.uid()
  OR
  -- Admin vê todos os clientes atribuídos a ele
  admin_id IN (
    SELECT id FROM public.tbl_admins WHERE id = auth.uid()
  )
  OR
  -- Usuários do Admin veem todos os clientes do mesmo Admin
  admin_id IN (
    SELECT admin_id FROM public.admin_usuarios WHERE id = auth.uid()
  )
);

-- 3. Policy para UPDATE
DROP POLICY IF EXISTS "Admin e usuarios podem atualizar tbl_clientes" ON public.tbl_clientes;
CREATE POLICY "Admin e usuarios podem atualizar tbl_clientes"
ON public.tbl_clientes
FOR UPDATE
USING (
  -- Cliente atualiza apenas seu próprio registro
  id = auth.uid()
  OR
  -- Admin atualiza todos os clientes atribuídos a ele
  admin_id IN (
    SELECT id FROM public.tbl_admins WHERE id = auth.uid()
  )
  OR
  -- Usuários do Admin atualizam todos os clientes do mesmo Admin
  admin_id IN (
    SELECT admin_id FROM public.admin_usuarios WHERE id = auth.uid()
  )
);

-- 4. Policy para DELETE (apenas Admin)
DROP POLICY IF EXISTS "Apenas Admin pode deletar tbl_clientes" ON public.tbl_clientes;
CREATE POLICY "Apenas Admin pode deletar tbl_clientes"
ON public.tbl_clientes
FOR DELETE
USING (
  admin_id IN (
    SELECT id FROM public.tbl_admins WHERE id = auth.uid()
  )
);

-- 5. Não criar policy de INSERT
-- INSERT será feito apenas pelo trigger route_new_user (SECURITY DEFINER)
-- ou via Edge Function com Service Role Key
