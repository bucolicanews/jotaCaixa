# Configuração de Variáveis de Ambiente - PagBank PIX

## 📋 Resumo das Alterações

Este documento explica como configurar a variável de ambiente necessária para que os links de pagamento PIX sejam gerados corretamente.

## 🔧 Configuração no Supabase (Edge Functions)

As Edge Functions do Supabase precisam saber a URL base da sua aplicação para gerar os links de pagamento PIX.

### Passos para Configurar:

1. **Acesse o Dashboard do Supabase**
   - Vá para: https://app.supabase.com
   - Selecione seu projeto

2. **Navegue até Edge Functions Settings**
   - No menu lateral, clique em **"Edge Functions"**
   - Clique na aba **"Settings"** ou **"Environment Variables"**

3. **Adicione a Variável de Ambiente**
   - Nome da variável: `NEXT_PUBLIC_APP_URL`
   - Valor (desenvolvimento local): `http://localhost:8080`
   - Valor (produção): `https://seu-dominio.com.br` (substitua pelo seu domínio real)

4. **Salve e Reinicie as Edge Functions**
   - Clique em **"Save"** ou **"Add Variable"**
   - As Edge Functions serão reiniciadas automaticamente

### Exemplo de Configuração:

```
Nome: NEXT_PUBLIC_APP_URL
Valor (dev): http://localhost:8080
Valor (prod): https://app.jotaempresas.com.br
```

## 🌐 Configuração Local (Frontend)

No diretório raiz do projeto, você encontrará o arquivo `.env.local`:

```env
VITE_PUBLIC_BASE_URL=http://localhost:8080
```

Para produção, altere para:

```env
VITE_PUBLIC_BASE_URL=https://seu-dominio.com.br
```

## 🧪 Como Testar

1. **Teste Local:**
   ```bash
   # Certifique-se de que a aplicação está rodando em http://localhost:8080
   npm run dev
   ```

2. **Gere um PIX:**
   - Acesse Contas a Receber
   - Selecione uma parcela
   - Clique em "Gerar PIX"
   - Verifique se a URL de pagamento aparece no modal
   - Formato esperado: `http://localhost:8080/pix/123`

3. **Verifique o Console:**
   - Abra as DevTools (F12)
   - Na aba Console, procure por logs da Edge Function
   - Deve exibir: `[create-pagbank-payment] NEXT_PUBLIC_APP_URL: http://localhost:8080`

4. **Teste o Link:**
   - Copie a URL de pagamento do modal
   - Abra em uma nova aba
   - Deve carregar a página com QR Code e informações do pagamento

## 🚀 Deploy para Produção

Antes de fazer deploy:

1. **Atualize as variáveis de ambiente no Supabase:**
   - `NEXT_PUBLIC_APP_URL=https://seu-dominio-producao.com.br`

2. **Atualize o arquivo `.env.local` (ou configure no serviço de hospedagem):**
   ```env
   VITE_PUBLIC_BASE_URL=https://seu-dominio-producao.com.br
   ```

3. **Faça o build e deploy:**
   ```bash
   npm run build
   ```

## 🔍 Troubleshooting

### Problema: URL não aparece no modal

**Solução:**
- Verifique se `NEXT_PUBLIC_APP_URL` está configurada no Supabase
- Verifique os logs da Edge Function no dashboard do Supabase
- Reinicie as Edge Functions

### Problema: Link retorna 404

**Solução:**
- Verifique se a rota `/pix/:id` está configurada no React Router
- Confirme que o arquivo `src/pages/PagamentoPix.tsx` existe
- Verifique se o `id` da parcela está correto no banco de dados

### Problema: Página carrega mas não mostra QR Code

**Solução:**
- Verifique se os dados foram salvos corretamente no banco:
  ```sql
  SELECT pagbank_qr_code, pagbank_qr_code_text, pagbank_payment_link
  FROM admin_parcelas_receber
  WHERE id = 'ID_DA_PARCELA';
  ```
- Confirme que a coluna `pagbank_payment_link` foi criada:
  ```sql
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'admin_parcelas_receber'
  AND column_name LIKE '%pagbank%';
  ```

## 📊 Fluxo de Dados

```
1. Usuário clica "Gerar PIX"
   ↓
2. Frontend chama Edge Function: create-pagbank-payment
   ↓
3. Edge Function:
   - Busca dados da parcela no banco
   - Gera cobrança PIX no PagBank
   - Constrói URL: NEXT_PUBLIC_APP_URL + '/pix/' + parcela_id
   - Salva no campo: pagbank_payment_link
   ↓
4. Frontend recebe response:
   - qr_code (imagem PNG)
   - qr_code_text (código copiável)
   - pix_payment_page_url (URL da página de pagamento)
   ↓
5. Modal exibe:
   - QR Code
   - URL de pagamento (com botão copiar)
   - Código PIX (com botão copiar)
   ↓
6. Envio via WhatsApp:
   - Inclui a URL de pagamento na mensagem
   ↓
7. Cliente acessa URL:
   - Carrega página /pix/:id
   - Busca dados no banco
   - Exibe QR Code + Código PIX + Instruções
```

## ✅ Checklist Final

- [ ] Variável `NEXT_PUBLIC_APP_URL` configurada no Supabase
- [ ] Arquivo `.env.local` criado localmente
- [ ] Teste de geração de PIX realizado
- [ ] URL aparece no modal corretamente
- [ ] Página de pagamento `/pix/:id` carrega corretamente
- [ ] Botão de copiar URL funciona
- [ ] WhatsApp envia mensagem com a URL
- [ ] QR Code é exibido e escaneável
- [ ] Código PIX é copiável

## 📞 Suporte

Em caso de dúvidas ou problemas:
1. Verifique os logs no console do navegador (F12)
2. Verifique os logs da Edge Function no dashboard do Supabase
3. Consulte a documentação do PagBank: https://dev.pagseguro.uol.com.br/reference/
