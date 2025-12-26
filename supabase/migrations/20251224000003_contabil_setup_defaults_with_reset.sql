CREATE OR REPLACE FUNCTION public.contabil_setup_defaults(p_proprietario_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reset record;
  v_import record;
  v_map record;
BEGIN
  -- 1) Reset total
  SELECT * INTO v_reset FROM public.contabil_reset_all(p_proprietario_id) LIMIT 1;
  IF v_reset.success IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT FALSE, COALESCE(v_reset.message, 'Falha ao resetar antes do setup contábil.') AS message;
    RETURN;
  END IF;

  -- 2) Importa tabelas padrão
  SELECT * INTO v_import FROM public.import_default_tables(p_proprietario_id) LIMIT 1;
  IF v_import.success IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT FALSE, COALESCE(v_import.message, 'Falha ao importar tabelas padrão.') AS message;
    RETURN;
  END IF;

  -- 3) Mapeia configurações padrão
  SELECT * INTO v_map FROM public.map_default_configs(p_proprietario_id) LIMIT 1;
  IF v_map.success IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT FALSE, COALESCE(v_map.message, 'Falha ao mapear configs padrão.') AS message;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, 'Setup contábil padrão executado com sucesso.'::TEXT AS message;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, SQLERRM::text AS message;
END;
$function$;