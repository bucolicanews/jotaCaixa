-- Script para verificar e criar transações pendentes de mapeamento
-- Execute este SQL no Supabase Dashboard (SQL Editor)

-- 1. Verificar transações pendentes existentes
SELECT 
  id,
  data,
  descricao,
  identificacao,
  valor,
  tipo,
  status_mapeamento,
  empresa_id
FROM extratos
WHERE status_mapeamento = 'pendente_mapeamento'
ORDER BY data DESC
LIMIT 10;

-- 2. Se não houver nenhuma transação pendente, veja todas as transações
SELECT 
  id,
  data,
  descricao,
  identificacao,
  valor,
  tipo,
  status_mapeamento,
  empresa_id
FROM extratos
ORDER BY created_at DESC
LIMIT 10;

-- 3. Para CRIAR uma transação de teste pendente, execute:
-- IMPORTANTE: Substitua '0561e0b6-6a03-412f-bf42-66a420bd4523' pelo seu empresa_id
-- (você viu nos logs: OwnerId=0561e0b6-6a03-412f-bf42-66a420bd4523)

/*
INSERT INTO extratos (
  empresa_id,
  data,
  descricao,
  identificacao,
  valor,
  tipo,
  status_mapeamento,
  conciliado
) VALUES (
  '0561e0b6-6a03-412f-bf42-66a420bd4523',  -- Seu empresa_id
  CURRENT_DATE,
  'PIX RECEBIDO',
  'JOAO SILVA',
  1500.00,
  'Entrada',
  'pendente_mapeamento',
  false
);
*/

-- 4. OU atualizar uma transação existente para status pendente:
/*
UPDATE extratos
SET status_mapeamento = 'pendente_mapeamento'
WHERE id = 'COLE_AQUI_O_ID_DE_UMA_TRANSACAO'
  AND empresa_id = '0561e0b6-6a03-412f-bf42-66a420bd4523';
*/
