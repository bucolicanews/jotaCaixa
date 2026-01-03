
-- Drop existing policies if they exist, to avoid conflicts
DROP POLICY IF EXISTS "Allow client users to see their own user data" ON public.tbl_usuarios;
DROP POLICY IF EXISTS "Client users can see their own user data" ON public.tbl_usuarios;

-- Create a new policy that allows users to select their own row in tbl_usuarios
CREATE POLICY "Client users can see their own user data"
ON public.tbl_usuarios
FOR SELECT
TO authenticated
USING (id = auth.uid());
