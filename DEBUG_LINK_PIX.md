# 🐛 DEBUG: Link do PIX não aparece

## 🔍 Passos para Diagnosticar:

### 1. Abra o DevTools (F12)

1. Pressione **F12** no navegador
2. Vá na aba **Console**
3. Limpe o console (botão 🚫)

---

### 2. Gere um PIX

1. Selecione uma parcela
2. Clique em **"Gerar PIX"**
3. Aguarde o modal abrir

---

### 3. Verifique o Console

Procure por estas linhas:

```
📥 RESPONSE DATA: { ... }
```

**Me envie o conteúdo completo do `RESPONSE DATA`.**

Especificamente, procure por:
- `pix_payment_page_url` → Deve existir e ter valor
- `qr_code` → Deve existir e ter valor
- `qr_code_text` → Deve existir e ter valor

---

### 4. Verifique o SQL

Execute no SQL Editor do Supabase:

```sql
-- Verificar se a coluna existe
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'admin_parcelas_receber' 
  AND column_name = 'pix_payment_page_url';
```

**Resultado esperado:** Deve retornar 1 linha mostrando a coluna.

Se **NÃO retornar nada**, execute:

```sql
-- Criar a coluna manualmente
ALTER TABLE public.admin_parcelas_receber 
ADD COLUMN IF NOT EXISTS pix_payment_page_url TEXT;
```

---

### 5. Verifique a Variável de Ambiente

Execute no SQL Editor:

```sql
-- Ver todas as variáveis
SELECT name 
FROM vault.secrets 
WHERE name LIKE '%APP_URL%';
```

**Resultado esperado:** Deve retornar `NEXT_PUBLIC_APP_URL`.

---

### 6. Teste: Verificar dados salvos no banco

Após gerar um PIX, execute:

```sql
-- Pegar o último PIX gerado
SELECT 
  id,
  numero_parcela,
  valor_parcela,
  pagbank_charge_id,
  pagbank_payment_link,
  pix_payment_page_url,
  pagbank_qr_code IS NOT NULL as tem_qr_code,
  pagbank_qr_code_text IS NOT NULL as tem_codigo_pix
FROM admin_parcelas_receber
WHERE pagbank_charge_id IS NOT NULL
ORDER BY pagbank_updated_at DESC
LIMIT 1;
```

**Verifique:**
- `pix_payment_page_url` → Deve ter valor como `http://localhost:8080/pix/123`
- `pagbank_payment_link` → Deve ter o mesmo valor
- `tem_qr_code` → Deve ser `true`
- `tem_codigo_pix` → Deve ser `true`

---

## 🆘 Possíveis Causas

### ❌ Causa 1: SQL não foi executado
**Solução:** Execute o SQL do arquivo `APLICAR_NO_SUPABASE.sql`

### ❌ Causa 2: Variável de ambiente não configurada
**Solução:** Configure `NEXT_PUBLIC_APP_URL` no dashboard do Supabase

### ❌ Causa 3: Cache do navegador
**Solução:** 
- Pressione **Ctrl + Shift + R** (hard refresh)
- Ou feche e reabra o navegador

### ❌ Causa 4: Edge Function não atualizada
**Solução:**
```bash
cd c:\Users\jotac\dyad-apps\jota-app-basico
supabase functions deploy create-pagbank-payment
```

---

## 📋 Checklist Rápido

- [ ] SQL executado no Supabase
- [ ] Variável `NEXT_PUBLIC_APP_URL` configurada
- [ ] Edge Function com deploy atualizado
- [ ] Cache do navegador limpo
- [ ] Coluna `pix_payment_page_url` existe no banco

---

**Envie as informações do console para eu te ajudar melhor!** 🚀
