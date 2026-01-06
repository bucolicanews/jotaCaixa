-- Add RLS policies to contas_pagar table
-- Clients can manage their own payables

-- Enable RLS
ALTER TABLE public.contas_pagar ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Allow if you're the empresa_id owner or assigned to that empresa
CREATE POLICY "contas_pagar_select_policy" ON public.contas_pagar
FOR SELECT
USING (
  empresa_id = auth.uid()
  OR empresa_id IN (
    SELECT cliente_id FROM public.client_user_lookup 
    WHERE user_id = auth.uid()
  )
);

-- INSERT policy: Allow if you're the empresa_id owner or assigned to that empresa
CREATE POLICY "contas_pagar_insert_policy" ON public.contas_pagar
FOR INSERT
WITH CHECK (
  empresa_id = auth.uid()
  OR empresa_id IN (
    SELECT cliente_id FROM public.client_user_lookup 
    WHERE user_id = auth.uid()
  )
);

-- UPDATE policy: Allow if you're the empresa_id owner or assigned to that empresa
CREATE POLICY "contas_pagar_update_policy" ON public.contas_pagar
FOR UPDATE
WITH CHECK (
  empresa_id = auth.uid()
  OR empresa_id IN (
    SELECT cliente_id FROM public.client_user_lookup 
    WHERE user_id = auth.uid()
  )
);

-- DELETE policy: Allow if you're the empresa_id owner or assigned to that empresa
CREATE POLICY "contas_pagar_delete_policy" ON public.contas_pagar
FOR DELETE
USING (
  empresa_id = auth.uid()
  OR empresa_id IN (
    SELECT cliente_id FROM public.client_user_lookup 
    WHERE user_id = auth.uid()
  )
);
