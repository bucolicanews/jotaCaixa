# 💻 Implementação Frontend e Integrações

## 1. `src/App.tsx` (Payment Success Handler)

*   **Função:** Intercepta os parâmetros de URL (`payment=success&session_id=...`) após o retorno do Stripe.
*   **Ação:** Chama o RPC `activate_subscription` para finalizar a transação e atualizar o perfil do usuário no banco de dados.

## 2. `src/hooks/use-sessao.ts` (Fluxo de Autenticação)

*   **Melhoria:** A lógica de autenticação foi aprimorada para priorizar o evento `PASSWORD_RECOVERY`.
*   **Redirecionamento:** Garante que o usuário seja redirecionado para `/atualizar-senha` em vez de ser logado automaticamente no painel após a recuperação de senha.

## 3. Componentes Chave

*   **`src/components/LayoutPrincipal.tsx`:** Implementa a lógica de controle de acesso (`isAccessExpired` / `isAccessBlocked`) e exibe elementos visuais como o `TrialBanner` e o `TrialButton` com base no status de assinatura do cliente.
*   **`src/hooks/use-tag-manager.ts`:** Hook responsável por verificar e alternar a presença de tags de contrato na tabela `contrato_tags` com base nos campos preenchidos nos formulários de perfil (`FormUsuario.tsx` / `FormCliente.tsx`).