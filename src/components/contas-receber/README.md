# Geração de Logs para Homologação PagBank

Este documento descreve o procedimento para gerar os logs de request e response necessários para a homologação da integração com o PagBank.

## Passos para Gerar os Logs

1.  **Abra a Aplicação**: Inicie a aplicação em ambiente de desenvolvimento (Sandbox).

2.  **Acesse a Funcionalidade**: Navegue até a tela onde é possível gerar um link de pagamento para uma parcela. Isso abrirá o diálogo "Gerar Link de Pagamento PagBank".

3.  **Abra o Console do Desenvolvedor**:
    *   No seu navegador (Google Chrome, Firefox, etc.), pressione a tecla **F12** para abrir as Ferramentas de Desenvolvedor.
    *   Clique na aba **"Console"**.

4.  **Gere o Link de Pagamento**:
    *   Dentro do diálogo, selecione a forma de pagamento que deseja testar (ex: PIX ou Checkout).
    *   Clique no botão **"Gerar Link"**.

5.  **Copie os Logs**:
    *   Após clicar no botão, o console exibirá um bloco de texto formatado, iniciado e finalizado com uma linha de aviso.
    *   **Exemplo de Log de Sucesso:**
        ```
        === 🧾 LOG HOMOLOGAÇÃO PAGBANK (SUCESSO) ===
        📍 Função: create-pagbank-payment
        📤 Request Body: {
          "parcela_id": "...",
          "payment_method": "pix",
          "admin_id": "..."
        }
        📥 Response Data: { ... }
        === FIM LOG HOMOLOGAÇÃO PAGBANK ===
        ```
    *   Selecione e copie o bloco de texto completo (do início ao fim) para cada teste realizado.

6.  **Repita para Outros Meios de Pagamento**: Repita os passos 4 e 5 para todos os meios de pagamento que precisam ser homologados (Checkout e PIX).

7.  **Envie as Evidências**: Envie os logs copiados para a equipe de homologação do PagBank como evidência da integração.

---

## Exemplos de Logs Gerados

### 1. Checkout

```
=== 🧾 LOG HOMOLOGAÇÃO PAGBANK (SUCESSO) ===
📍 Função: create-pagbank-checkout
📤 Request Body: {
  "parcela_id": "086c5a89-2754-4dc2-8cce-f10e015b0dbd",
  "admin_id": "0561e0b6-6a03-412f-bf42-66a420bd4523"
}
📥 Response Data: {
  "success": true,
  "checkout_id": "CHEC_F84611CC-6298-4596-9754-7B9AB4297969",
  "checkout_link": "https://pagamento.sandbox.pagbank.com.br/pagamento?code=f84611cc-6298-4596-9754-7b9ab4297969",
  "status": "ACTIVE",
  "cliente": {
    "nome": "ANGELA PINTO MACIEL",
    "email": "angelaq.2018@outlook.com",
    "telefone": "91 98197-3511"
  }
}
=== FIM LOG HOMOLOGAÇÃO PAGBANK ===
```

```
=== 🧾 LOG HOMOLOGAÇÃO PAGBANK (SUCESSO) ===
📍 Função: create-pagbank-checkout
📤 Request Body: {
  "parcela_id": "a5ae20ee-94e7-4d8c-84c4-622101f57b16",
  "admin_id": "0561e0b6-6a03-412f-bf42-66a420bd4523"
}
📥 Response Data: {
  "success": true,
  "checkout_id": "CHEC_83EFC786-B971-4F5A-B63C-7EC11DDD6468",
  "checkout_link": "https://pagamento.sandbox.pagbank.com.br/pagamento?code=83efc786-b971-4f5a-b63c-7ec11ddd6468",
  "status": "ACTIVE",
  "cliente": {
    "nome": "AMILTON RIBEIRO BARBOSA",
    "email": "MIR@JOTAEMPRESAS.COM",
    "telefone": "91996426095"
  }
}
=== FIM LOG HOMOLOGAÇÃO PAGBANK ===
```

### 2. PIX

```
=== 🧾 LOG HOMOLOGAÇÃO PAGBANK (SUCESSO) ===
📍 Função: create-pagbank-payment
📤 Request Body: {
  "parcela_id": "11822843-e3d2-4cb1-bb1f-6507798d208b",
  "payment_method": "pix",
  "admin_id": "0561e0b6-6a03-412f-bf42-66a420bd4523"
}
📥 Response Data: {
  "success": true,
  "charge_id": "ORDE_9BBD4AFE-EABE-47EC-B77E-7B666B622E67",
  "qr_code": "https://sandbox.api.pagseguro.com/qrcode/QRCO_6BCCCBBC-C76B-4578-84B9-7DC1A0EE843B/png",
  "qr_code_text": "00020101021226850014br.gov.bcb.pix2563api-h.pagseguro.com/pix/v2/6BCCCBBC-C76B-4578-84B9-7DC1A0EE843B27600016BR.COM.PAGSEGURO01366BCCCBBC-C76B-4578-84B9-7DC1A0EE843B52048111530398654042.005802BR592259.234.834 joao luiz s6005Belem62070503***6304CEC7",
  "boleto_pdf_url": null,
  "boleto_barcode": null,
  "cliente": {
    "nome": "AMILTON RIBEIRO BARBOSA",
    "email": "MIR@JOTAEMPRESAS.COM",
    "telefone": "91996426095"
  }
}
=== FIM LOG HOMOLOGAÇÃO PAGBANK ===
```