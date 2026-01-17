# 🚀 Guia de Implantação - Automação de Baixa via PagBank

## 📋 Pré-requisitos

- Acesso ao projeto Supabase
- Supabase CLI instalado
- Credenciais PagBank (Sandbox e/ou Produção)

---

## 🔧 Passo 1: Aplicar Migrations no Banco de Dados

### Via Supabase Dashboard (Mais Fácil)

1. Acesse [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecione seu projeto
3. Vá em **SQL Editor**
4. Execute os seguintes scripts **na ordem**:

#### Script 1: Adicionar Campos de Rastreamento

```sql
-- Adicionar campos para rastreamento de webhook e fallback
ALTER TABLE admin_parcelas_receber
ADD COLUMN IF NOT EXISTS webhook_processed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS webhook_retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS webhook_last_error TEXT,
ADD COLUMN IF NOT EXISTS last_check_at TIMESTAMPTZ;

-- Comentários
COMMENT ON COLUMN admin_parcelas_receber.webhook_processed_at IS 'Data/hora em que o webhook do PagBank processou esta parcela com sucesso';
COMMENT ON COLUMN admin_parcelas_receber.webhook_retry_count IS 'Número de tentativas de processar webhook que falharam';
COMMENT ON COLUMN admin_parcelas_receber.webhook_last_error IS 'Último erro ao processar webhook (para debugging)';
COMMENT ON COLUMN admin_parcelas_receber.last_check_at IS 'Última vez que o cron job verificou esta parcela no PagBank';

-- Criar índice para consultas de fallback
CREATE INDEX IF NOT EXISTS idx_parcelas_pending_pagbank 
ON admin_parcelas_receber(status, pagbank_checkout_id) 
WHERE status IN ('pendente', 'aguardando') AND pagbank_checkout_id IS NOT NULL;

-- Criar índice para monitoramento
CREATE INDEX IF NOT EXISTS idx_parcelas_webhook_retry 
ON admin_parcelas_receber(webhook_retry_count) 
WHERE webhook_retry_count > 0;
```

#### Script 2: Criar Views de Monitoramento

```sql
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
```

### Via Supabase CLI (Alternativa)

```bash
# No diretório do projeto
npx supabase db push
```

---

## 🌐 Passo 2: Deploy das Edge Functions

### Via Supabase CLI

```bash
# Deploy da função de webhook (CRÍTICA)
npx supabase functions deploy pagbank-webhook

# Deploy da função de fallback
npx supabase functions deploy check-pending-payments

# Deploy das funções já existentes (se houver alterações)
npx supabase functions deploy create-pagbank-checkout
npx supabase functions deploy sync-pagbank-transactions
```

### Verificar se Deployou Corretamente

```bash
# Testar webhook
curl -X POST https://SEU_PROJETO_ID.supabase.co/functions/v1/pagbank-webhook \
  -H "Content-Type: application/json" \
  -d '{"reference_id":"TESTE","status":"WAITING"}'

# Testar fallback
curl -X POST https://SEU_PROJETO_ID.supabase.co/functions/v1/check-pending-payments \
  -H "Authorization: Bearer SEU_SERVICE_ROLE_KEY"
```

---

## ⚙️ Passo 3: Configurar Cron Job (Fallback Automático)

Execute no **SQL Editor** do Supabase:

```sql
-- Instalar extensão pg_cron (apenas se ainda não estiver instalada)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Configurar cron job para executar a cada 10 minutos
SELECT cron.schedule(
  'check-pending-pagbank-payments',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'SUBSTITUA_PELA_SUA_URL/functions/v1/check-pending-payments',
    headers := jsonb_build_object(
      'Authorization', 
      'Bearer SUBSTITUA_PELO_SERVICE_ROLE_KEY'
    )
  );
  $$
);

-- Verificar se o cron foi criado
SELECT * FROM cron.job WHERE jobname = 'check-pending-pagbank-payments';
```

**⚠️ IMPORTANTE:**
- Substitua `SUBSTITUA_PELA_SUA_URL` pela URL do seu projeto
- Substitua `SUBSTITUA_PELO_SERVICE_ROLE_KEY` pela Service Role Key (encontrada em **Project Settings → API**)

---

## 🔔 Passo 4: Configurar Webhook no PagBank

Siga as instruções detalhadas no arquivo `CONFIGURACAO_WEBHOOK_PAGBANK.md`

**Resumo Rápido:**

### Sandbox
1. Acesse: https://sandbox.pagseguro.uol.com.br/webhooks
2. Adicione: `https://SEU_PROJETO_ID.supabase.co/functions/v1/pagbank-webhook`
3. Eventos: `PAYMENT.PAID`, `ORDER.PAID`

### Produção
1. Acesse: https://minhaconta.pagseguro.uol.com.br/webhooks
2. Repita os mesmos passos

---

## ✅ Passo 5: Testes de Validação

### Teste 1: Webhook Direto

```bash
# Simular chamada do PagBank
curl -X POST https://SEU_PROJETO_ID.supabase.co/functions/v1/pagbank-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "reference_id": "PARCELA_ID_EXISTENTE",
    "status": "PAID",
    "id": "ORDE_TEST_123",
    "amount": {"value": 10000},
    "paid_at": "2026-01-17T12:00:00Z",
    "charges": [{"amount": {"fees": 500}}]
  }'
```

### Teste 2: Pagamento Real (Sandbox)

1. Criar conta a receber no sistema
2. Gerar checkout PagBank
3. Acessar o link de pagamento
4. Usar cartão de teste do PagBank
5. Aguardar até 30 segundos
6. Verificar se parcela mudou para "paga"

### Teste 3: Consultar Monitoramento

```sql
-- Ver status geral
SELECT * FROM v_pagbank_monitoring;

-- Ver últimos webhooks recebidos
SELECT * FROM pagbank_transaction_logs
WHERE transaction_type = 'webhook'
ORDER BY created_at DESC
LIMIT 10;

-- Ver divergências
SELECT * FROM v_pagbank_divergencias;
```

---

## 🔍 Passo 6: Monitoramento Pós-Deploy

### Primeiras 24 Horas

Execute a cada 2 horas:

```sql
SELECT * FROM v_pagbank_monitoring;
```

**O que observar:**
- `ultimo_webhook_recebido` deve atualizar quando houver pagamentos
- `divergencias_criticas` deve ser **0**
- `webhooks_falhando` deve ser **0**

### Logs de Edge Function

1. Acesse **Supabase Dashboard → Edge Functions → pagbank-webhook → Logs**
2. Procure por:
   - `✅ SUCESSO` - Processamento bem-sucedido
   - `❌ ERRO` - Falhas que precisam de atenção
   - `IDEMPOTÊNCIA` - Webhooks duplicados (normal)

### Verificação Manual de Parcela Específica

```sql
SELECT 
  id,
  status,
  pagbank_status,
  webhook_processed_at,
  webhook_retry_count,
  webhook_last_error,
  last_check_at
FROM admin_parcelas_receber
WHERE id = 'ID_DA_PARCELA';
```

---

## 🚨 Troubleshooting

### Problema: Migrations falharam

**Erro:** "relation admin_parcelas_receber does not exist"

**Solução:**
- Certifique-se de estar executando no banco correto
- Verifique se a tabela `admin_parcelas_receber` existe
- Execute `\dt admin_parcelas_receber` para confirmar

### Problema: Edge Function retorna 404

**Solução:**
```bash
# Verificar se deployou
npx supabase functions list

# Re-deployar
npx supabase functions deploy pagbank-webhook
```

### Problema: Cron job não executa

**Solução:**
```sql
-- Verificar se pg_cron está habilitado
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Se não estiver, habilitar
CREATE EXTENSION pg_cron;

-- Verificar se há erros
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'check-pending-pagbank-payments')
ORDER BY start_time DESC
LIMIT 5;
```

---

## 📊 Checklist de Deploy

Use este checklist para garantir que tudo foi feito:

- [ ] Migration 1 executada (campos de rastreamento)
- [ ] Migration 2 executada (views de monitoramento)
- [ ] Edge Function `pagbank-webhook` deployada
- [ ] Edge Function `check-pending-payments` deployada
- [ ] Edge Function `create-pagbank-checkout` atualizada
- [ ] Cron job configurado e ativo
- [ ] Webhook configurado no PagBank Sandbox
- [ ] Webhook configurado no PagBank Produção
- [ ] Teste de webhook direto executado com sucesso
- [ ] Teste de pagamento real (sandbox) executado com sucesso
- [ ] View `v_pagbank_monitoring` consultada sem divergências
- [ ] Logs de Edge Function verificados

---

## 📞 Suporte e Manutenção

### Comandos Úteis

```sql
-- Ver todas as parcelas que falharam no webhook
SELECT * FROM admin_parcelas_receber WHERE webhook_retry_count > 0;

-- Resetar contador de retry (se necessário)
UPDATE admin_parcelas_receber 
SET webhook_retry_count = 0, webhook_last_error = NULL
WHERE id = 'ID_DA_PARCELA';

-- Forçar re-processamento via fallback
UPDATE admin_parcelas_receber 
SET last_check_at = NULL
WHERE id = 'ID_DA_PARCELA';
```

### Desabilitar Temporariamente o Cron

```sql
-- Desabilitar
SELECT cron.unschedule('check-pending-pagbank-payments');

-- Re-habilitar
SELECT cron.schedule(
  'check-pending-pagbank-payments',
  '*/10 * * * *',
  $$ SELECT net.http_post(...) $$
);
```

---

**Data da última atualização:** 2026-01-17
