-- 1. Garante que o RLS está habilitado (boa prática), mas vamos criar uma política permissiva
ALTER TABLE public.admin_user_lookup ENABLE ROW LEVEL SECURITY;

-- 2. Remove políticas antigas que possam estar bloqueando
DROP POLICY IF EXISTS "Allow all on admin_user_lookup" ON public.admin_user_lookup;
DROP POLICY IF EXISTS "admin_user_lookup_policy" ON public.admin_user_lookup;
DROP POLICY IF EXISTS "public_admin_user_lookup" ON public.admin_user_lookup;

-- 3. Cria uma política que permite TUDO para usuários autenticados nesta tabela auxiliar
-- Isso resolve o erro "new row violates row-level security policy" pois permite que o gatilho escreva nela.
CREATE POLICY "Allow all on admin_user_lookup"
ON public.admin_user_lookup
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. Garante permissões de Grant (caso tenham sido revogadas)
GRANT ALL ON public.admin_user_lookup TO authenticated;
GRANT ALL ON public.admin_user_lookup TO service_role;

-- 5. Reforça a definição da função do gatilho para garantir que ela funcione
CREATE OR REPLACE FUNCTION public.sync_admin_user_lookup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER -- Executa como dono do banco para garantir acesso
AS $function$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.admin_user_lookup WHERE id = OLD.id;
    RETURN OLD;
  ELSE
    -- Usa ON CONFLICT para evitar erros de duplicidade se o registro já existir
    INSERT INTO public.admin_user_lookup (id, admin_id)
    VALUES (NEW.id, NEW.admin_id)
    ON CONFLICT (id) DO UPDATE SET admin_id = EXCLUDED.admin_id;
    RETURN NEW;
  END IF;
END;
$function$;