-- SCRIPT DE LIMPEZA DE POLÍTICAS DUPLICADAS

-- Removendo as políticas antigas com sufixo '_policy' que estão causando conflito.
DROP POLICY IF EXISTS "admin_usuarios_delete_policy" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_insert_policy" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_update_policy" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_select_policy" ON public.admin_usuarios; -- Incluindo a de select por segurança.

-- A política de SELECT correta ("admin_usuarios_select") já deve existir do script anterior.
-- Se o acesso do "usuário do admin" foi perdido, é porque a combinação das políticas de SELECT
-- está resultando em negação de acesso. Ao remover a política antiga, a correta voltará a funcionar.

-- Para garantir, vamos recriar a política de SELECT para que ela seja a única ativa e correta.
DROP POLICY IF EXISTS "admin_usuarios_select" ON public.admin_usuarios;

CREATE POLICY "admin_usuarios_select" ON public.admin_usuarios
FOR SELECT TO authenticated 
USING (
  -- Um usuário (seja admin ou funcionário) pode ver seu próprio registro de usuário.
  id = auth.uid() 
  OR 
  -- Um admin pode ver todos os registros de usuários que ele gerencia.
  admin_id = auth.uid()
);

SELECT 'Script de limpeza de políticas duplicadas foi executado com sucesso.' as message;
