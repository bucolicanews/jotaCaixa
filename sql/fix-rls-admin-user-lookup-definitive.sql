-- 1. Desabilita RLS na tabela de lookup.
-- Esta tabela é interna e só deve ser escrita por triggers, eliminando o conflito de RLS.
ALTER TABLE public.admin_user_lookup DISABLE ROW LEVEL SECURITY;

-- 2. Garante que a função de busca de Admin ID (usada em outras RLS) está definida corretamente.
CREATE OR REPLACE FUNCTION public.get_admin_id_for_current_user()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER -- Executa com privilégios de superusuário
 SET search_path TO ''
AS $function$
DECLARE
  current_admin uuid;
BEGIN
  -- Desliga RLS localmente para ler a tabela de lookup
  SET LOCAL row_security = off;
  SELECT admin_id INTO current_admin 
  FROM public.admin_user_lookup 
  WHERE id = auth.uid();
  
  RETURN current_admin;
END;
$function$;

-- 3. Garante que o trigger de sincronização está definido como SECURITY DEFINER
-- (Isso já deve estar correto, mas reforçamos aqui)
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

-- 4. Concede permissão de execução para a função de busca
GRANT EXECUTE ON FUNCTION public.get_admin_id_for_current_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_id_for_current_user TO service_role;