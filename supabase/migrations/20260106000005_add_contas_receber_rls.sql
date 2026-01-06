-- Add RLS policies to contas_receber table
-- contas_receber: Cliente (tbl_clientes) can access their own receivables
-- empresa_id = admin who created it (for visibility/audit)
-- cliente_id = actual client who owes

-- Enable RLS
ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Allow if you're the cliente_id owner OR assigned to that client
CREATE POLICY "contas_receber_select_policy" ON public.contas_receber
FOR SELECT
USING (
  cliente_id = auth.uid()
  OR cliente_id IN (
    SELECT cliente_id FROM public.client_user_lookup 
    WHERE user_id = auth.uid()
  )
);

-- INSERT policy: Allow if you're the cliente_id owner or assigned to that client
CREATE POLICY "contas_receber_insert_policy" ON public.contas_receber
FOR INSERT
WITH CHECK (
  cliente_id = auth.uid()
  OR cliente_id IN (
    SELECT cliente_id FROM public.client_user_lookup 
    WHERE user_id = auth.uid()
  )
);

-- UPDATE policy: Allow if you're the cliente_id owner or assigned to that client
CREATE POLICY "contas_receber_update_policy" ON public.contas_receber
FOR UPDATE
WITH CHECK (
  cliente_id = auth.uid()
  OR cliente_id IN (
    SELECT cliente_id FROM public.client_user_lookup 
    WHERE user_id = auth.uid()
  )
);

-- DELETE policy: Allow if you're the cliente_id owner or assigned to that client
CREATE POLICY "contas_receber_delete_policy" ON public.contas_receber
FOR DELETE
USING (
  cliente_id = auth.uid()
  OR cliente_id IN (
    SELECT cliente_id FROM public.client_user_lookup 
    WHERE user_id = auth.uid()
  )
);
