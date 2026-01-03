
CREATE OR REPLACE FUNCTION public.sync_client_user_lookup()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF NEW.clientes_id IS NOT NULL THEN
            INSERT INTO public.client_user_lookup (user_id, cliente_id)
            VALUES (NEW.id, NEW.clientes_id)
            ON CONFLICT (user_id) DO UPDATE SET cliente_id = NEW.clientes_id;
        END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF NEW.clientes_id IS NOT NULL THEN
            INSERT INTO public.client_user_lookup (user_id, cliente_id)
            VALUES (NEW.id, NEW.clientes_id)
            ON CONFLICT (user_id) DO UPDATE SET cliente_id = NEW.clientes_id;
        ELSE
            DELETE FROM public.client_user_lookup WHERE user_id = NEW.id;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        DELETE FROM public.client_user_lookup WHERE user_id = OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sync_client_user_lookup_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.tbl_usuarios
FOR EACH ROW EXECUTE FUNCTION public.sync_client_user_lookup();
