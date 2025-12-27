-- 1. Remover políticas restritivas atuais
DROP POLICY IF EXISTS "admin_identificacao_extrato_select" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_identificacao_extrato_insert" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_identificacao_extrato_update" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_identificacao_extrato_delete" ON public.admin_identificacao_extrato;

-- 2. Criar políticas permissivas para Admin + Funcionários do Admin

-- LEITURA
CREATE POLICY "admin_identificacao_extrato_select" ON public.admin_identificacao_extrato
FOR SELECT USING (
  admin_id = auth.uid() OR 
  admin_id = public.get_admin_id_for_current_user()
);

-- INSERÇÃO
CREATE POLICY "admin_identificacao_extrato_insert" ON public.admin_identificacao_extrato
FOR INSERT WITH CHECK (
  admin_id = auth.uid() OR 
  admin_id = public.get_admin_id_for_current_user()
);

-- ATUALIZAÇÃO
CREATE POLICY "admin_identificacao_extrato_update" ON public.admin_identificacao_extrato
FOR UPDATE USING (
  admin_id = auth.uid() OR 
  admin_id = public.get_admin_id_for_current_user()
);

-- EXCLUSÃO
CREATE POLICY "admin_identificacao_extrato_delete" ON public.admin_identificacao_extrato
FOR DELETE USING (
  admin_id = auth.uid() OR 
  admin_id = public.get_admin_id_for_current_user()
);