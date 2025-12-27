-- 1. Garante que a tabela de lookup não tenha RLS (a forma mais segura de evitar o erro)
ALTER TABLE public.admin_user_lookup DISABLE ROW LEVEL SECURITY;

-- 2. Remove políticas antigas na tabela de lookup (se existirem)
DROP POLICY IF EXISTS "admin_user_lookup_permissive" ON public.admin_user_lookup;

-- 3. Garante que o Admin possa gerenciar seus próprios usuários (INSERT/UPDATE/DELETE)
-- Tabela: admin_usuarios
DROP POLICY IF EXISTS "Admin can manage their own users" ON public.admin_usuarios;
CREATE POLICY "Admin can manage their own users"
ON public.admin_usuarios
FOR ALL
TO authenticated
USING (admin_id = auth.uid())
WITH CHECK (admin_id = auth.uid());

-- 4. Garante que o Admin possa gerenciar usuários de seus clientes (INSERT/UPDATE/DELETE)
-- Tabela: tbl_usuarios
DROP POLICY IF EXISTS "Admin can manage client users" ON public.tbl_usuarios;
CREATE POLICY "Admin can manage client users"
ON public.tbl_usuarios
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.tbl_clientes tc
        WHERE tc.id = tbl_usuarios.cliente_id AND tc.admin_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.tbl_clientes tc
        WHERE tc.id = tbl_usuarios.cliente_id AND tc.admin_id = auth.uid()
    )
);

-- 5. Garante que o trigger de sincronização está definido como SECURITY DEFINER
-- (Isso é crucial para que ele ignore o RLS das tabelas que ele está lendo/escrevendo)
CREATE OR REPLACE FUNCTION public.sync_admin_user_lookup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.admin_user_lookup WHERE id = OLD.id;
    RETURN OLD;
  ELSE
    INSERT INTO public.admin_user_lookup (id, admin_id)
    VALUES (NEW.id, NEW.admin_id)
    ON CONFLICT (id) DO UPDATE SET admin_id = EXCLUDED.admin_id;
    RETURN NEW;
  END IF;
END;
$function$;