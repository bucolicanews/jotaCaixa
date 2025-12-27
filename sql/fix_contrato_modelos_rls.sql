-- 1. Remove as políticas de segurança (RLS) antigas e incorretas da tabela contrato_modelos.
-- Essas políticas estavam causando erros de permissão (403 Forbidden) e impedindo o funcionamento correto da aplicação para usuários administradores.
DROP POLICY IF EXISTS "Usuários podem gerenciar apenas seus próprios modelos" ON public.contrato_modelos;
DROP POLICY IF EXISTS "Usuários podem visualizar seus modelos e os globais" ON public.contrato_modelos;
DROP POLICY IF EXISTS "Admin delete own models" ON public.contrato_modelos;
DROP POLICY IF EXISTS "Admin insert own models" ON public.contrato_modelos;
DROP POLICY IF EXISTS "Admin select own models" ON public.contrato_modelos;
DROP POLICY IF EXISTS "Admin update own models" ON public.contrato_modelos;
DROP POLICY IF EXISTS "Admin views all, Client views own models only" ON public.contrato_modelos;
DROP POLICY IF EXISTS "Clients and users can manage their own models" ON public.contrato_modelos;


-- 2. Cria uma nova política para visualização (SELECT).
-- Permite que usuários autenticados vejam modelos globais (empresa_id IS NULL) e os modelos
-- pertencentes à sua própria organização (seja Cliente, Usuário de Admin ou Usuário de Cliente).
CREATE POLICY "RLS_ContratoModelos_SELECT"
ON public.contrato_modelos
FOR SELECT
TO authenticated
USING (
  (empresa_id IS NULL) -- Modelos globais
  OR (empresa_id = auth.uid()) -- Proprietários diretos (Clientes, Super Admins)
  OR (empresa_id IN (SELECT admin_id FROM public.admin_user_lookup WHERE id = auth.uid())) -- Usuários de Admin
  OR (empresa_id IN (SELECT cliente_id FROM public.tbl_usuarios WHERE id = auth.uid())) -- Usuários de Cliente
);


-- 3. Cria uma nova política para gerenciamento (INSERT, UPDATE, DELETE).
-- Permite que usuários autenticados criem, atualizem e deletem modelos que pertencem à sua organização.
-- A cláusula USING se aplica a UPDATE/DELETE para determinar quais linhas podem ser modificadas.
-- A cláusula WITH CHECK se aplica a INSERT/UPDATE para validar os dados da nova linha.
CREATE POLICY "RLS_ContratoModelos_MANAGE"
ON public.contrato_modelos
FOR INSERT, UPDATE, DELETE
TO authenticated
USING (
  (empresa_id = auth.uid())
  OR (empresa_id IN (SELECT admin_id FROM public.admin_user_lookup WHERE id = auth.uid()))
  OR (empresa_id IN (SELECT cliente_id FROM public.tbl_usuarios WHERE id = auth.uid()))
)
WITH CHECK (
  (empresa_id = auth.uid())
  OR (empresa_id IN (SELECT admin_id FROM public.admin_user_lookup WHERE id = auth.uid()))
  OR (empresa_id IN (SELECT cliente_id FROM public.tbl_usuarios WHERE id = auth.uid()))
);
