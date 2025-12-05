-- ============================================
-- SCRIPTS PARA CRIAR TABELAS DE DESCRIÇÕES E IDENTIFICADORES DE EXTRATO
-- ============================================

-- 1. TABELA PARA ADMIN: admin_descricao_extrato
CREATE TABLE IF NOT EXISTS public.admin_descricao_extrato (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    descricao text NOT NULL,
    status boolean DEFAULT true,
    ordem integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 2. TABELA PARA CLIENTE: descricao_extrato
CREATE TABLE IF NOT EXISTS public.descricao_extrato (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    descricao text NOT NULL,
    status boolean DEFAULT true,
    ordem integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 3. TABELA PARA ADMIN: admin_identificacao_extrato
CREATE TABLE IF NOT EXISTS public.admin_identificacao_extrato (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    descricao text NOT NULL,
    status boolean DEFAULT true,
    ordem integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 4. TABELA PARA CLIENTE: identificacao_extrato
CREATE TABLE IF NOT EXISTS public.identificacao_extrato (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    descricao text NOT NULL,
    status boolean DEFAULT true,
    ordem integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- ============================================
-- POLÍTICAS RLS (Row Level Security)
-- ============================================

-- Habilitar RLS nas tabelas
ALTER TABLE public.admin_descricao_extrato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.descricao_extrato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_identificacao_extrato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identificacao_extrato ENABLE ROW LEVEL SECURITY;

-- Políticas para admin_descricao_extrato
CREATE POLICY "admin_descricao_extrato_select" ON public.admin_descricao_extrato
    FOR SELECT USING (admin_id = auth.uid());
    
CREATE POLICY "admin_descricao_extrato_insert" ON public.admin_descricao_extrato
    FOR INSERT WITH CHECK (admin_id = auth.uid());
    
CREATE POLICY "admin_descricao_extrato_update" ON public.admin_descricao_extrato
    FOR UPDATE USING (admin_id = auth.uid());
    
CREATE POLICY "admin_descricao_extrato_delete" ON public.admin_descricao_extrato
    FOR DELETE USING (admin_id = auth.uid());

-- Políticas para descricao_extrato
CREATE POLICY "descricao_extrato_select" ON public.descricao_extrato
    FOR SELECT USING (empresa_id = auth.uid());
    
CREATE POLICY "descricao_extrato_insert" ON public.descricao_extrato
    FOR INSERT WITH CHECK (empresa_id = auth.uid());
    
CREATE POLICY "descricao_extrato_update" ON public.descricao_extrato
    FOR UPDATE USING (empresa_id = auth.uid());
    
CREATE POLICY "descricao_extrato_delete" ON public.descricao_extrato
    FOR DELETE USING (empresa_id = auth.uid());

-- Políticas para admin_identificacao_extrato
CREATE POLICY "admin_identificacao_extrato_select" ON public.admin_identificacao_extrato
    FOR SELECT USING (admin_id = auth.uid());
    
CREATE POLICY "admin_identificacao_extrato_insert" ON public.admin_identificacao_extrato
    FOR INSERT WITH CHECK (admin_id = auth.uid());
    
CREATE POLICY "admin_identificacao_extrato_update" ON public.admin_identificacao_extrato
    FOR UPDATE USING (admin_id = auth.uid());
    
CREATE POLICY "admin_identificacao_extrato_delete" ON public.admin_identificacao_extrato
    FOR DELETE USING (admin_id = auth.uid());

-- Políticas para identificacao_extrato
CREATE POLICY "identificacao_extrato_select" ON public.identificacao_extrato
    FOR SELECT USING (empresa_id = auth.uid());
    
CREATE POLICY "identificacao_extrato_insert" ON public.identificacao_extrato
    FOR INSERT WITH CHECK (empresa_id = auth.uid());
    
CREATE POLICY "identificacao_extrato_update" ON public.identificacao_extrato
    FOR UPDATE USING (empresa_id = auth.uid());
    
CREATE POLICY "identificacao_extrato_delete" ON public.identificacao_extrato
    FOR DELETE USING (empresa_id = auth.uid());

-- ============================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_admin_descricao_extrato_admin_id ON public.admin_descricao_extrato(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_descricao_extrato_ordem ON public.admin_descricao_extrato(ordem);

CREATE INDEX IF NOT EXISTS idx_descricao_extrato_empresa_id ON public.descricao_extrato(empresa_id);
CREATE INDEX IF NOT EXISTS idx_descricao_extrato_ordem ON public.descricao_extrato(ordem);

CREATE INDEX IF NOT EXISTS idx_admin_identificacao_extrato_admin_id ON public.admin_identificacao_extrato(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_identificacao_extrato_ordem ON public.admin_identificacao_extrato(ordem);

CREATE INDEX IF NOT EXISTS idx_identificacao_extrato_empresa_id ON public.identificacao_extrato(empresa_id);
CREATE INDEX IF NOT EXISTS idx_identificacao_extrato_ordem ON public.identificacao_extrato(ordem);
