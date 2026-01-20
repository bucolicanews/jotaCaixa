-- =====================================================
-- Migration: Add RLS policies to extratos table
-- Data: 2026-01-20
-- Descrição: Permitir AdminUsuario acessar extratos do seu Admin
-- =====================================================

-- 1. Habilitar RLS na tabela extratos
ALTER TABLE public.extratos ENABLE ROW LEVEL SECURITY;

-- 2. Remover políticas antigas (se existirem)
DROP POLICY IF EXISTS "extratos_select_policy" ON public.extratos;
DROP POLICY IF EXISTS "extratos_insert_policy" ON public.extratos;
DROP POLICY IF EXISTS "extratos_update_policy" ON public.extratos;
DROP POLICY IF EXISTS "extratos_delete_policy" ON public.extratos;

-- =====================================================
-- POLÍTICA: SELECT
-- =====================================================

CREATE POLICY "extratos_select_policy"
ON public.extratos
FOR SELECT
USING (
  -- Caso 1: Admin ou Cliente vê seus próprios extratos
  empresa_id = auth.uid()
  OR
  -- Caso 2: AdminUsuario vê extratos do seu Admin
  empresa_id IN (
    SELECT admin_id 
    FROM public.admin_usuarios 
    WHERE id = auth.uid()
  )
);

COMMENT ON POLICY "extratos_select_policy" ON public.extratos IS 
'Permite SELECT se:
  - empresa_id = auth.uid() (Admin ou Cliente vê próprios extratos)
  - empresa_id = admin_id do AdminUsuario (AdminUsuario vê extratos do Admin)';

-- =====================================================
-- POLÍTICA: INSERT
-- =====================================================

CREATE POLICY "extratos_insert_policy"
ON public.extratos
FOR INSERT
WITH CHECK (
  -- Admin ou Cliente inserindo seus próprios extratos
  empresa_id = auth.uid()
  OR
  -- AdminUsuario inserindo extratos do seu Admin
  empresa_id IN (
    SELECT admin_id 
    FROM public.admin_usuarios 
    WHERE id = auth.uid()
  )
);

COMMENT ON POLICY "extratos_insert_policy" ON public.extratos IS
'Permite INSERT se:
  - empresa_id = auth.uid() (Admin ou Cliente cria próprios extratos)
  - empresa_id = admin_id do AdminUsuario (AdminUsuario cria extratos do Admin)';

-- =====================================================
-- POLÍTICA: UPDATE
-- =====================================================

CREATE POLICY "extratos_update_policy"
ON public.extratos
FOR UPDATE
USING (
  -- Verifica se pode ler o registro
  empresa_id = auth.uid()
  OR empresa_id IN (
    SELECT admin_id 
    FROM public.admin_usuarios 
    WHERE id = auth.uid()
  )
)
WITH CHECK (
  -- Verifica se pode escrever após mudanças
  empresa_id = auth.uid()
  OR empresa_id IN (
    SELECT admin_id 
    FROM public.admin_usuarios 
    WHERE id = auth.uid()
  )
);

COMMENT ON POLICY "extratos_update_policy" ON public.extratos IS
'Permite UPDATE se:
  USING: Pode ler o registro (empresa_id = auth.uid() ou AdminUsuario)
  WITH CHECK: Pode escrever após mudanças (mesmo critério)';

-- =====================================================
-- POLÍTICA: DELETE
-- =====================================================

CREATE POLICY "extratos_delete_policy"
ON public.extratos
FOR DELETE
USING (
  -- Admin ou Cliente deletando seus próprios extratos
  empresa_id = auth.uid()
  OR
  -- AdminUsuario deletando extratos do seu Admin
  empresa_id IN (
    SELECT admin_id 
    FROM public.admin_usuarios 
    WHERE id = auth.uid()
  )
);

COMMENT ON POLICY "extratos_delete_policy" ON public.extratos IS
'Permite DELETE se:
  - empresa_id = auth.uid() (Admin ou Cliente deleta próprios extratos)
  - empresa_id = admin_id do AdminUsuario (AdminUsuario deleta extratos do Admin)';

-- =====================================================
-- ÍNDICES DE PERFORMANCE (opcional, mas recomendado)
-- =====================================================

-- Índice para busca rápida por empresa_id (usado em todas as policies)
CREATE INDEX IF NOT EXISTS idx_extratos_empresa_id 
ON public.extratos(empresa_id);

COMMENT ON INDEX idx_extratos_empresa_id IS 
'Índice para otimizar queries RLS que verificam empresa_id.
Usado em: SELECT, INSERT, UPDATE, DELETE policies.';
