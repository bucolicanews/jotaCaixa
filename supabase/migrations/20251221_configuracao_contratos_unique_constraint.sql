/* -- Garante que exista restrição única para permitir upsert por proprietario_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'configuracao_contratos_proprietario_unique'
  ) THEN
    ALTER TABLE IF EXISTS public.configuracao_contratos
      ADD CONSTRAINT configuracao_contratos_proprietario_unique UNIQUE (proprietario_id);
  END IF;
END $$; */
