-- Fix RLS policies for historicos to support admin_usuarios
-- Admin employees (admin_usuarios) need same access as direct admin

-- Drop existing policies
DROP POLICY IF EXISTS "historicos_select_policy" ON public.historicos;
DROP POLICY IF EXISTS "historicos_insert_policy" ON public.historicos;
DROP POLICY IF EXISTS "historicos_update_policy" ON public.historicos;
DROP POLICY IF EXISTS "historicos_delete_policy" ON public.historicos;

-- Enable RLS
ALTER TABLE public.historicos ENABLE ROW LEVEL SECURITY;

-- SELECT policy
CREATE POLICY "historicos_select_policy" ON public.historicos
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
CREATE POLICY "historicos_insert_policy" ON public.historicos
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
CREATE POLICY "historicos_update_policy" ON public.historicos
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
CREATE POLICY "historicos_delete_policy" ON public.historicos
FOR DELETE
USING (
  proprietario_id = auth.uid()
  OR proprietario_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);
