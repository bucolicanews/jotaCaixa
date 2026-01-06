-- Fix contratos_gerados RLS policies to allow both admins and admin employees (admin_usuarios)

-- Drop existing policies
DROP POLICY IF EXISTS "contratos_gerados_select_policy" ON public.contratos_gerados;
DROP POLICY IF EXISTS "contratos_gerados_insert_policy" ON public.contratos_gerados;
DROP POLICY IF EXISTS "contratos_gerados_update_policy" ON public.contratos_gerados;
DROP POLICY IF EXISTS "contratos_gerados_delete_policy" ON public.contratos_gerados;

-- Enable RLS
ALTER TABLE public.contratos_gerados ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Allow access if you're the proprietario, cliente, OR you're an employee of the proprietario
CREATE POLICY "contratos_gerados_select_policy" ON public.contratos_gerados
FOR SELECT
USING (
  proprietario_id = auth.uid() 
  OR cliente_id = auth.uid()
  OR proprietario_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- INSERT policy: Allow if you're the proprietario or an admin employee of the proprietario
CREATE POLICY "contratos_gerados_insert_policy" ON public.contratos_gerados
FOR INSERT
WITH CHECK (
  proprietario_id IN (
    SELECT auth.uid()
    UNION
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- UPDATE policy: Same logic as INSERT
CREATE POLICY "contratos_gerados_update_policy" ON public.contratos_gerados
FOR UPDATE
WITH CHECK (
  proprietario_id IN (
    SELECT auth.uid()
    UNION
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- DELETE policy: Same logic as INSERT
CREATE POLICY "contratos_gerados_delete_policy" ON public.contratos_gerados
FOR DELETE
USING (
  proprietario_id IN (
    SELECT auth.uid()
    UNION
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);
