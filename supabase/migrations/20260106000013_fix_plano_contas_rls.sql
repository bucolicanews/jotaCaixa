-- Fix RLS policies for plano_contas to support admin_usuarios
-- Admin employees (admin_usuarios) need same access as direct admin

-- Drop existing policies
DROP POLICY IF EXISTS "plano_contas_select_policy" ON public.plano_contas;
DROP POLICY IF EXISTS "plano_contas_insert_policy" ON public.plano_contas;
DROP POLICY IF EXISTS "plano_contas_update_policy" ON public.plano_contas;
DROP POLICY IF EXISTS "plano_contas_delete_policy" ON public.plano_contas;
DROP POLICY IF EXISTS "Users can manage own chart of accounts" ON public.plano_contas;
DROP POLICY IF EXISTS "Users can view own chart of accounts" ON public.plano_contas;

-- Enable RLS
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Admin direto OU funcionário do admin
CREATE POLICY "plano_contas_select_policy" ON public.plano_contas
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
CREATE POLICY "plano_contas_insert_policy" ON public.plano_contas
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
CREATE POLICY "plano_contas_update_policy" ON public.plano_contas
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
CREATE POLICY "plano_contas_delete_policy" ON public.plano_contas
FOR DELETE
USING (
  proprietario_id = auth.uid()
  OR proprietario_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);
