# 💻 Implementação Frontend e Integrações

## 1. Fluxo de Autenticação e Sessão

*   **`src/contexts/SessionContext.tsx`:** Gerencia o estado global do usuário (`usuario`, `perfil`, `role`) e lida com o roteamento pós-login/recuperação de senha.
*   **`src/pages/Login.tsx`:** Utiliza o `Auth` component do Supabase, configurado para usar o tema dinâmico (`useTheme`) e redirecionar para `/painel` após o login.
*   **`src/pages/AtualizarSenha.tsx`:** Lida com o fluxo de `PASSWORD_RECOVERY`, forçando o usuário a definir uma nova senha antes de ser redirecionado para o login.

## 2. Hooks e Lógica de Negócio

| Hook | Propósito | Módulos |
| :--- | :--- | :--- |
| `useSessao` | Acesso rápido ao perfil, role e status de carregamento. | Global |
| `useSaldoContaCalculado` | Calcula o saldo atual de contas/caixas (`saldo_contas`) somando `saldo_inicial` e `lancamentos`. | Bancos, Fluxo de Caixa |
| `useDRE` | Calcula a Demonstração de Resultado (Receita - Custo - Despesa) com base em `lancamentos` e `plano_contas`. | DRE |
| `useBalancoPatrimonial` | Calcula o Balanço Patrimonial (Ativo vs Passivo/PL) com base em `saldo_contas` e `lancamentos` até uma data de corte. | Balanço Patrimonial |
| `usePontoStatus` | Monitora o último registro de ponto do dia para determinar a próxima ação (`Entrada` ou `Saida`). | Ponto Eletrônico |
| `useTagManager` | Verifica e alterna a presença de uma tag específica na tabela `contrato_tags`. | Formulários de Perfil |
| `useBulkTagManager` | Gerencia a ativação/desativação em massa de todas as tags mapeáveis de um recurso. | Formulários de Perfil |
| `usePrint` | Utilitário para renderizar e imprimir conteúdo HTML/PDF em nova janela. | Relatórios, Contratos |

## 3. Integração Financeira e Contábil

*   **Lançamentos (`lancamentos`):** Todas as movimentações financeiras (recebimentos, pagamentos, conciliação) geram um registro na tabela `lancamentos` para permitir o cálculo de saldo e a geração de relatórios contábeis (DRE/Balanço).
*   **Conciliação (`/conciliacao`):** O fluxo de 4 passos permite importar CSV, mapear colunas, aplicar regras automáticas e salvar lançamentos, prevenindo duplicidade de arquivos e transações.
*   **Exportação (`/exportar`):** Utiliza as relações de `lancamentos` com `saldo_contas` e `plano_contas` para gerar o arquivo de partidas dobradas (Débito/Crédito) para sistemas contábeis.