-- Fix RLS policies for saldo_contas to support admin_usuarios
-- Admin employees (admin_usuarios) need same access as direct admin

-- Drop existing policies
DROP POLICY IF EXISTS "saldo_contas_select_policy" ON public.saldo_contas;
DROP POLICY IF EXISTS "saldo_contas_insert_policy" ON public.saldo_contas;
DROP POLICY IF EXISTS "saldo_contas_update_policy" ON public.saldo_contas;
DROP POLICY IF EXISTS "saldo_contas_delete_policy" ON public.saldo_contas;

-- Enable RLS
ALTER TABLE public.saldo_contas ENABLE ROW LEVEL SECURITY;

-- SELECT policy
CREATE POLICY "saldo_contas_select_policy" ON public.saldo_contas
FOR SELECT
USING (
  proprietario_id = auth.uid()
  OR proprietario_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- INSERT policy
CREATE POLICY "saldo_contas_insert_policy" ON public.saldo_contas
FOR INSERT
WITH CHECK (
  proprietario_id = auth.uid()
  OR proprietario_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- UPDATE policy
CREATE POLICY "saldo_contas_update_policy" ON public.saldo_contas
FOR UPDATE
USING (
  proprietario_id = auth.uid()
  OR proprietario_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
)
WITH CHECK (
  proprietario_id = auth.uid()
  OR proprietario_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- DELETE policy
CREATE POLICY "saldo_contas_delete_policy" ON public.saldo_contas
FOR DELETE
USING (
  proprietario_id = auth.uid()
  OR proprietario_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);
