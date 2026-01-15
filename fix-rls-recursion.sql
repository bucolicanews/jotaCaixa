-- ============================================================================
-- SCRIPT COMPLETO PARA CORRIGIR POLÍTICAS RLS (INCLUINDO CORREÇÃO DE RECURSÃO)
-- Execute este script no SQL Editor do Supabase
-- ============================================================================
-- ESTRUTURA: 
--   - proprietario_id: Refere-se ao ID do dono dos dados (geralmente um registro em tbl_clientes).
--   - admin_usuarios: Tabela que liga funcionários (com seu auth.uid) a um admin (admin_id).
-- ============================================================================

-- ============================================================================
-- PASSO 1: CORRIGIR POLÍTICAS PARA tbl_clientes (QUEBRAR RECURSÃO)
-- ============================================================================

-- Habilitar RLS (caso não esteja)
ALTER TABLE public.tbl_clientes ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas que possam causar conflito
DROP POLICY IF EXISTS "clientes_self_access_policy" ON public.tbl_clientes;
DROP POLICY IF EXISTS "admin_can_see_their_clients" ON public.tbl_clientes;

-- NOVA POLÍTICA (SELECT): Permite que usuários vejam seu próprio registro de cliente.
-- Também permite que funcionários (admin_usuarios) vejam o registro do cliente para o qual trabalham.
CREATE POLICY "clientes_select_policy" ON public.tbl_clientes
FOR SELECT USING (
    id = auth.uid() -- O usuário é o próprio cliente
    OR EXISTS ( -- O usuário é um funcionário do cliente
        SELECT 1
        FROM public.admin_usuarios au
        WHERE au.id = auth.uid() AND au.admin_id = public.tbl_clientes.id
    )
);

-- NOVA POLÍTICA (MODIFICAÇÃO): Apenas o próprio cliente pode modificar seu registro.
CREATE POLICY "clientes_update_policy" ON public.tbl_clientes
FOR UPDATE USING (
    id = auth.uid()
) WITH CHECK (
    id = auth.uid()
);


-- ============================================================================
-- PASSO 2: CORRIGIR POLÍTICAS PARA tbl_usuarios (QUEBRAR RECURSÃO)
-- ============================================================================

-- Habilitar RLS (caso não esteja)
ALTER TABLE public.tbl_usuarios ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas que possam causar conflito
DROP POLICY IF EXISTS "usuarios_self_access_policy" ON public.tbl_usuarios;
DROP POLICY IF EXISTS "admin_can_manage_their_users" ON public.tbl_usuarios;

-- NOVA POLÍTICA (GERAL): Permite que um usuário veja/edite seu próprio registro.
-- Também permite que um admin (de tbl_clientes) gerencie os usuários (funcionários) a ele associados.
CREATE POLICY "usuarios_access_policy" ON public.tbl_usuarios
FOR ALL USING (
    id = auth.uid() -- O usuário é ele mesmo
    OR EXISTS ( -- O usuário é o admin que gerencia o registro em tbl_usuarios
        SELECT 1 FROM public.admin_usuarios au
        WHERE au.admin_id = auth.uid() AND au.id = public.tbl_usuarios.id
    )
) WITH CHECK (
    id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.admin_usuarios au
        WHERE au.admin_id = auth.uid() AND au.id = public.tbl_usuarios.id
    )
);


-- ============================================================================
-- PASSO 3: CORRIGIR POLÍTICAS PARA admin_usuarios (CONSISTÊNCIA)
-- ============================================================================

-- Habilitar RLS (caso não esteja)
ALTER TABLE public.admin_usuarios ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas
DROP POLICY IF EXISTS "admin_usuarios_access_policy" ON public.admin_usuarios;

-- NOVA POLÍTICA: Um usuário pode ver/mudar seu próprio vínculo. Um admin pode gerenciar os vínculos de seus funcionários.
CREATE POLICY "admin_usuarios_access_policy" ON public.admin_usuarios
FOR ALL USING (
  id = auth.uid() 
  OR admin_id = auth.uid()
)
WITH CHECK (
  id = auth.uid() 
  OR admin_id = auth.uid()
);


-- ============================================================================
-- PASSO 4: CORRIGIR POLÍTICAS PARA TABELAS DE DADOS (PADRÃO MULTI-TENANT)
-- ============================================================================

-- NOVA Função auxiliar para obter o ID do admin principal para o usuário logado.
-- Se o usuário for um funcionário, retorna o ID do seu chefe.
-- Se não for (for o próprio admin), retorna seu próprio ID.
CREATE OR REPLACE FUNCTION public.get_my_admin_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  admin_uuid uuid;
BEGIN
  SELECT admin_id INTO admin_uuid
  FROM public.admin_usuarios
  WHERE id = auth.uid()
  LIMIT 1;

  IF admin_uuid IS NULL THEN
    RETURN auth.uid();
  END IF;

  RETURN admin_uuid;
END;
$$;

-- Garante permissão de execução para a função
GRANT EXECUTE ON FUNCTION public.get_my_admin_id() TO authenticated;

-- Tabela: plano_contas
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plano_contas_access_policy" ON public.plano_contas;
DROP POLICY IF EXISTS "plano_contas_select_policy" ON public.plano_contas;
DROP POLICY IF EXISTS "plano_contas_insert_policy" ON public.plano_contas;
DROP POLICY IF EXISTS "plano_contas_delete_policy" ON public.plano_contas;

CREATE POLICY "plano_contas_select_policy" ON public.plano_contas FOR SELECT USING (proprietario_id = public.get_my_admin_id());
CREATE POLICY "plano_contas_insert_policy" ON public.plano_contas FOR INSERT WITH CHECK (proprietario_id = public.get_my_admin_id());
CREATE POLICY "plano_contas_delete_policy" ON public.plano_contas FOR DELETE USING (proprietario_id = auth.uid()); -- Apenas o dono pode deletar

