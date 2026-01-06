-- Fix lancamentos RLS policy to allow admin employees to insert
-- The current policy blocks INSERT because WITH CHECK requires proprietario_id = auth.uid()
-- but for admin employees, proprietario_id should be their admin's ID

-- Drop existing policy
DROP POLICY IF EXISTS "lancamentos_access_policy" ON public.lancamentos;

-- Recreate with proper WITH CHECK for admin employees
CREATE POLICY "lancamentos_access_policy" ON public.lancamentos
FOR ALL
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
