-- View para monitoramento de webhooks e integração PagBank
CREATE OR REPLACE VIEW v_pagbank_monitoring AS
SELECT 
  COUNT(*) FILTER (WHERE status IN ('pendente', 'aguardando') AND created_at < NOW() - INTERVAL '1 hour') as parcelas_pendentes_1h,
  COUNT(*) FILTER (WHERE status IN ('pendente', 'aguardando') AND created_at < NOW() - INTERVAL '24 hours') as parcelas_pendentes_24h,
  COUNT(*) FILTER (WHERE webhook_retry_count > 3) as webhooks_falhando,
  COUNT(*) FILTER (WHERE pagbank_status = 'PAID' AND status != 'paga') as divergencias_criticas,
  COUNT(*) FILTER (WHERE status = 'paga' AND webhook_processed_at IS NOT NULL AND webhook_processed_at > NOW() - INTERVAL '24 hours') as processados_webhook_24h,
  COUNT(*) FILTER (WHERE pagbank_checkout_id IS NOT NULL AND status IN ('pendente', 'aguardando')) as aguardando_pagamento,
  MAX(webhook_processed_at) as ultimo_webhook_recebido,
  MAX(last_check_at) as ultima_verificacao_fallback
FROM admin_parcelas_receber;

COMMENT ON VIEW v_pagbank_monitoring IS 'Métricas de monitoramento da integração com PagBank';

-- View para listar divergências que precisam de atenção
CREATE OR REPLACE VIEW v_pagbank_divergencias AS
SELECT 
  apr.id,
  apr.admin_id,
  apr.numero_parcela,
  apr.valor_parcela,
  apr.status as status_sistema,
  apr.pagbank_status as status_pagbank,
  apr.pagbank_checkout_id,
  apr.webhook_retry_count,
  apr.webhook_last_error,
  apr.created_at,
  apr.last_check_at,
  acr.descricao as conta_descricao,
  tc.nome as cliente_nome
FROM admin_parcelas_receber apr
LEFT JOIN admin_contas_receber acr ON apr.conta_receber_id = acr.id
LEFT JOIN tbl_clientes tc ON acr.cliente_id = tc.id
WHERE 
  (apr.pagbank_status = 'PAID' AND apr.status != 'paga')
  OR (apr.webhook_retry_count > 3)
  OR (apr.status IN ('pendente', 'aguardando') AND apr.created_at < NOW() - INTERVAL '48 hours' AND apr.pagbank_checkout_id IS NOT NULL)
ORDER BY apr.created_at DESC;

COMMENT ON VIEW v_pagbank_divergencias IS 'Lista parcelas com divergências entre PagBank e sistema que precisam de atenção manual';
