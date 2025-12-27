-- ============================================================================
-- SCRIPT PARA CORRIGIR POLÍTICA RLS DA TABELA "admin_user_lookup"
-- Execute este script no SQL Editor do Supabase
-- ============================================================================
-- PROBLEMA:
-- Ao editar um usuário como Admin, um erro de "row-level security policy"
-- ocorre na tabela 'admin_user_lookup'. Isso acontece porque o gatilho
-- na tabela 'admin_usuarios' tenta inserir/atualizar dados na 'admin_user_lookup',
-- mas a política de segurança nesta tabela está ausente ou incorreta.
--
-- SOLUÇÃO:
-- Este script cria uma política RLS para 'admin_user_lookup' que espelha
-- a lógica da tabela 'admin_usuarios'. Ele permite que um registro seja
-- modificado se o usuário autenticado for o próprio usuário ou o administrador
-- ('admin_id') associado a esse usuário.
-- ============================================================================

-- Habilita a Segurança em Nível de Linha (RLS) para a tabela admin_user_lookup.
-- É seguro executar mesmo que já esteja habilitada.
ALTER TABLE public.admin_user_lookup ENABLE ROW LEVEL SECURITY;

-- Remove qualquer política existente para evitar conflitos.
DROP POLICY IF EXISTS "admin_lookup_access_policy" ON public.admin_user_lookup;

-- Cria uma nova política de acesso para a tabela admin_user_lookup.
-- Esta política permite que uma linha seja acessada ou modificada se:
-- 1. O 'id' da linha corresponde ao ID do usuário autenticado (o próprio usuário).
-- 2. O 'admin_id' da linha corresponde ao ID do usuário autenticado (o administrador do usuário).
-- Isso garante que, quando um administrador edita um de seus usuários, o gatilho
-- que atualiza esta tabela tenha a permissão necessária para inserir/atualizar o registro de lookup.
CREATE POLICY "admin_lookup_access_policy" ON public.admin_user_lookup
FOR ALL
USING (id = auth.uid() OR admin_id = auth.uid())
WITH CHECK (id = auth.uid() OR admin_id = auth.uid());

-- ============================================================================
-- VERIFICAÇÃO (Opcional)
-- ============================================================================
-- Para confirmar que a política foi criada corretamente, execute o comando abaixo:
--
-- SELECT tablename, policyname, cmd, qual, with_check 
-- FROM pg_policies 
-- WHERE tablename = 'admin_user_lookup';
--
-- Você deve ver a política "admin_lookup_access_policy" listada.
-- ============================================================================
