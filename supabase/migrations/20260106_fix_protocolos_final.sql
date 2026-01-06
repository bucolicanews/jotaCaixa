-- ==========================================
-- CORREÇÃO FINAL DA TABELA PROTOCOLOS
-- ==========================================

-- 1. Remover constraints antigas
ALTER TABLE public.protocolos 
DROP CONSTRAINT IF EXISTS protocolos_cliente_id_fkey;

-- 2. Garantir que a coluna id é UUID com default
ALTER TABLE public.protocolos 
ALTER COLUMN id DROP IDENTITY IF EXISTS;

ALTER TABLE public.protocolos 
ALTER COLUMN id SET DATA TYPE uuid USING (gen_random_uuid());

ALTER TABLE public.protocolos 
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 3. Garantir que cliente_id é UUID
ALTER TABLE public.protocolos 
DROP COLUMN IF EXISTS cliente_id CASCADE;

ALTER TABLE public.protocolos 
ADD COLUMN cliente_id uuid NOT NULL;

-- 4. Garantir admin_id existe
ALTER TABLE public.protocolos 
DROP COLUMN IF EXISTS admin_id CASCADE;

ALTER TABLE public.protocolos 
ADD COLUMN admin_id uuid NOT NULL;

-- 5. Adicionar colunas de auditoria e dados
ALTER TABLE public.protocolos 
ADD COLUMN IF NOT EXISTS criado_por uuid NOT NULL DEFAULT auth.uid();

ALTER TABLE public.protocolos 
ADD COLUMN IF NOT EXISTS titulo text;

ALTER TABLE public.protocolos 
ADD COLUMN IF NOT EXISTS descricao text;

ALTER TABLE public.protocolos 
ADD COLUMN IF NOT EXISTS data_criacao timestamptz DEFAULT now();

ALTER TABLE public.protocolos 
ADD COLUMN IF NOT EXISTS data_impressao timestamptz;

ALTER TABLE public.protocolos 
ADD COLUMN IF NOT EXISTS usuario_criador_nome text;

ALTER TABLE public.protocolos 
ADD COLUMN IF NOT EXISTS anexos text[];

-- 6. Alterar status default
ALTER TABLE public.protocolos 
ALTER COLUMN status SET DEFAULT 'Criado';

-- 7. Recriar foreign keys
ALTER TABLE public.protocolos
ADD CONSTRAINT protocolos_cliente_id_fkey
FOREIGN KEY (cliente_id)
REFERENCES public.tbl_clientes(id)
ON DELETE CASCADE;

-- 8. Remover políticas antigas
DROP POLICY IF EXISTS "Enable ALL for users based on admin_id" ON public.protocolos;
DROP POLICY IF EXISTS "protocolos_admin_full_access" ON public.protocolos;

-- 9. Habilitar RLS
ALTER TABLE public.protocolos ENABLE ROW LEVEL SECURITY;

-- 10. Criar política de RLS correta
CREATE POLICY "protocolos_rls_policy" ON public.protocolos
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

-- 11. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_protocolos_admin_id ON public.protocolos(admin_id);
CREATE INDEX IF NOT EXISTS idx_protocolos_cliente_id ON public.protocolos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_protocolos_criado_por ON public.protocolos(criado_por);
CREATE INDEX IF NOT EXISTS idx_protocolos_status ON public.protocolos(status);
CREATE INDEX IF NOT EXISTS idx_protocolos_created_at ON public.protocolos(created_at DESC);

-- 12. Comentários
COMMENT ON COLUMN public.protocolos.id IS 'UUID do protocolo (gerado automaticamente)';
COMMENT ON COLUMN public.protocolos.admin_id IS 'UUID do admin proprietário';
COMMENT ON COLUMN public.protocolos.criado_por IS 'UUID do usuário que criou';
COMMENT ON COLUMN public.protocolos.cliente_id IS 'UUID do cliente (tbl_clientes.id)';
COMMENT ON COLUMN public.protocolos.anexos IS 'Array de URLs públicas dos arquivos anexados';
