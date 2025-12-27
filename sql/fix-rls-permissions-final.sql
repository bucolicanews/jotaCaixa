-- 1. CORREÇÃO DA TABELA admin_usuarios
ALTER TABLE public.admin_usuarios ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas para garantir limpeza
DROP POLICY IF EXISTS "admin_usuarios_select" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_insert" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_update" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_delete" ON public.admin_usuarios;
DROP POLICY IF EXISTS "Admin pode gerenciar seus usuarios" ON public.admin_usuarios;
DROP POLICY IF EXISTS "Admin Users can view and update their own profile" ON public.admin_usuarios;

-- Política de LEITURA:
-- 1. O próprio usuário pode ver seu perfil (id = auth.uid())
-- 2. O Admin pode ver os usuários que ele criou (admin_id = auth.uid())
CREATE POLICY "admin_usuarios_select" ON public.admin_usuarios
FOR SELECT TO authenticated
USING (
  id = auth.uid() 
  OR admin_id = auth.uid()
);

-- Política de INSERÇÃO:
-- Apenas o Admin pode inserir novos usuários vinculados a ele
CREATE POLICY "admin_usuarios_insert" ON public.admin_usuarios
FOR INSERT TO authenticated
WITH CHECK (
  admin_id = auth.uid()
);

-- Política de ATUALIZAÇÃO:
-- 1. O Admin pode atualizar os usuários dele
-- 2. O usuário pode atualizar seu próprio perfil
CREATE POLICY "admin_usuarios_update" ON public.admin_usuarios
FOR UPDATE TO authenticated
USING (
  id = auth.uid() 
  OR admin_id = auth.uid()
)
WITH CHECK (
  id = auth.uid() 
  OR admin_id = auth.uid()
);

-- Política de EXCLUSÃO:
-- Apenas o Admin pode deletar seus usuários
CREATE POLICY "admin_usuarios_delete" ON public.admin_usuarios
FOR DELETE TO authenticated
USING (
  admin_id = auth.uid()
);

-- 2. CORREÇÃO DA TABELA AUXILIAR admin_user_lookup
-- Esta tabela é mantida automaticamente por trigger, mas o RLS precisa permitir a escrita
ALTER TABLE public.admin_user_lookup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_user_lookup_all" ON public.admin_user_lookup;
DROP POLICY IF EXISTS "Allow all on admin_user_lookup" ON public.admin_user_lookup;

-- Permite acesso total para usuários autenticados nesta tabela auxiliar
-- (A segurança real está na tabela principal admin_usuarios)
CREATE POLICY "admin_user_lookup_all" ON public.admin_user_lookup
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- 3. REFORÇO DO TRIGGER
-- Garante que a função do trigger execute com privilégios elevados (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.sync_admin_user_lookup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.admin_user_lookup WHERE id = OLD.id;
    RETURN OLD;
  ELSE
    -- Upsert para garantir sincronia
    INSERT INTO public.admin_user_lookup (id, admin_id)
    VALUES (NEW.id, NEW.admin_id)
    ON CONFLICT (id) DO UPDATE SET admin_id = EXCLUDED.admin_id;
    RETURN NEW;
  END IF;
END;
$function$;

-- 4. GRANT EXPLÍCITO
GRANT ALL ON public.admin_usuarios TO authenticated;
GRANT ALL ON public.admin_user_lookup TO authenticated;
GRANT ALL ON public.admin_user_lookup TO service_role;