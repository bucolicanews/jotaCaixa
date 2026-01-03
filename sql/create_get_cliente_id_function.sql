
CREATE OR REPLACE FUNCTION public.get_cliente_id()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT cliente_id FROM public.client_user_lookup WHERE user_id = auth.uid();
$$;
