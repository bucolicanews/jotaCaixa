DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'recebimentos' AND column_name = 'anexo_url') THEN
    ALTER TABLE public.recebimentos ADD COLUMN anexo_url TEXT;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'admin_recebimentos' AND column_name = 'anexo_url') THEN
    ALTER TABLE public.admin_recebimentos ADD COLUMN anexo_url TEXT;
  END IF;
END;
$$;
