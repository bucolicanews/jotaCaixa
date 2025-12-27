-- 1. Forçar a atualização da tabela de lookup para garantir que o usuário 'jota' e outros estejam mapeados corretamente
TRUNCATE TABLE public.admin_user_lookup;

INSERT INTO public.admin_user_lookup (id, admin_id)
SELECT id, admin_id FROM public.admin_usuarios;

-- 2. Atualizar Políticas da Tabela de Identificadores (admin_identificacao_extrato)
DROP POLICY IF EXISTS "admin_identificacao_extrato_select" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_identificacao_extrato_insert" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_identificacao_extrato_update" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_identificacao_extrato_delete" ON public.admin_identificacao_extrato;

CREATE POLICY "admin_identificacao_extrato_select" ON public.admin_identificacao_extrato
FOR SELECT TO authenticated USING (
  admin_id = auth.uid() OR 
  admin_id = public.get_admin_id_for_current_user()
);

CREATE POLICY "admin_identificacao_extrato_insert" ON public.admin_identificacao_extrato
FOR INSERT TO authenticated WITH CHECK (
  admin_id = auth.uid() OR 
  admin_id = public.get_admin_id_for_current_user()
);

CREATE POLICY "admin_identificacao_extrato_update" ON public.admin_identificacao_extrato
FOR UPDATE TO authenticated USING (
  admin_id = auth.uid() OR 
  admin_id = public.get_admin_id_for_current_user()
);

CREATE POLICY "admin_identificacao_extrato_delete" ON public.admin_identificacao_extrato
FOR DELETE TO authenticated USING (
  admin_id = auth.uid() OR 
  admin_id = public.get_admin_id_for_current_user()
);

-- 3. Atualizar Políticas da Tabela de Descrições (admin_descricao_extrato) - Correção Proativa
DROP POLICY IF EXISTS "admin_descricao_extrato_select" ON public.admin_descricao_extrato;
DROP POLICY IF EXISTS "admin_descricao_extrato_insert" ON public.admin_descricao_extrato;
DROP POLICY IF EXISTS "admin_descricao_extrato_update" ON public.admin_descricao_extrato;
DROP POLICY IF EXISTS "admin_descricao_extrato_delete" ON public.admin_descricao_extrato;

CREATE POLICY "admin_descricao_extrato_select" ON public.admin_descricao_extrato
FOR SELECT TO authenticated USING (
  admin_id = auth.uid() OR 
  admin_id = public.get_admin_id_for_current_user()
);

CREATE POLICY "admin_descricao_extrato_insert" ON public.admin_descricao_extrato
FOR INSERT TO authenticated WITH CHECK (
  admin_id = auth.uid() OR 
  admin_id = public.get_admin_id_for_current_user()
);

CREATE POLICY "admin_descricao_extrato_update" ON public.admin_descricao_extrato
FOR UPDATE TO authenticated USING (
  admin_id = auth.uid() OR 
  admin_id = public.get_admin_id_for_current_user()
);

CREATE POLICY "admin_descricao_extrato_delete" ON public.admin_descricao_extrato
FOR DELETE TO authenticated USING (
  admin_id = auth.uid() OR 
  admin_id = public.get_admin_id_for_current_user()
);