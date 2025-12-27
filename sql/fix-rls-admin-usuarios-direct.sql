-- 1. Recriar a função de segurança para ler DIRETAMENTE de admin_usuarios
-- Usamos SECURITY DEFINER e SET LOCAL row_security = off para evitar recursão
CREATE OR REPLACE FUNCTION public.get_admin_id_for_current_user()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER -- Executa com permissões de admin do banco
SET search_path = public
AS $$
DECLARE
    v_admin_id uuid;
BEGIN
    -- Desliga RLS temporariamente apenas dentro desta função
    -- Isso permite ler a tabela admin_usuarios sem disparar as policies dela (que causavam o loop)
    SET LOCAL row_security = off;

    SELECT admin_id INTO v_admin_id
    FROM public.admin_usuarios
    WHERE id = auth.uid();
    
    RETURN v_admin_id;
END;
$$;

-- Garantir permissão de execução
GRANT EXECUTE ON FUNCTION public.get_admin_id_for_current_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_id_for_current_user TO anon;

-- 2. Recriar Políticas para Identificadores (admin_identificacao_extrato) usando a nova função
ALTER TABLE public.admin_identificacao_extrato ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas para evitar conflitos
DROP POLICY IF EXISTS "admin_identificacao_extrato_select" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_identificacao_extrato_write" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "admin_identificacao_extrato_access" ON public.admin_identificacao_extrato;
DROP POLICY IF EXISTS "identificacao_extrato_select" ON public.admin_identificacao_extrato;

-- Política de LEITURA: Admin vê seus registros OU Funcionário vê registros do seu Admin
CREATE POLICY "admin_identificacao_extrato_select" ON public.admin_identificacao_extrato
FOR SELECT TO authenticated
USING (
    admin_id = auth.uid() -- Se eu sou o Admin
    OR 
    admin_id = public.get_admin_id_for_current_user() -- Se eu sou funcionário deste Admin
);

-- Política de ESCRITA: Admin gerencia seus registros
CREATE POLICY "admin_identificacao_extrato_write" ON public.admin_identificacao_extrato
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

-- 3. Recriar Políticas para Descrições (admin_descricao_extrato)
ALTER TABLE public.admin_descricao_extrato ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_descricao_extrato_select" ON public.admin_descricao_extrato;
DROP POLICY IF EXISTS "admin_descricao_extrato_write" ON public.admin_descricao_extrato;
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

-- 4. Garantir Grants explícitos (caso faltem)
GRANT ALL ON public.admin_identificacao_extrato TO authenticated;
GRANT ALL ON public.admin_descricao_extrato TO authenticated;