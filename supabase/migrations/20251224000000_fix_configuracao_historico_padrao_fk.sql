-- Ajusta a FK de proprietario_id para aceitar qualquer usuário (Admin/Cliente)
-- evitando falha ao aplicar defaults via RPC map_default_configs.

ALTER TABLE public.configuracao_historico_padrao
  DROP CONSTRAINT IF EXISTS configuracao_historico_padrao_proprietario_id_fkey;

ALTER TABLE public.configuracao_historico_padrao
  ADD CONSTRAINT configuracao_historico_padrao_proprietario_id_fkey
  FOREIGN KEY (proprietario_id)
  REFERENCES auth.users (id)
  ON DELETE CASCADE;

