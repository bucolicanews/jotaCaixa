-- Funções centralizadas para Setup/Reset contábil

CREATE OR REPLACE FUNCTION public.contabil_setup_defaults(p_proprietario_id uuid)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_import record;
  v_map record;
BEGIN
  SELECT * INTO v_import FROM public.import_default_tables(p_proprietario_id) LIMIT 1;
  IF v_import.success IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT FALSE, COALESCE(v_import.message, 'Falha ao importar tabelas padrão.');
    RETURN;
  END IF;

  SELECT * INTO v_map FROM public.map_default_configs(p_proprietario_id) LIMIT 1;
  IF v_map.success IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT FALSE, COALESCE(v_map.message, 'Falha ao mapear configs padrão.');
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, 'Setup contábil padrão executado com sucesso.';
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM::text;
END;
$function$;

