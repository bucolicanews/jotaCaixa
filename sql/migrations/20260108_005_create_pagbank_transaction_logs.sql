-- Migration: Criar tabela de logs de transações PagBank
-- Data: 2026-01-08
-- Descrição: Auditoria e troubleshooting de todas as interações com a API do PagBank

CREATE TABLE IF NOT EXISTS public.pagbank_transaction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proprietario_id UUID NOT NULL,
    transaction_type TEXT CHECK (transaction_type IN ('payment', 'transfer', 'webhook', 'sync')),
    pagbank_id TEXT,
    reference_id TEXT,
    status TEXT,
    amount NUMERIC(10,2),
    request_payload JSONB,
    response_payload JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para melhorar performance de consultas
CREATE INDEX IF NOT EXISTS idx_pagbank_logs_proprietario_id 
ON public.pagbank_transaction_logs(proprietario_id);

CREATE INDEX IF NOT EXISTS idx_pagbank_logs_transaction_type 
ON public.pagbank_transaction_logs(transaction_type);

CREATE INDEX IF NOT EXISTS idx_pagbank_logs_pagbank_id 
ON public.pagbank_transaction_logs(pagbank_id) 
WHERE pagbank_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagbank_logs_reference_id 
ON public.pagbank_transaction_logs(reference_id) 
WHERE reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagbank_logs_created_at 
ON public.pagbank_transaction_logs(created_at DESC);

-- RLS
ALTER TABLE public.pagbank_transaction_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin visualiza próprios logs PagBank"
ON public.pagbank_transaction_logs
FOR SELECT
USING (proprietario_id = auth.uid());

-- Política para Edge Functions (SECURITY DEFINER) poderem inserir logs
CREATE POLICY "Edge Functions podem inserir logs PagBank"
ON public.pagbank_transaction_logs
FOR INSERT
WITH CHECK (true);

-- Comentários
COMMENT ON TABLE public.pagbank_transaction_logs IS 'Logs de auditoria de todas as transações com a API do PagBank';
COMMENT ON COLUMN public.pagbank_transaction_logs.transaction_type IS 'Tipo de transação: payment (cobrança), transfer (transferência), webhook (notificação), sync (sincronização)';
COMMENT ON COLUMN public.pagbank_transaction_logs.pagbank_id IS 'ID da cobrança ou transferência no PagBank';
COMMENT ON COLUMN public.pagbank_transaction_logs.reference_id IS 'ID de referência interno (ex: PARCELA_{uuid})';
COMMENT ON COLUMN public.pagbank_transaction_logs.status IS 'Status da transação no momento do log';
COMMENT ON COLUMN public.pagbank_transaction_logs.amount IS 'Valor da transação em reais';
COMMENT ON COLUMN public.pagbank_transaction_logs.request_payload IS 'Payload enviado para a API do PagBank (JSON)';
COMMENT ON COLUMN public.pagbank_transaction_logs.response_payload IS 'Resposta recebida da API do PagBank (JSON)';
COMMENT ON COLUMN public.pagbank_transaction_logs.error_message IS 'Mensagem de erro caso a transação tenha falhado';
