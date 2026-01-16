-- CONSOLIDATED RLS FIX SCRIPT

-- ========= admin_user_lookup =========
-- Tabela interna, acessada por triggers. RLS desabilitado para evitar conflitos.
ALTER TABLE public.admin_user_lookup DISABLE ROW LEVEL SECURITY;

-- ========= admin_usuarios =========

-- 1. Habilita RLS
ALTER TABLE public.admin_usuarios ENABLE ROW LEVEL SECURITY;

-- 2. Remove políticas antigas
DROP POLICY IF EXISTS "Admin can manage their own users" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_access_policy" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_select_policy" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_select" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_insert" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_update" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_delete" ON public.admin_usuarios;
DROP POLICY IF EXISTS "Enable all access for admin users" ON public.admin_usuarios; -- Outra possível política antiga

-- 3. Cria políticas corretas

-- SELECT: Admin vê seus usuários, usuário vê a si mesmo.
CREATE POLICY "admin_usuarios_select" ON public.admin_usuarios
FOR SELECT TO authenticated 
USING (
  id = auth.uid() OR admin_id = auth.uid()
);

-- INSERT: Admin pode criar usuários para si.
CREATE POLICY "admin_usuarios_insert" ON public.admin_usuarios
FOR INSERT TO authenticated 
WITH CHECK (
  admin_id = auth.uid()
);

-- UPDATE: Admin atualiza seus usuários, usuário atualiza a si mesmo.
CREATE POLICY "admin_usuarios_update" ON public.admin_usuarios
FOR UPDATE TO authenticated 
USING (true)
WITH CHECK (
  id = auth.uid() OR admin_id = auth.uid()
);

-- DELETE: Admin deleta seus usuários.
CREATE POLICY "admin_usuarios_delete" ON public.admin_usuarios
FOR DELETE TO authenticated 
USING (
  admin_id = auth.uid()
);


-- ========= Funções de Segurança =========

-- Função para pegar o admin_id de um usuário.
-- SECURITY DEFINER para bypass RLS interno.
CREATE OR REPLACE FUNCTION public.get_admin_id_for_current_user()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  current_admin uuid;
BEGIN
  -- Desliga RLS localmente para ler a tabela de lookup de forma segura
  SET LOCAL row_security = off;
  
  -- Tenta primeiro da tabela de usuários do admin
  SELECT admin_id INTO current_admin 
  FROM public.admin_usuarios
  WHERE id = auth.uid();
  
  -- Se não encontrar (pode ser um usuário de cliente), retorna null ou busca em outro lugar se necessário.
  IF current_admin IS NULL THEN
     -- Em um cenário complexo, poderia buscar em tbl_usuarios -> tbl_clientes -> admin_id
     -- Por enquanto, retornamos o que encontramos.
     RETURN NULL;
  END IF;
  
  RETURN current_admin;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_admin_id_for_current_user TO authenticated;


-- Trigger para sincronizar a tabela de lookup.
-- SECURITY DEFINER para ter permissão de escrita.
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

-- Garantir que o trigger está na tabela correta
DROP TRIGGER IF EXISTS on_admin_usuarios_change_sync_lookup ON public.admin_usuarios;
CREATE TRIGGER on_admin_usuarios_change_sync_lookup
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_usuarios
  FOR EACH ROW EXECUTE FUNCTION public.sync_admin_user_lookup();

-- Mensagem de sucesso
SELECT 'Script de correção de RLS consolidado aplicado com sucesso.' as message;
