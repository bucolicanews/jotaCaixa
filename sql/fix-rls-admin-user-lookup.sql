-- 1. Desabilita RLS temporariamente para garantir que as alterações de política sejam aplicadas limpas
ALTER TABLE public.admin_user_lookup DISABLE ROW LEVEL SECURITY;

-- 2. Remove TODAS as políticas existentes nessa tabela para evitar conflitos ocultos
DROP POLICY IF EXISTS "admin_user_lookup_all" ON public.admin_user_lookup;
DROP POLICY IF EXISTS "Allow all on admin_user_lookup" ON public.admin_user_lookup;
DROP POLICY IF EXISTS "admin_user_lookup_select" ON public.admin_user_lookup;
DROP POLICY IF EXISTS "admin_user_lookup_insert" ON public.admin_user_lookup;
DROP POLICY IF EXISTS "admin_user_lookup_update" ON public.admin_user_lookup;
DROP POLICY IF EXISTS "admin_user_lookup_delete" ON public.admin_user_lookup;

-- 3. Habilita RLS novamente
ALTER TABLE public.admin_user_lookup ENABLE ROW LEVEL SECURITY;

-- 4. Cria uma política ÚNICA e TOTAL para usuários autenticados
-- Essa tabela é mantida automaticamente por triggers seguros.
-- Precisamos permitir que o trigger escreva nela sem ser bloqueado.
CREATE POLICY "admin_user_lookup_permissive"
ON public.admin_user_lookup
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 5. Garante as permissões de acesso ao nível do banco
GRANT ALL ON public.admin_user_lookup TO authenticated;
GRANT ALL ON public.admin_user_lookup TO service_role;

-- 6. Reforça a função do trigger para rodar como SECURITY DEFINER (Superusuário)
-- Isso garante que o trigger tenha permissão máxima, ignorando RLS se necessário
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
    -- Usa UPSERT para evitar erros de chave duplicada
    INSERT INTO public.admin_user_lookup (id, admin_id)
    VALUES (NEW.id, NEW.admin_id)
    ON CONFLICT (id) DO UPDATE SET admin_id = EXCLUDED.admin_id;
    RETURN NEW;
  END IF;
END;
$function$;