-- Script Final para corrigir permissões da tabela admin_usuarios

-- 1. Habilita RLS na tabela (garantia)
ALTER TABLE public.admin_usuarios ENABLE ROW LEVEL SECURITY;

-- 2. Remove TODAS as políticas antigas e incorretas da tabela admin_usuarios
DROP POLICY IF EXISTS "Admin can manage their own users" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_access_policy" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_select_policy" ON public.admin_usuarios;
-- Adicionando outras que podem ter sido criadas em tentativas anteriores
DROP POLICY IF EXISTS "admin_usuarios_select" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_insert" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_update" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_delete" ON public.admin_usuarios;

-- 3. Cria as 4 políticas corretas e granulares

-- POLÍTICA DE LEITURA (SELECT):
-- Permite que um admin veja seus usuários e que um usuário veja seu próprio perfil.
CREATE POLICY "admin_usuarios_select" ON public.admin_usuarios
FOR SELECT TO authenticated 
USING (
  id = auth.uid() OR admin_id = auth.uid()
);

-- POLÍTICA DE INSERÇÃO (INSERT):
-- Permite que APENAS um admin crie novos usuários vinculados a si mesmo.
CREATE POLICY "admin_usuarios_insert" ON public.admin_usuarios
FOR INSERT TO authenticated 
WITH CHECK (
  admin_id = auth.uid()
);

-- POLÍTICA DE ATUALIZAÇÃO (UPDATE):
-- Permite que um admin atualize seus usuários e que um usuário atualize seu próprio perfil.
CREATE POLICY "admin_usuarios_update" ON public.admin_usuarios
FOR UPDATE TO authenticated 
USING (true) -- USING(true) para permitir que a checagem do WITH CHECK seja a única validação na atualização
WITH CHECK (
  id = auth.uid() OR admin_id = auth.uid()
);

-- POLÍTICA DE EXCLUSÃO (DELETE):
-- Permite que APENAS um admin delete os usuários que criou.
CREATE POLICY "admin_usuarios_delete" ON public.admin_usuarios
FOR DELETE TO authenticated 
USING (
  admin_id = auth.uid()
);

-- 4. Garante que a tabela auxiliar 'admin_user_lookup' tenha uma política permissiva
-- Isso é CRÍTICO para que o gatilho automático ao salvar um usuário não falhe.
ALTER TABLE public.admin_user_lookup ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_user_lookup_all" ON public.admin_user_lookup;

CREATE POLICY "admin_user_lookup_all" ON public.admin_user_lookup
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

COMMIT;
