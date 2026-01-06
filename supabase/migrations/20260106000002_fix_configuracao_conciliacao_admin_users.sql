-- Fix configuracao_conciliacao RLS policy to allow admin users access
-- Similar to the pattern used in admin_contas_receber

-- Drop the existing policy that only checked proprietario_id
DROP POLICY IF EXISTS "Admins podem gerenciar configuracoes de conciliacao" ON public.configuracao_conciliacao;

-- Recreate the policy to allow both admins and their employees (admin_usuarios)
CREATE POLICY "Admins podem gerenciar configuracoes de conciliacao"
ON public.configuracao_conciliacao
FOR ALL
USING (
  proprietario_id IN (
    SELECT auth.uid() AS uid
    UNION
    SELECT admin_usuarios.admin_id FROM public.admin_usuarios WHERE admin_usuarios.id = auth.uid()
  )
)
WITH CHECK (
  proprietario_id IN (
    SELECT auth.uid() AS uid
    UNION
    SELECT admin_usuarios.admin_id FROM public.admin_usuarios WHERE admin_usuarios.id = auth.uid()
  )
);
