-- SCRIPT PARA CORRIGIR A POLÍTICA DE SELECT COM ERRO DE SINTAXE

-- 1. Remove a política 'admin_usuarios_select' que está com erro de sintaxe.
DROP POLICY IF EXISTS "admin_usuarios_select" ON public.admin_usuarios;

-- 2. Recria a política 'admin_usuarios_select' com a lógica correta e segura.
-- Esta política garante que:
--   a) O admin veja todos os seus usuários.
--   b) O "usuário do admin" veja APENAS o seu próprio perfil.
CREATE POLICY "admin_usuarios_select" ON public.admin_usuarios
FOR SELECT TO authenticated 
USING (
  -- Condição para o "usuário do admin": O ID do registro deve ser igual ao ID do usuário logado.
  id = auth.uid() 
  OR 
  -- Condição para o Admin: O admin_id do registro deve ser igual ao ID do admin logado.
  admin_id = auth.uid()
);

SELECT 'Política de SELECT (leitura) para admin_usuarios foi corrigida com sucesso.' as message;
