-- Remove todas as políticas RLS existentes na tabela 'contrato_modelos' para evitar conflitos e erros.
DROP POLICY IF EXISTS "Usuários podem gerenciar apenas seus próprios modelos" ON "public"."contrato_modelos";
DROP POLICY IF EXISTS "Usuários podem visualizar seus modelos e os globais" ON "public"."contrato_modelos";
DROP POLICY IF EXISTS "Admin delete own models" ON "public"."contrato_modelos";
DROP POLICY IF EXISTS "Admin insert own models" ON "public"."contrato_modelos";
DROP POLICY IF EXISTS "Admin select own models" ON "public"."contrato_modelos";
DROP POLICY IF EXISTS "Admin update own models" ON "public"."contrato_modelos";
DROP POLICY IF EXISTS "Admin views all, Client views own models only" ON "public"."contrato_modelos";
DROP POLICY IF EXISTS "Clients and users can manage their own models" ON "public"."contrato_modelos";
DROP POLICY IF EXISTS "Permitir leitura de modelos globais e da empresa" ON "public"."contrato_modelos";
DROP POLICY IF EXISTS "Permitir gerenciamento de modelos da própria empresa" ON "public"."contrato_modelos";

-- Política 1: Acesso de LEITURA (SELECT)
-- Permite que usuários leiam modelos globais (empresa_id IS NULL) E modelos pertencentes à sua própria hierarquia de empresa.
CREATE POLICY "Permitir leitura de modelos globais e da empresa"
ON "public"."contrato_modelos"
FOR SELECT
TO authenticated
USING (
  -- Modelos globais são visíveis para todos
  (empresa_id IS NULL) OR
  -- Super admins (tbl_admins) podem ver tudo
  (EXISTS (SELECT 1 FROM public.tbl_admins WHERE id = auth.uid())) OR
  -- Clientes (tbl_clientes) e Admins (tbl_admins) podem ver seus próprios modelos
  (empresa_id = auth.uid()) OR
  -- Usuários de admin (admin_usuarios) podem ver os modelos do seu admin principal
  (empresa_id IN (SELECT lu.admin_id FROM public.admin_user_lookup lu WHERE lu.id = auth.uid())) OR
  -- Usuários de clientes (tbl_usuarios) podem ver os modelos da sua empresa cliente
  (empresa_id IN (SELECT u.cliente_id FROM public.tbl_usuarios u WHERE u.id = auth.uid()))
);

-- Política 2: Acesso de GERENCIAMENTO (INSERT, UPDATE, DELETE)
-- Permite que usuários gerenciem (criem, atualizem, deletem) modelos APENAS da sua própria hierarquia de empresa.
CREATE POLICY "Permitir gerenciamento de modelos da própria empresa"
ON "public"."contrato_modelos"
FOR ALL -- Aplica-se a INSERT, UPDATE, DELETE
TO authenticated
USING (
  -- Super admins podem gerenciar tudo
  (EXISTS (SELECT 1 FROM public.tbl_admins WHERE id = auth.uid())) OR
  -- Clientes e Admins podem gerenciar seus próprios modelos
  (empresa_id = auth.uid()) OR
  -- Usuários de admin podem gerenciar os modelos do seu admin principal
  (empresa_id IN (SELECT lu.admin_id FROM public.admin_user_lookup lu WHERE lu.id = auth.uid())) OR
  -- Usuários de clientes podem gerenciar os modelos da sua empresa cliente
  (empresa_id IN (SELECT u.cliente_id FROM public.tbl_usuarios u WHERE u.id = auth.uid()))
)
WITH CHECK (
  -- A mesma lógica se aplica para garantir que ninguém possa atribuir um modelo a uma empresa à qual não pertence.
  (EXISTS (SELECT 1 FROM public.tbl_admins WHERE id = auth.uid())) OR
  (empresa_id = auth.uid()) OR
  (empresa_id IN (SELECT lu.admin_id FROM public.admin_user_lookup lu WHERE lu.id = auth.uid())) OR
  (empresa_id IN (SELECT u.cliente_id FROM public.tbl_usuarios u WHERE u.id = auth.uid()))
);
