-- Fix RLS policies for admin_parcelas_receber to support admin_usuarios
-- The issue is that admin employees (admin_usuarios) cannot view installments

-- Drop existing policies
DROP POLICY IF EXISTS "Admin can manage own installments" ON public.admin_parcelas_receber;
DROP POLICY IF EXISTS "admin_parcelas_receber_select_policy" ON public.admin_parcelas_receber;
DROP POLICY IF EXISTS "admin_parcelas_receber_insert_policy" ON public.admin_parcelas_receber;
DROP POLICY IF EXISTS "admin_parcelas_receber_update_policy" ON public.admin_parcelas_receber;
DROP POLICY IF EXISTS "admin_parcelas_receber_delete_policy" ON public.admin_parcelas_receber;

-- Enable RLS
ALTER TABLE public.admin_parcelas_receber ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Admin or admin employee can view
CREATE POLICY "admin_parcelas_receber_select_policy" ON public.admin_parcelas_receber
FOR SELECT
USING (
  admin_id = auth.uid()
  OR admin_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- INSERT policy: Admin or admin employee can insert
CREATE POLICY "admin_parcelas_receber_insert_policy" ON public.admin_parcelas_receber
FOR INSERT
WITH CHECK (
  admin_id = auth.uid()
  OR admin_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- UPDATE policy: Admin or admin employee can update
CREATE POLICY "admin_parcelas_receber_update_policy" ON public.admin_parcelas_receber
FOR UPDATE
USING (
  admin_id = auth.uid()
  OR admin_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
)
WITH CHECK (
  admin_id = auth.uid()
  OR admin_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- DELETE policy: Admin or admin employee can delete
CREATE POLICY "admin_parcelas_receber_delete_policy" ON public.admin_parcelas_receber
FOR DELETE
USING (
  admin_id = auth.uid()
  OR admin_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);
