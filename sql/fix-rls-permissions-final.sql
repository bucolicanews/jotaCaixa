-- 1. Garantir que a tabela de lookup existe e está acessível
CREATE TABLE IF NOT EXISTS public.admin_user_lookup (
    id uuid PRIMARY KEY,
    admin_id uuid NOT NULL
);

-- Desabilitar RLS na tabela de lookup para evitar recursão (a segurança é feita pela função)
ALTER TABLE public.admin_user_lookup DISABLE ROW LEVEL SECURITY;

-- 2. Forçar sincronização total da tabela de lookup
TRUNCATE TABLE public.admin_user_lookup;
INSERT INTO public.admin_user_lookup (id, admin_id)
SELECT id, admin_id FROM public.admin_usuarios;

-- 3. Recriar a função de segurança com privilégios elevados (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_admin_id_for_current_user()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER -- Executa como superusuário/dono
SET search_path = public -- Segurança contra search_path injection
AS $$
DECLARE
    v_admin_id uuid;
BEGIN
    SELECT admin_id INTO v_admin_id
    FROM public.admin_user_lookup
    WHERE id = auth.uid();
    
    RETURN v_admin_id;
END;
$$;

-- 4. Garantir permissões básicas (GRANT) para todos os autenticados
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_identificacao_extrato TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_descricao_extrato TO authenticated;
GRANT SELECT ON public.admin_user_lookup TO authenticated; -- Leitura básica necessária

-- 5. Recriar Políticas RLS para Identificadores (admin_identificacao_extrato)
ALTER TABLE public.admin_identificacao_extrato ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_identificacao_extrato_select" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_identificacao_extrato_insert" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_identificacao_extrato_update" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_identificacao_extrato_delete" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_identificacao_extrato_access" ON public.admin_identificacao_extrato;

-- Política unificada de LEITURA
CREATE POLICY "admin_identificacao_extrato_select" ON public.admin_identificacao_extrato
FOR SELECT TO authenticated
USING (
    admin_id = auth.uid() -- O próprio Admin
    OR 
    admin_id = public.get_admin_id_for_current_user() -- Funcionário do Admin
);

-- Política unificada de ESCRITA (Insert/Update/Delete)
CREATE POLICY "admin_identificacao_extrato_write" ON public.admin_identificacao_extrato
FOR ALL TO authenticated
USING (
    admin_id = auth.uid() -- Apenas o Admin pode criar/editar (regra de negócio comum)
    OR
    admin_id = public.get_admin_id_for_current_user() -- Funcionário também pode se necessário
)
WITH CHECK (
    admin_id = auth.uid() 
    OR
    admin_id = public.get_admin_id_for_current_user()
);

-- 6. Recriar Políticas RLS para Descrições (admin_descricao_extrato)
ALTER TABLE public.admin_descricao_extrato ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_descricao_extrato_select" ON public.admin_descricao_extrato;
DROP POLICY IF EXISTS "admin_descricao_extrato_all" ON public.admin_descricao_extrato;

CREATE POLICY "admin_descricao_extrato_select" ON public.admin_descricao_extrato
FOR SELECT TO authenticated
USING (
    admin_id = auth.uid() 
    OR 
    admin_id = public.get_admin_id_for_current_user()
);

CREATE POLICY "admin_descricao_extrato_write" ON public.admin_descricao_extrato
FOR ALL TO authenticated
USING (
    admin_id = auth.uid() 
    OR 
    admin_id = public.get_admin_id_for_current_user()
)
WITH CHECK (
    admin_id = auth.uid() 
    OR 
    admin_id = public.get_admin_id_for_current_user()
);