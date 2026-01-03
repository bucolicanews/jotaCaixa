
CREATE TABLE public.client_user_lookup (
    user_id uuid NOT NULL,
    cliente_id bigint NOT NULL
);

ALTER TABLE public.client_user_lookup ENABLE ROW LEVEL SECURITY;

ALTER TABLE ONLY public.client_user_lookup
    ADD CONSTRAINT client_user_lookup_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.client_user_lookup
    ADD CONSTRAINT client_user_lookup_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.tbl_clientes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_user_lookup
    ADD CONSTRAINT client_user_lookup_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- No RLS on this table, it's for internal lookup only
ALTER TABLE public.client_user_lookup DISABLE ROW LEVEL SECURITY;
