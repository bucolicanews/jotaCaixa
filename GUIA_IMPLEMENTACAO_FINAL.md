# 🚀 GUIA DE IMPLEMENTAÇÃO FINAL - Link de Pagamento PIX

## ✅ Status Atual

- [x] Edge Function `create-pagbank-payment` atualizada e com deploy feito
- [x] Frontend (Modal) atualizado
- [x] Frontend (WhatsApp) atualizado
- [ ] **VOCÊ PRECISA FAZER:** Migrations do banco de dados
- [ ] **VOCÊ PRECISA FAZER:** Configurar variável de ambiente

---

## 📋 TAREFAS QUE VOCÊ PRECISA EXECUTAR

### 1️⃣ Aplicar SQL no Banco de Dados

**Arquivo:** `APLICAR_NO_SUPABASE.sql` (criado na raiz do projeto)

**Passo a passo:**

1. Acesse: https://supabase.com/dashboard/project/jqoirlswewggyppgvgnv/editor
2. Clique em **"SQL Editor"** no menu lateral
3. Clique em **"New query"**
4. Copie e cole TODO o conteúdo do arquivo `APLICAR_NO_SUPABASE.sql`
5. Clique em **"Run"** (ou pressione Ctrl+Enter)
6. Aguarde a mensagem de sucesso

**O que esse SQL faz:**
- Adiciona coluna `pix_payment_page_url` na tabela `admin_parcelas_receber`
- Adiciona colunas `whatsapp_template_pix` e `whatsapp_template_link` na tabela `configuracoes_pagbank`

---

### 2️⃣ Configurar Variável de Ambiente

**Localização:** https://supabase.com/dashboard/project/jqoirlswewggyppgvgnv/settings/functions

**Passo a passo:**

1. Acesse o link acima
2. Procure por **"Environment Variables"** ou **"Secrets"**
3. Clique em **"Add new variable"** ou **"New secret"**
4. Preencha:
   - **Name:** `NEXT_PUBLIC_APP_URL`
   - **Value:** 
     - **Desenvolvimento:** `http://localhost:8080`
     - **Produção:** `https://seu-dominio-real.com.br`
5. Clique em **"Save"** ou **"Add"**
6. Aguarde 10-20 segundos (as Edge Functions vão reiniciar automaticamente)

---

## 🧪 COMO TESTAR

### Teste 1: Verificar se o SQL foi aplicado

Execute no SQL Editor:

```sql
-- Verificar se as colunas foram criadas
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'admin_parcelas_receber' 
  AND column_name = 'pix_payment_page_url';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'configuracoes_pagbank' 
  AND column_name IN ('whatsapp_template_pix', 'whatsapp_template_link');
```

**Resultado esperado:** Deve retornar as colunas criadas.

---

### Teste 2: Verificar variável de ambiente

Execute no SQL Editor:

```sql
SELECT name, value 
FROM vault.secrets 
WHERE name = 'NEXT_PUBLIC_APP_URL';
```

Ou simplesmente verifique nos logs da Edge Function após gerar um PIX:
- Acesse: https://supabase.com/dashboard/project/jqoirlswewggyppgvgnv/functions/create-pagbank-payment/logs
- Procure por: `[PIX EXPIRATION]` ou logs recentes

---

### Teste 3: Gerar PIX e verificar modal

1. Acesse sua aplicação
2. Vá em **Contas a Receber**
3. Selecione uma parcela
4. Clique em **"Gerar PIX"**
5. Verifique se o modal exibe:
   - ✅ QR Code
   - ✅ **Seção azul com "🔗 Link de Pagamento"**
   - ✅ Campo com a URL (ex: `http://localhost:8080/pix/123`)
   - ✅ Botão de copiar
   - ✅ Código PIX abaixo

---

### Teste 4: Verificar WhatsApp

1. No modal, clique em **"Enviar via WhatsApp"**
2. Verifique se o WhatsApp Web abre
3. A mensagem deve conter:
   - Nome do cliente
   - **URL de pagamento** (não o código PIX longo)
   - Valor formatado
   - Data de vencimento
   - Validade do PIX

**Exemplo esperado:**
```
Olá João Silva! 👋

📱 *Pagamento PIX Facilitado*

👉 Clique no link para ver o QR Code e copiar o código:
http://localhost:8080/pix/123

💰 Valor: R$ 150,00
📅 Vencimento: 15/02/2026
⏰ PIX válido até: 15/02/2026 23:59

✅ Rápido, fácil e seguro!
```

