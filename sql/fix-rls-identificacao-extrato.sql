-- 1. Garante que a função correta de busca de ID existe
CREATE OR REPLACE FUNCTION public.get_admin_id_for_current_user()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER -- Executa com permissões de superusuário para ler a tabela de lookup
 SET search_path TO ''
AS $function$
DECLARE
  current_admin uuid;
BEGIN
  -- Busca o admin_id na tabela de lookup
  SELECT admin_id INTO current_admin 
  FROM public.admin_user_lookup 
  WHERE id = auth.uid();
  
  RETURN current_admin;
END;
$function$;

-- 2. Corrige a tabela admin_identificacao_extrato (Identificadores)
ALTER TABLE public.admin_identificacao_extrato ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permite acesso total para admins" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "Permite leitura para usuarios" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_identificacao_extrato_select" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_identificacao_extrato_insert" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_identificacao_extrato_update" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_identificacao_extrato_delete" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "Permite acesso total para admins aos seus próprios identificadores" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "Permite leitura para usuários associados" ON public.admin_identificacao_extrato;

-- Política Unificada: Admin vê/edita os seus, Funcionário vê os do Admin
CREATE POLICY "admin_identificacao_extrato_policy" 
ON public.admin_identificacao_extrato
FOR ALL 
TO authenticated
USING (
  admin_id = auth.uid() -- O próprio Admin acessa
  OR 
  admin_id = public.get_admin_id_for_current_user() -- O Funcionário acessa os do seu Admin
)
WITH CHECK (
  admin_id = auth.uid() -- Apenas o Admin pode criar/editar/excluir
);

-- 3. Aplica a mesma lógica para admin_descricao_extrato (Descrições)
ALTER TABLE public.admin_descricao_extrato ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_descricao_extrato_policy" ON public.admin_descricao_extrato;

CREATE POLICY "admin_descricao_extrato_policy" 
ON public.admin_descricao_extrato
FOR ALL 
TO authenticated
USING (
  admin_id = auth.uid() 
  OR 
  admin_id = public.get_admin_id_for_current_user()
)
WITH CHECK (
  admin_id = auth.uid()
);

-- 4. CORREÇÃO CRÍTICA: Libera a tabela admin_user_lookup para evitar o erro ao salvar usuário
ALTER TABLE public.admin_user_lookup ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas para evitar conflitos
DROP POLICY IF EXISTS "Allow all on admin_user_lookup" ON public.admin_user_lookup;
DROP POLICY IF EXISTS "admin_user_lookup_all" ON public.admin_user_lookup;

-- Cria política permissiva para a tabela de lookup (necessária para os triggers funcionarem)
CREATE POLICY "admin_user_lookup_all" ON public.admin_user_lookup
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- Garante permissões
GRANT ALL ON public.admin_user_lookup TO authenticated;
GRANT ALL ON public.admin_user_lookup TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_id_for_current_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_id_for_current_user TO service_role;