-- Script para criar lançamentos contábeis retroativos dos 4 recebimentos sem lançamentos
-- Data: 2026-01-28
-- Objetivo: Corrigir recebimentos manuais via PagBank que não geraram lançamentos

-- VARIÁVEIS JÁ PREENCHIDAS:
DO $$
DECLARE
  v_proprietario_id UUID := '0561e0b6-6a03-412f-bf42-66a420bd4523';
  v_conta_pagbank UUID := '14ff496e-7640-4f56-a2a8-f0b048244026';
  v_conta_taxa UUID := '937b595c-e598-4c9a-b016-42b1c9c9926c';
  v_conta_patrimonial UUID := '692f5639-1923-4049-ae28-862dd3803c95';
BEGIN
  
  -- ============================================================
  -- Recebimento 1: R$ 1,00 (ID: 3613d232-92c6-4fd2-bdb2-17de26623524)
  -- Forma: PagBank | Taxa: R$ 0,01 | Líquido: R$ 0,99
  -- ============================================================
  
  -- DÉBITO: Conta PagBank (R$ 0,99)
  INSERT INTO lancamentos (
    id,
    proprietario_id,
    data_movimentacao,
    descricao,
    valor,
    tipo,
    conta_contabil_id,
    origem,
    conta_resultado_id
  ) VALUES (
    gen_random_uuid(),
    v_proprietario_id,
    '2026-01-18T00:00:00Z',
    'Recebimento PagBank (Correção Retroativa) - R$ 1,00',
    0.99,
    'Entrada',
    v_conta_pagbank,
    'correcao_retroativa',
    NULL
  );
  
  -- DÉBITO: Taxa PagBank (R$ 0,01)
  INSERT INTO lancamentos (
    id,
    proprietario_id,
    data_movimentacao,
    descricao,
    valor,
    tipo,
    conta_contabil_id,
    origem,
    conta_resultado_id
  ) VALUES (
    gen_random_uuid(),
    v_proprietario_id,
    '2026-01-18T00:00:00Z',
    'Taxa PagBank (Correção Retroativa) - R$ 1,00',
    0.01,
    'Entrada',
    v_conta_taxa,
    'correcao_retroativa',
    NULL
  );
  
  -- CRÉDITO: Clientes a Receber (R$ 1,00)
  INSERT INTO lancamentos (
    id,
    proprietario_id,
    data_movimentacao,
    descricao,
    valor,
    tipo,
    conta_contabil_id,
    origem,
    conta_resultado_id
  ) VALUES (
    gen_random_uuid(),
    v_proprietario_id,
    '2026-01-18T00:00:00Z',
    'Baixa Direito CR (Correção Retroativa) - R$ 1,00',
    1.00,
    'Saida',
    v_conta_patrimonial,
    'correcao_retroativa',
    NULL
  );
  
  -- ============================================================
  -- Recebimento 2: R$ 1,00 (ID: fbfbbcf8-c12d-488f-9022-886998342513)
  -- Forma: Pix (manual) | Taxa: R$ 0,00 | Líquido: R$ 1,00
  -- ============================================================
  
  -- DÉBITO: Conta PagBank (R$ 1,00)
  INSERT INTO lancamentos (
    id,
    proprietario_id,
    data_movimentacao,
    descricao,
    valor,
    tipo,
    conta_contabil_id,
    origem,
    conta_resultado_id
  ) VALUES (
    gen_random_uuid(),
    v_proprietario_id,
    '2026-01-18T00:00:00Z',
    'Recebimento Manual Pix (Correção Retroativa) - R$ 1,00',
    1.00,
    'Entrada',
    v_conta_pagbank,
    'correcao_retroativa',
    NULL
  );
  
  -- CRÉDITO: Clientes a Receber (R$ 1,00) - Sem taxa
  INSERT INTO lancamentos (
    id,
    proprietario_id,
    data_movimentacao,
    descricao,
    valor,
    tipo,
    conta_contabil_id,
    origem,
    conta_resultado_id
  ) VALUES (
    gen_random_uuid(),
    v_proprietario_id,
    '2026-01-18T00:00:00Z',
    'Baixa Direito CR (Correção Retroativa) - R$ 1,00',
    1.00,
    'Saida',
    v_conta_patrimonial,
    'correcao_retroativa',
    NULL
  );
  
  -- ============================================================
  -- Recebimento 3: R$ 2,00 (ID: 8bad3738-837c-4ad1-9777-075e805cb492)
  -- Forma: PagBank (Baixa Manual) | Taxa: R$ 0,00 | Líquido: R$ 2,00
  -- ============================================================
  
  -- DÉBITO: Conta PagBank (R$ 2,00)
  INSERT INTO lancamentos (
    id,
    proprietario_id,
    data_movimentacao,
    descricao,
    valor,
    tipo,
    conta_contabil_id,
    origem,
    conta_resultado_id
  ) VALUES (
    gen_random_uuid(),
    v_proprietario_id,
    '2026-01-18T00:00:00Z',
    'Recebimento PagBank Baixa Manual (Correção Retroativa) - R$ 2,00',
    2.00,
    'Entrada',
    v_conta_pagbank,
    'correcao_retroativa',
    NULL
  );
  
  -- CRÉDITO: Clientes a Receber (R$ 2,00) - Sem taxa
  INSERT INTO lancamentos (
    id,
    proprietario_id,
    data_movimentacao,
    descricao,
    valor,
    tipo,
    conta_contabil_id,
    origem,
    conta_resultado_id
  ) VALUES (
    gen_random_uuid(),
    v_proprietario_id,
    '2026-01-18T00:00:00Z',
    'Baixa Direito CR (Correção Retroativa) - R$ 2,00',
    2.00,
    'Saida',
    v_conta_patrimonial,
    'correcao_retroativa',
    NULL
  );
  
  -- ============================================================
  -- Recebimento 4: R$ 2,00 (ID: c1f1edad-f2af-4868-9b5c-747a46adf545)
  -- Forma: Pix (manual) | Taxa: R$ 0,00 | Líquido: R$ 2,00
  -- ============================================================
  
  -- DÉBITO: Conta PagBank (R$ 2,00)
  INSERT INTO lancamentos (
    id,
    proprietario_id,
    data_movimentacao,
    descricao,
    valor,
    tipo,
    conta_contabil_id,
    origem,
    conta_resultado_id
  ) VALUES (
    gen_random_uuid(),
    v_proprietario_id,
    '2026-01-18T00:00:00Z',
    'Recebimento Manual Pix (Correção Retroativa) - R$ 2,00',
    2.00,
    'Entrada',
    v_conta_pagbank,
    'correcao_retroativa',
    NULL
  );
  
  -- CRÉDITO: Clientes a Receber (R$ 2,00) - Sem taxa
  INSERT INTO lancamentos (
    id,
    proprietario_id,
    data_movimentacao,
    descricao,
    valor,
    tipo,
    conta_contabil_id,
    origem,
    conta_resultado_id
  ) VALUES (
    gen_random_uuid(),
    v_proprietario_id,
    '2026-01-18T00:00:00Z',
    'Baixa Direito CR (Correção Retroativa) - R$ 2,00',
    2.00,
    'Saida',
    v_conta_patrimonial,
    'correcao_retroativa',
    NULL
  );
  
  RAISE NOTICE 'Lançamentos retroativos criados com sucesso! Total: 9 lançamentos (7 débitos + 2 créditos = 9 operações)';
