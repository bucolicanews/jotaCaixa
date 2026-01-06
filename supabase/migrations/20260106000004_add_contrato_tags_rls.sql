-- Add RLS policies to contrato_tags table

-- Enable RLS
ALTER TABLE public.contrato_tags ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Allow access if you're the owner or an admin employee of the owner
CREATE POLICY "contrato_tags_select_policy" ON public.contrato_tags
FOR SELECT
USING (
  empresa_id = auth.uid()
  OR empresa_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- INSERT policy: Same logic as SELECT
CREATE POLICY "contrato_tags_insert_policy" ON public.contrato_tags
FOR INSERT
WITH CHECK (
  empresa_id = auth.uid()
  OR empresa_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- UPDATE policy: Same logic as SELECT
CREATE POLICY "contrato_tags_update_policy" ON public.contrato_tags
FOR UPDATE
WITH CHECK (
  empresa_id = auth.uid()
  OR empresa_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- DELETE policy: Same logic as SELECT
CREATE POLICY "contrato_tags_delete_policy" ON public.contrato_tags
FOR DELETE
USING (
  empresa_id = auth.uid()
  OR empresa_id IN (
    SELECT admin_usuarios.admin_id 
    FROM admin_usuarios 
    WHERE admin_usuarios.id = auth.uid()
  )
);
