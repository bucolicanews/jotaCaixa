-- Query para buscar os valores reais dos 4 recebimentos sem lançamentos

SELECT 
  r.id as recebimento_id,
  r.valor_recebido,
  r.forma_pagamento,
  r.data_recebimento,
  ap.valor_parcela as valor_bruto_parcela,
  ap.pagbank_charge_id,
  ap.pagbank_status,
  r.pagbank_taxa_valor as taxa,
  r.pagbank_valor_liquido as valor_liquido
FROM admin_recebimentos r
LEFT JOIN admin_parcelas_receber ap ON ap.id = r.parcela_id
WHERE r.id IN (
  'c1f1edad-f2af-4868-9b5c-747a46adf545',
  'fbfbbcf8-c12d-488f-9022-886998342513',
  '8bad3738-837c-4ad1-9777-075e805cb492',
  '3613d232-92c6-4fd2-bdb2-17de26623524'
)
ORDER BY r.data_recebimento, r.valor_recebido;