END $$;

-- ============================================================
-- PASSO 2: Verificar se os lançamentos foram criados
-- ============================================================
SELECT 
  l.id,
  l.data_movimentacao,
  l.descricao,
  l.valor,
  l.tipo,
  pc."Conta" as conta_contabil,
  pc."Descricao" as desc_conta
FROM lancamentos l
LEFT JOIN plano_contas pc ON pc.id = l.conta_contabil_id
WHERE l.origem = 'correcao_retroativa'
ORDER BY l.descricao, l.tipo DESC;

-- ============================================================
-- PASSO 3: Validar balanço patrimonial
-- ============================================================
SELECT 
  SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE 0 END) as total_debitos,
  SUM(CASE WHEN tipo = 'Saida' THEN valor ELSE 0 END) as total_creditos,
  SUM(CASE WHEN tipo = 'Entrada' THEN valor ELSE -valor END) as diferenca
FROM lancamentos
WHERE proprietario_id = '0561e0b6-6a03-412f-bf42-66a420bd4523';

-- ============================================================
-- RESUMO DOS LANÇAMENTOS CRIADOS:
-- ============================================================
-- Recebimento 1 (R$ 1,00): 3 lançamentos (PagBank R$ 0,99 + Taxa R$ 0,01 + Baixa R$ 1,00)
-- Recebimento 2 (R$ 1,00): 2 lançamentos (PagBank R$ 1,00 + Baixa R$ 1,00)
-- Recebimento 3 (R$ 2,00): 2 lançamentos (PagBank R$ 2,00 + Baixa R$ 2,00)
-- Recebimento 4 (R$ 2,00): 2 lançamentos (PagBank R$ 2,00 + Baixa R$ 2,00)
-- 
-- TOTAL DÉBITOS: R$ 6,00 (0,99 + 0,01 + 1,00 + 2,00 + 2,00)
-- TOTAL CRÉDITOS: R$ 6,00 (1,00 + 1,00 + 2,00 + 2,00)
-- DIFERENÇA: R$ 0,00 ✅ (Balanço equilibrado!)
-- ============================================================
