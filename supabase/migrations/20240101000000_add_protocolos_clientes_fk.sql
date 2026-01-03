ALTER TABLE public.protocolos
ADD CONSTRAINT protocolos_id_cliente_fkey
FOREIGN KEY (id_cliente)
REFERENCES public.tbl_clientes(id)
ON DELETE SET NULL;
