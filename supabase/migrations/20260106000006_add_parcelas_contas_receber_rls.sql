-- Add RLS policies to parcelas_contas_receber table
-- Cliente can access installments of their own receivables

-- Enable RLS
ALTER TABLE public.parcelas_contas_receber ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Allow if you own the parent conta_receber (via cliente_id)
CREATE POLICY "parcelas_contas_receber_select_policy" ON public.parcelas_contas_receber
FOR SELECT
USING (
  conta_receber_id IN (
    SELECT id FROM public.contas_receber 
    WHERE cliente_id = auth.uid()
    OR cliente_id IN (
      SELECT cliente_id FROM public.client_user_lookup 
      WHERE user_id = auth.uid()
    )
  )
);

-- INSERT policy: Allow if you own the parent conta_receber
CREATE POLICY "parcelas_contas_receber_insert_policy" ON public.parcelas_contas_receber
FOR INSERT
WITH CHECK (
  conta_receber_id IN (
    SELECT id FROM public.contas_receber 
    WHERE cliente_id = auth.uid()
    OR cliente_id IN (
      SELECT cliente_id FROM public.client_user_lookup 
      WHERE user_id = auth.uid()
    )
  )
);

-- UPDATE policy: Allow if you own the parent conta_receber
CREATE POLICY "parcelas_contas_receber_update_policy" ON public.parcelas_contas_receber
FOR UPDATE
WITH CHECK (
  conta_receber_id IN (
    SELECT id FROM public.contas_receber 
    WHERE cliente_id = auth.uid()
    OR cliente_id IN (
      SELECT cliente_id FROM public.client_user_lookup 
      WHERE user_id = auth.uid()
    )
  )
);

-- DELETE policy: Allow if you own the parent conta_receber
CREATE POLICY "parcelas_contas_receber_delete_policy" ON public.parcelas_contas_receber
FOR DELETE
USING (
  conta_receber_id IN (
    SELECT id FROM public.contas_receber 
    WHERE cliente_id = auth.uid()
    OR cliente_id IN (
      SELECT cliente_id FROM public.client_user_lookup 
      WHERE user_id = auth.uid()
    )
  )
);
