-- Add RLS policies to parcelas_contas_pagar table
-- Clients can manage installments of their own payables

-- Enable RLS
ALTER TABLE public.parcelas_contas_pagar ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Allow if you own the parent conta_pagar
CREATE POLICY "parcelas_contas_pagar_select_policy" ON public.parcelas_contas_pagar
FOR SELECT
USING (
  conta_pagar_id IN (
    SELECT id FROM public.contas_pagar 
    WHERE empresa_id = auth.uid()
    OR empresa_id IN (
      SELECT cliente_id FROM public.client_user_lookup 
      WHERE user_id = auth.uid()
    )
  )
);

-- INSERT policy: Allow if you own the parent conta_pagar
CREATE POLICY "parcelas_contas_pagar_insert_policy" ON public.parcelas_contas_pagar
FOR INSERT
WITH CHECK (
  conta_pagar_id IN (
    SELECT id FROM public.contas_pagar 
    WHERE empresa_id = auth.uid()
    OR empresa_id IN (
      SELECT cliente_id FROM public.client_user_lookup 
      WHERE user_id = auth.uid()
    )
  )
);

-- UPDATE policy: Allow if you own the parent conta_pagar
CREATE POLICY "parcelas_contas_pagar_update_policy" ON public.parcelas_contas_pagar
FOR UPDATE
WITH CHECK (
  conta_pagar_id IN (
    SELECT id FROM public.contas_pagar 
    WHERE empresa_id = auth.uid()
    OR empresa_id IN (
      SELECT cliente_id FROM public.client_user_lookup 
      WHERE user_id = auth.uid()
    )
  )
);

-- DELETE policy: Allow if you own the parent conta_pagar
CREATE POLICY "parcelas_contas_pagar_delete_policy" ON public.parcelas_contas_pagar
FOR DELETE
USING (
  conta_pagar_id IN (
    SELECT id FROM public.contas_pagar 
    WHERE empresa_id = auth.uid()
    OR empresa_id IN (
      SELECT cliente_id FROM public.client_user_lookup 
      WHERE user_id = auth.uid()
    )
  )
);