---

### Teste 5: Acessar página de pagamento

1. Copie a URL gerada (ex: `http://localhost:8080/pix/123`)
2. Abra em uma **nova aba** (ou envie para um cliente teste)
3. Deve carregar a página com:
   - QR Code centralizado
   - Valor da cobrança
   - Código PIX copiável
   - Instruções de pagamento
   - Botão grande verde "Copiar Código PIX"

---

## 🐛 Troubleshooting

### Erro: "hoje.toISOString is not a function"

**Causa:** Edge Function ainda não foi atualizada.

**Solução:**
```bash
cd c:\Users\jotac\dyad-apps\jota-app-basico
supabase functions deploy create-pagbank-payment
```

---

### Erro: URL não aparece no modal

**Diagnóstico:**
1. Abra DevTools (F12)
2. Vá na aba Console
3. Procure por: `📥 RESPONSE DATA:`
4. Verifique se contém `pix_payment_page_url`

**Possíveis causas:**
- ❌ Variável `NEXT_PUBLIC_APP_URL` não configurada no Supabase
- ❌ SQL não foi executado (coluna `pix_payment_page_url` não existe)
- ❌ Frontend não foi atualizado (faça refresh com Ctrl+Shift+R)

**Soluções:**
1. Configure a variável de ambiente (Tarefa 2 acima)
2. Execute o SQL (Tarefa 1 acima)
3. Limpe o cache do navegador

---

### Erro: Página /pix/:id retorna 404

**Causa:** Servidor não está rodando ou rota não configurada.

**Solução:**
```bash
# Reinicie o servidor
npm run dev
```

Verifique se `App.tsx` contém:
```tsx
<Route path="/pix/:id" element={<PagamentoPix />} />
```

---

### Erro: Dados não aparecem na página de pagamento

**Diagnóstico:**
Execute no SQL Editor:
```sql
SELECT 
  id,
  pagbank_qr_code IS NOT NULL as tem_qr_code,
  pagbank_qr_code_text IS NOT NULL as tem_codigo_pix,
  pagbank_payment_link,
  pix_payment_page_url
FROM admin_parcelas_receber
WHERE pagbank_charge_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
```

**Se retornar NULL:** Re-gere o PIX após aplicar o SQL.

---

## 📊 Checklist Final

Antes de considerar concluído, verifique:

- [ ] SQL executado no Supabase (Tarefa 1)
- [ ] Variável `NEXT_PUBLIC_APP_URL` configurada (Tarefa 2)
- [ ] Edge Function com deploy atualizado (já feito via CLI)
- [ ] Frontend atualizado (já feito)
- [ ] Teste: Gerou PIX com sucesso
- [ ] Teste: Modal exibe URL de pagamento
- [ ] Teste: Botão copiar funciona
- [ ] Teste: WhatsApp envia mensagem com URL
- [ ] Teste: Página `/pix/:id` carrega corretamente
- [ ] Teste: QR Code é escaneável
- [ ] Teste: Código PIX pode ser copiado

---

## 🎯 Resumo dos Comandos Executados

```bash
# 1. Deploy da Edge Function (já feito)
supabase functions deploy create-pagbank-payment

# 2. Link do projeto (já feito)
supabase link --project-ref jqoirlswewggyppgvgnv
```

---

## 📞 Próximos Passos

1. ✅ Execute o SQL no Supabase
2. ✅ Configure a variável de ambiente
3. ✅ Teste gerar um PIX
4. ✅ Verifique se tudo funciona
5. 🎉 Pronto!

Se tudo funcionar, commit suas alterações:

```bash
git add .
git commit -m "feat: adiciona URL de pagamento PIX no modal e WhatsApp"
git push
```

---

## 📚 Documentação Adicional

- `RESUMO_CORRECAO_PIX_COMPLETO.md` - Detalhes técnicos completos
- `CONFIGURACAO_VARIAVEIS_AMBIENTE_PIX.md` - Guia de variáveis de ambiente
- `APLICAR_NO_SUPABASE.sql` - SQL consolidado para aplicar

---

**Dúvidas?** Revise os arquivos de documentação ou teste passo a passo seguindo este guia!
