-- Adiciona a coluna codigo_transacao à tabela de recebimentos para armazenar
-- identificadores de transações externas, como do PagBank, Stripe, etc.

ALTER TABLE public.recebimentos
ADD COLUMN codigo_transacao TEXT;

COMMENT ON COLUMN public.recebimentos.codigo_transacao IS 'Código da transação externa (ex: ID da transação do PagBank, Stripe, etc.) para referência e conciliação manual.';

-- Também é preciso garantir que a view do admin (se houver uma que não seja `select *`) inclua esta coluna.
-- Por segurança, vamos recriar a view admin_recebimentos para incluir a nova coluna.
-- Esta parte pode precisar de ajuste dependendo da definição exata da view existente.
-- Assumindo que a view admin_recebimentos é uma simples seleção com RLS.

-- Primeiro, vamos remover a política existente na view para poder alterá-la, se necessário.
-- DROP POLICY IF EXISTS "Admin full access" ON "public"."admin_recebimentos";

-- Recriando a view para garantir que a nova coluna esteja presente.
-- A definição exata da view pode variar. Uma abordagem simples:
-- CREATE OR REPLACE VIEW public.admin_recebimentos AS
-- SELECT * FROM public.recebimentos;

-- Reaplicando a política de segurança.
-- CREATE POLICY "Admin full access"
-- ON "public"."admin_recebimentos"
-- FOR ALL
-- TO authenticated
-- USING (is_admin(auth.uid()));
