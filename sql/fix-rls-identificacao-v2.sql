-- Script de Correção (v2) - Seguro e Focado
-- Objetivo: Corrigir a permissão de escrita para usuários em 'identificadores' e 'descrições' sem afetar outras políticas.

-- 1. CORREÇÃO DAS POLÍTICAS DE 'IDENTIFICADORES' E 'DESCRIÇÕES'
-- O erro original acontecia aqui: usuários não-admin não podiam criar registros.
-- Esta nova versão corrige isso sem remover a função que outras políticas usam.

ALTER TABLE public.admin_identificacao_extrato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_descricao_extrato ENABLE ROW LEVEL SECURITY;

-- Remove as políticas antigas e problemáticas para substituí-las
DROP POLICY IF EXISTS "admin_identificacao_extrato_policy" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_descricao_extrato_policy" ON public.admin_descricao_extrato;

-- Cria a Nova Política Corrigida
-- A lógica principal está no WITH CHECK usando COALESCE.
-- COALESCE(public.get_admin_id_for_current_user(), auth.uid()) faz o seguinte:
-- - Se for um usuário comum, usa o ID do seu admin.
-- - Se for um admin (função retorna NULL), usa o seu próprio ID (auth.uid()).
-- Isso garante que qualquer registro criado seja sempre associado ao admin correto.

CREATE POLICY "admin_identificacao_extrato_policy" 
ON public.admin_identificacao_extrato
FOR ALL TO authenticated
USING ( 
    admin_id = COALESCE(public.get_admin_id_for_current_user(), auth.uid())
)
WITH CHECK ( 
    admin_id = COALESCE(public.get_admin_id_for_current_user(), auth.uid())
);

CREATE POLICY "admin_descricao_extrato_policy" 
ON public.admin_descricao_extrato
FOR ALL TO authenticated
USING ( 
    admin_id = COALESCE(public.get_admin_id_for_current_user(), auth.uid())
)
WITH CHECK ( 
    admin_id = COALESCE(public.get_admin_id_for_current_user(), auth.uid())
);

-- Garante as permissões de execução na função (reforço)
GRANT EXECUTE ON FUNCTION public.get_admin_id_for_current_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_id_for_current_user() TO service_role;

COMMIT;
