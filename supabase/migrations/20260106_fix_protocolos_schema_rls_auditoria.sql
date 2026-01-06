-- ==========================================
-- CORRIGIR SCHEMA, RLS E ADICIONAR AUDITORIA
-- ==========================================

-- 1. REMOVER POLÍTICAS ANTIGAS (PERMISSIVAS E INCORRETAS)
DROP POLICY IF EXISTS "Enable ALL for users based on admin_id" ON public.protocolos;
DROP POLICY IF EXISTS "Public read access for specific protocol" ON public.protocolos;
DROP POLICY IF EXISTS "Users can see their own company protocols" ON public.protocolos;

-- 2. REMOVER POLÍTICA DO PROTOCOLO_FILES SE EXISTIR
DROP POLICY IF EXISTS "Enable ALL for users based on protocol admin_id" ON public.protocolo_files;

-- 3. REMOVER TABELA protocolo_files (redundante, usar jsonb anexos)
DROP TABLE IF EXISTS public.protocolo_files;

-- 4. GARANTIR QUE admin_id EXISTE E está correto (NOT NULL)
ALTER TABLE public.protocolos
ADD COLUMN IF NOT EXISTS admin_id uuid NOT NULL DEFAULT (auth.uid());

-- 5. ADICIONAR COLUNA criado_por PARA AUDITORIA
ALTER TABLE public.protocolos
ADD COLUMN IF NOT EXISTS criado_por uuid NOT NULL DEFAULT auth.uid();

-- 6. REMOVER COLUNAS INÚTEIS/CONFLITANTES
ALTER TABLE public.protocolos
DROP COLUMN IF EXISTS titulo,
DROP COLUMN IF EXISTS descrição,
DROP COLUMN IF EXISTS url_img_protocolo,
DROP COLUMN IF EXISTS id_proprietario,
DROP COLUMN IF EXISTS id_cliente;

-- 7. HABILITAR RLS
ALTER TABLE public.protocolos ENABLE ROW LEVEL SECURITY;

-- 8. CRIAR POLÍTICA DE RLS CORRETA
CREATE POLICY "protocolos_admin_full_access" ON public.protocolos
AS PERMISSIVE FOR ALL
TO authenticated
USING (
  admin_id = auth.uid()
  OR admin_id IN (
    SELECT admin_usuarios.admin_id
    FROM admin_usuarios
    WHERE admin_usuarios.id = auth.uid()
  )
)
WITH CHECK (
  admin_id = auth.uid()
  OR admin_id IN (
    SELECT admin_usuarios.admin_id
    FROM admin_usuarios
    WHERE admin_usuarios.id = auth.uid()
  )
);

-- 9. COMENTÁRIO NAS COLUNAS
COMMENT ON COLUMN public.protocolos.admin_id IS 'UUID do admin proprietário (tbl_admins.id)';
COMMENT ON COLUMN public.protocolos.criado_por IS 'UUID do usuário que criou (auth.uid() na inserção)';

-- 10. ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_protocolos_admin_id ON public.protocolos(admin_id);
CREATE INDEX IF NOT EXISTS idx_protocolos_cliente_id ON public.protocolos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_protocolos_criado_por ON public.protocolos(criado_por);
CREATE INDEX IF NOT EXISTS idx_protocolos_created_at ON public.protocolos(created_at DESC);

-- 11. GARANTIR QUE cliente_id REFERENCIA tbl_clientes
ALTER TABLE public.protocolos
ADD CONSTRAINT IF NOT EXISTS protocolos_cliente_id_fkey
FOREIGN KEY (cliente_id)
REFERENCES public.tbl_clientes(id)
ON DELETE SET NULL;
