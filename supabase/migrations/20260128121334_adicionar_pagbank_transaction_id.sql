-- Adicionar coluna para armazenar o código da transação do PagBank
ALTER TABLE admin_parcelas_receber 
ADD COLUMN IF NOT EXISTS pagbank_transaction_id TEXT;

-- Adicionar comentário explicativo
COMMENT ON COLUMN admin_parcelas_receber.pagbank_transaction_id IS 'Código da transação do PagBank (ex: 858BDE28-AB82-4599-9536-A1FCAF31C841)';
