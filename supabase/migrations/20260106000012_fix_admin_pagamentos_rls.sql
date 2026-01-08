-- Fix RLS policies for admin_pagamentos to support admin_usuarios
-- Admin employees (admin_usuarios) need same access as direct admin

-- Drop existing policies
DROP POLICY IF EXISTS "admin_pagamentos_select_policy" ON public.admin_pagamentos;
DROP POLICY IF EXISTS "admin_pagamentos_insert_policy" ON public.admin_pagamentos;
DROP POLICY IF EXISTS "admin_pagamentos_update_policy" ON public.admin_pagamentos;
DROP POLICY IF EXISTS "admin_pagamentos_delete_policy" ON public.admin_pagamentos;
DROP POLICY IF EXISTS "Admin can manage own payments" ON public.admin_pagamentos;

-- Enable RLS
ALTER TABLE public.admin_pagamentos ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Admin direto OU funcionário do admin
CREATE POLICY "admin_pagamentos_select_policy" ON public.admin_pagamentos
FOR SELECT
USING (
  admin_id = auth.uid()
  OR admin_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- INSERT policy
CREATE POLICY "admin_pagamentos_insert_policy" ON public.admin_pagamentos
FOR INSERT
WITH CHECK (
  admin_id = auth.uid()
  OR admin_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- UPDATE policy
CREATE POLICY "admin_pagamentos_update_policy" ON public.admin_pagamentos
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

-- DELETE policy
CREATE POLICY "admin_pagamentos_delete_policy" ON public.admin_pagamentos
FOR DELETE
USING (
  admin_id = auth.uid()
  OR admin_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);