-- Tabela: saldo_contas
ALTER TABLE public.saldo_contas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saldo_contas_access_policy" ON public.saldo_contas;
DROP POLICY IF EXISTS "saldo_contas_select_policy" ON public.saldo_contas;
DROP POLICY IF EXISTS "saldo_contas_insert_policy" ON public.saldo_contas;
DROP POLICY IF EXISTS "saldo_contas_delete_policy" ON public.saldo_contas;

CREATE POLICY "saldo_contas_select_policy" ON public.saldo_contas FOR SELECT USING (proprietario_id = public.get_my_admin_id());
CREATE POLICY "saldo_contas_insert_policy" ON public.saldo_contas FOR INSERT WITH CHECK (proprietario_id = public.get_my_admin_id());
CREATE POLICY "saldo_contas_delete_policy" ON public.saldo_contas FOR DELETE USING (proprietario_id = auth.uid());

-- Tabela: lancamentos
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lancamentos_access_policy" ON public.lancamentos;
DROP POLICY IF EXISTS "lancamentos_select_policy" ON public.lancamentos;
DROP POLICY IF EXISTS "lancamentos_insert_policy" ON public.lancamentos;
DROP POLICY IF EXISTS "lancamentos_delete_policy" ON public.lancamentos;

CREATE POLICY "lancamentos_select_policy" ON public.lancamentos FOR SELECT USING (proprietario_id = public.get_my_admin_id());
CREATE POLICY "lancamentos_insert_policy" ON public.lancamentos FOR INSERT WITH CHECK (proprietario_id = public.get_my_admin_id());
CREATE POLICY "lancamentos_delete_policy" ON public.lancamentos FOR DELETE USING (proprietario_id = auth.uid());

-- Tabela: historicos
ALTER TABLE public.historicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "historicos_access_policy" ON public.historicos;
DROP POLICY IF EXISTS "historicos_select_policy" ON public.historicos;
DROP POLICY IF EXISTS "historicos_insert_policy" ON public.historicos;
DROP POLICY IF EXISTS "historicos_delete_policy" ON public.historicos;

CREATE POLICY "historicos_select_policy" ON public.historicos FOR SELECT USING (proprietario_id = public.get_my_admin_id());
CREATE POLICY "historicos_insert_policy" ON public.historicos FOR INSERT WITH CHECK (proprietario_id = public.get_my_admin_id());
CREATE POLICY "historicos_delete_policy" ON public.historicos FOR DELETE USING (proprietario_id = auth.uid());

-- Tabela: tickets
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tickets_access_policy" ON public.tickets;
DROP POLICY IF EXISTS "tickets_select_policy" ON public.tickets;
DROP POLICY IF EXISTS "tickets_insert_policy" ON public.tickets;
DROP POLICY IF EXISTS "tickets_delete_policy" ON public.tickets;

CREATE POLICY "tickets_select_policy" ON public.tickets FOR SELECT USING (proprietario_id = public.get_my_admin_id());
CREATE POLICY "tickets_insert_policy" ON public.tickets FOR INSERT WITH CHECK (proprietario_id = public.get_my_admin_id());
CREATE POLICY "tickets_delete_policy" ON public.tickets FOR DELETE USING (proprietario_id = auth.uid());


-- ============================================================================
-- PASSO 5: CORRIGIR POLÍTICAS PARA clientes (A TABELA DE CR)
-- ============================================================================

-- Habilitar RLS (caso não esteja)
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas que possam causar conflito
DROP POLICY IF EXISTS "Empresas podem gerenciar seus próprios clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admin select own clients" ON public.clientes;
DROP POLICY IF EXISTS "Admin insert own clients" ON public.clientes;
DROP POLICY IF EXISTS "Admin update own clients" ON public.clientes;
DROP POLICY IF EXISTS "Admin delete own clients" ON public.clientes;
DROP POLICY IF EXISTS "Admins podem ver todos os clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admin employees read admin clients" ON public.clientes;

-- NOVAS POLÍTICAS GRANULARES
DROP POLICY IF EXISTS "clientes_cr_access_policy" ON public.clientes;
DROP POLICY IF EXISTS "clientes_select_policy" ON public.clientes;
DROP POLICY IF EXISTS "clientes_insert_policy" ON public.clientes;
DROP POLICY IF EXISTS "clientes_update_policy" ON public.clientes;
DROP POLICY IF EXISTS "clientes_delete_policy" ON public.clientes;

CREATE POLICY "clientes_select_policy" ON public.clientes FOR SELECT USING (proprietario_id = public.get_my_admin_id());
CREATE POLICY "clientes_insert_policy" ON public.clientes FOR INSERT WITH CHECK (proprietario_id = public.get_my_admin_id());
CREATE POLICY "clientes_update_policy" ON public.clientes FOR UPDATE USING (proprietario_id = public.get_my_admin_id());
CREATE POLICY "clientes_delete_policy" ON public.clientes FOR DELETE USING (proprietario_id = auth.uid()); -- Apenas o dono pode deletar

-- ============================================================================
-- PASSO 6: VERIFICAR SE AS POLÍTICAS FORAM CRIADAS CORRETAMENTE
-- ============================================================================

SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies 
WHERE schemaname = 'public'
  AND tablename IN (
    'tbl_clientes', 
    'tbl_usuarios',
    'clientes',
    'admin_usuarios',
    'plano_contas', 
    'saldo_contas', 
    'lancamentos', 
    'historicos', 
    'tickets'
  )
ORDER BY tablename, policyname;
