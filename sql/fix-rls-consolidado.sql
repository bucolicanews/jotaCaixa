-- Script Consolidado de Correção de RLS
-- Objetivo: Unificar e corrigir todas as políticas de segurança de tabelas admin.

-- 1. FUNÇÃO UNIFICADA E ROBUSTA PARA OBTER O ADMIN ID
-- Dropa versões antigas para evitar conflitos
DROP FUNCTION IF EXISTS public.get_admin_id_for_current_user();
DROP FUNCTION IF EXISTS public.get_admin_id();

-- Cria a função padrão `get_admin_id` que retorna o ID do admin para o usuário logado.
-- Se o usuário for o próprio admin, retorna seu próprio ID.
-- Se for um usuário gerenciado, retorna o ID do seu admin.
CREATE OR REPLACE FUNCTION public.get_admin_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  admin_uuid uuid;
BEGIN
  -- Tenta obter o admin_id da tabela de lookup para o usuário atual
  SELECT admin_id INTO admin_uuid
  FROM public.admin_user_lookup
  WHERE user_id = auth.uid()
  LIMIT 1;

  -- Se não encontrar (usuário não é gerenciado), assume que ele é o admin.
  IF admin_uuid IS NULL THEN
    RETURN auth.uid();
  END IF;

  -- Retorna o admin_id encontrado.
  RETURN admin_uuid;
END;
$$;

-- Garante permissão de execução para a função
GRANT EXECUTE ON FUNCTION public.get_admin_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_id() TO service_role;


-- 2. CORREÇÃO DAS POLÍTICAS DE 'IDENTIFICADORES' E 'DESCRIÇÕES'
-- O erro acontecia aqui: usuários não-admin não podiam criar registros.
ALTER TABLE public.admin_identificacao_extrato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_descricao_extrato ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas para uma aplicação limpa
DROP POLICY IF EXISTS "admin_identificacao_extrato_policy" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_descricao_extrato_policy" ON public.admin_descricao_extrato;

-- Nova política permissiva para LEITURA (USING) e ESCRITA (WITH CHECK)
-- Leitura: Permite ver registros do seu próprio admin.
-- Escrita: Garante que o registro sendo criado/editado pertença ao seu próprio admin.
CREATE POLICY "admin_identificacao_extrato_policy" 
ON public.admin_identificacao_extrato
FOR ALL TO authenticated
USING ( admin_id = public.get_admin_id() )
WITH CHECK ( admin_id = public.get_admin_id() );

CREATE POLICY "admin_descricao_extrato_policy" 
ON public.admin_descricao_extrato
FOR ALL TO authenticated
USING ( admin_id = public.get_admin_id() )
WITH CHECK ( admin_id = public.get_admin_id() );


-- 3. GARANTIA DAS POLÍTICAS DA TABELA 'admin_usuarios'
-- Essas políticas permitem que um admin gerencie seus usuários e que usuários editem seus próprios perfis.
ALTER TABLE public.admin_usuarios ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas para evitar conflitos
DROP POLICY IF EXISTS "admin_usuarios_select" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_insert" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_update" ON public.admin_usuarios;
DROP POLICY IF EXISTS "admin_usuarios_delete" ON public.admin_usuarios;

-- Leitura: Admin vê seus usuários, e usuário vê seu próprio perfil.
CREATE POLICY "admin_usuarios_select" ON public.admin_usuarios
FOR SELECT TO authenticated USING (id = auth.uid() OR admin_id = auth.uid());

-- Inserção: Apenas o admin pode criar usuários para si.
CREATE POLICY "admin_usuarios_insert" ON public.admin_usuarios
FOR INSERT TO authenticated WITH CHECK (admin_id = auth.uid());

-- Atualização: Admin atualiza seus usuários, e usuário atualiza seu próprio perfil.
CREATE POLICY "admin_usuarios_update" ON public.admin_usuarios
FOR UPDATE TO authenticated USING (true) WITH CHECK (id = auth.uid() OR admin_id = auth.uid());

-- Deleção: Apenas o admin pode deletar seus usuários.
CREATE POLICY "admin_usuarios_delete" ON public.admin_usuarios
FOR DELETE TO authenticated USING (admin_id = auth.uid());


-- 4. GARANTIA DA POLÍTICA DA TABELA 'admin_user_lookup'
-- Essencial para o gatilho que sincroniza usuários não falhar.
ALTER TABLE public.admin_user_lookup ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas
DROP POLICY IF EXISTS "admin_user_lookup_all" ON public.admin_user_lookup;

-- Permite acesso total, pois a tabela é interna e controlada por trigger.
CREATE POLICY "admin_user_lookup_all" ON public.admin_user_lookup
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- Garante que o trigger funcione corretamente ao sincronizar
DROP TRIGGER IF EXISTS on_admin_usuarios_change ON public.admin_usuarios;
CREATE TRIGGER on_admin_usuarios_change
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_usuarios
  FOR EACH ROW EXECUTE FUNCTION public.sync_admin_user_lookup();

COMMIT; -- Garante que todas as alterações sejam aplicadas.
