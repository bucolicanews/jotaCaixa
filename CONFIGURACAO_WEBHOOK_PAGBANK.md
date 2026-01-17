# 🔔 Configuração de Webhook PagBank - Guia Completo

## 📋 Visão Geral

Este guia detalha como configurar o webhook do PagBank para que o sistema receba automaticamente as notificações de pagamento e realize a baixa das parcelas.

---

## 🎯 URL do Webhook

A URL que o PagBank deve chamar é:

```
https://SEU_PROJETO_ID.supabase.co/functions/v1/pagbank-webhook
```

**Onde encontrar seu Project ID:**
1. Acesse o [Dashboard do Supabase](https://supabase.com/dashboard)
2. Selecione seu projeto
3. A URL estará visível no canto superior direito
4. Exemplo: `https://abcdefghijklmnop.supabase.co`

---

## 🔧 Configuração no Painel do PagBank

### Ambiente Sandbox (Homologação)

1. **Acessar o Painel Sandbox**
   - URL: https://sandbox.pagseguro.uol.com.br
   - Faça login com suas credenciais de teste

2. **Navegar até Configurações de Webhook**
   - Menu: **Integrações** → **Notificações** → **Webhooks**
   - OU: https://sandbox.pagseguro.uol.com.br/webhooks

3. **Adicionar Novo Webhook**
   - Clique em **"+ Novo Webhook"** ou **"Configurar Webhook"**
   - Cole a URL: `https://SEU_PROJETO_ID.supabase.co/functions/v1/pagbank-webhook`

4. **Selecionar Eventos**
   Marque os seguintes eventos:
   - ✅ `PAYMENT.AUTHORIZED` - Pagamento autorizado
   - ✅ `PAYMENT.PAID` - Pagamento confirmado/pago
   - ✅ `ORDER.PAID` - Pedido pago
   - ✅ `ORDER.COMPLETED` - Pedido completado

5. **Testar Conectividade**
   - Use o botão **"Testar URL"** no painel
   - O PagBank vai enviar uma requisição de teste
   - Deve retornar **200 OK**

6. **Salvar Configuração**

---

### Ambiente Produção

1. **Acessar o Painel de Produção**
   - URL: https://minhaconta.pagseguro.uol.com.br
   - Faça login com suas credenciais reais

2. **Repetir os Mesmos Passos**
   - Siga os passos 2-6 descritos acima para Sandbox
   - **ATENÇÃO:** Certifique-se de usar o mesmo Project ID da produção

3. **Validação SSL**
   - O PagBank valida automaticamente o certificado SSL
   - Supabase já possui certificado válido ✅

---

## 🧪 Como Testar se o Webhook Está Funcionando

### Teste 1: Criar Pagamento de Teste

1. No sistema, crie uma **nova conta a receber**
2. Gere um **checkout do PagBank** para essa conta
3. Realize o pagamento no ambiente sandbox
4. Aguarde até 30 segundos
5. Verifique se a parcela mudou para **"paga"** automaticamente

### Teste 2: Verificar Logs

No Supabase Dashboard:
1. Acesse **Edge Functions** → **pagbank-webhook** → **Logs**
2. Procure por logs recentes com:
   - `[webhook:xxxxxxxx] Recebido de IP: ...`
   - `[webhook:xxxxxxxx] ✅ SUCESSO`

3. Se não houver logs, o webhook **não está chegando**

### Teste 3: Consultar Tabela de Logs

Execute no SQL Editor do Supabase:

```sql
-- Ver últimos webhooks recebidos
SELECT * FROM pagbank_transaction_logs
WHERE transaction_type = 'webhook'
ORDER BY created_at DESC
LIMIT 10;

-- Ver divergências (pagamentos confirmados mas não baixados)
SELECT * FROM v_pagbank_divergencias;
```

---

## 🚨 Troubleshooting

### Problema: Webhook não está chegando

**Sintomas:**
- Pagamento aprovado no PagBank
- Parcela continua "pendente" no sistema
- Sem logs de webhook na Edge Function

**Soluções:**

1. **Verificar URL configurada no PagBank**
   ```
   URL correta: https://SEU_PROJETO_ID.supabase.co/functions/v1/pagbank-webhook
   URL errada:  https://caixa.jotaempresas.com/api/pagbank-webhook (antiga)
   ```

2. **Verificar se o ambiente está correto**
   - Se está testando em Sandbox, configure webhook no painel Sandbox
   - Se está em Produção, configure no painel de Produção

3. **Verificar se a Edge Function está ativa**
   ```bash
   # No terminal, testar a URL diretamente
   curl -X POST https://SEU_PROJETO_ID.supabase.co/functions/v1/pagbank-webhook \
     -H "Content-Type: application/json" \
     -d '{"reference_id":"TESTE","status":"WAITING"}'
   
   # Deve retornar 200 OK
   ```

4. **Verificar Firewall/Whitelist**
   - Supabase aceita requisições de qualquer IP por padrão
   - Se houver alguma regra de segurança personalizada, libere IPs do PagBank

---

### Problema: Webhook chega mas não processa

**Sintomas:**
- Logs mostram webhook recebido
- Erro ao processar (status 500)

**Soluções:**

1. **Verificar tabela `configuracoes_pagbank`**
   ```sql
   SELECT * FROM configuracoes_pagbank WHERE proprietario_id = 'SEU_ADMIN_ID';
   ```
   - Verificar se `conta_sintetica_id` está preenchido
   - Verificar se `historico_padrao_id` está preenchido

2. **Verificar logs de erro**
   ```sql
   SELECT webhook_last_error FROM admin_parcelas_receber
   WHERE webhook_retry_count > 0;
   ```

3. **Consultar view de divergências**
   ```sql
   SELECT * FROM v_pagbank_divergencias;
   ```

---

## 🔄 Sistema de Fallback (Redundância)

Mesmo que o webhook não funcione, o sistema possui **verificação automática a cada 10 minutos**:

### Como Funciona

1. A Edge Function `check-pending-payments` executa automaticamente
2. Busca parcelas com status "pendente" que têm `pagbank_checkout_id`
3. Consulta a API do PagBank para verificar se foi pago
4. Se foi pago, chama internamente o webhook para processar

### Como Ativar o Cron Job

No SQL Editor do Supabase, execute:

```sql
-- Instalar extensão pg_cron (se ainda não estiver instalada)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Configurar cron job para executar a cada 10 minutos
SELECT cron.schedule(
  'check-pending-pagbank-payments',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://SEU_PROJETO_ID.supabase.co/functions/v1/check-pending-payments',
    headers := jsonb_build_object(
      'Authorization', 
      'Bearer ' || current_setting('app.settings.service_role_key', true)
    )
  );
  $$
);

-- Verificar se o cron está ativo
SELECT * FROM cron.job;
```

### Testar Fallback Manualmente

```bash
curl -X POST https://SEU_PROJETO_ID.supabase.co/functions/v1/check-pending-payments \
  -H "Authorization: Bearer SEU_SERVICE_ROLE_KEY"
```

---

## 📊 Monitoramento

### Dashboard de Métricas

Execute para ver métricas em tempo real:

```sql
SELECT * FROM v_pagbank_monitoring;
```

Retorna:
- **parcelas_pendentes_1h**: Parcelas criadas há mais de 1h e ainda pendentes
- **parcelas_pendentes_24h**: Parcelas criadas há mais de 24h e ainda pendentes
- **webhooks_falhando**: Parcelas com mais de 3 tentativas de processamento
- **divergencias_criticas**: Parcelas pagas no PagBank mas não no sistema
- **processados_webhook_24h**: Webhooks processados nas últimas 24h
- **ultimo_webhook_recebido**: Data/hora do último webhook recebido

### Alertas Recomendados

Configure alertas (via email, Slack, etc.) para:

1. **divergencias_criticas > 0**
   - Indica pagamento confirmado mas não baixado no sistema
   - Requer ação manual imediata

2. **ultimo_webhook_recebido** mais antigo que 4 horas (durante horário comercial)
   - Pode indicar problema na configuração do webhook

3. **webhooks_falhando > 5**
   - Indica problema sistêmico (config, contas contábeis, etc.)

---

## 🔐 Segurança

### Validação de Origem (Opcional)

Se desejar validar que a requisição vem realmente do PagBank, adicione whitelist de IPs:

```typescript
// No início da pagbank-webhook/index.ts
const PAGBANK_IPS = [
  '186.236.232.0/23',  // Range de IPs do PagBank
  '200.221.2.0/24',
  // Adicionar outros ranges conforme documentação PagBank
];

const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
if (!isIpInRange(clientIp, PAGBANK_IPS)) {
  return new Response('Forbidden', { status: 403 });
}
```

---

## 📞 Suporte

### Documentação Oficial PagBank
- Webhooks: https://dev.pagbank.uol.com.br/docs/webhooks
- Eventos: https://dev.pagbank.uol.com.br/docs/eventos
- Sandbox: https://dev.pagbank.uol.com.br/docs/sandbox

### Verificar Status do PagBank
- https://status.pagseguro.uol.com.br/

---

## ✅ Checklist de Configuração

Use este checklist para garantir que tudo está configurado:

- [ ] Webhook configurado no painel Sandbox do PagBank
- [ ] Webhook configurado no painel Produção do PagBank
- [ ] Eventos selecionados: PAYMENT.PAID, ORDER.PAID
- [ ] URL testada e retorna 200 OK
- [ ] Teste de pagamento realizado e parcela baixada automaticamente
- [ ] Logs de webhook aparecem no Supabase
- [ ] Cron job de fallback configurado e ativo
- [ ] View de monitoramento consultada e sem divergências
- [ ] Alertas configurados para divergências críticas

---

**Data da última atualização:** 2026-01-17
