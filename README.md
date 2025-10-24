# VERSÃO TESTE 1.0.0.000
-Contas a Receber 1.0 - Inico ( cadastro do cliente , contas parceladas, repeditas, baixa das contas reparcelamento, filtro)

- Proxima ação(Melhorar o filtro, colocar botões na lista de contas a receber)

# Fluxo de Caixa - Sistema de Gestão Financeira

Este é um sistema de gestão financeira multi-inquilino (multi-tenant) construído com React, TypeScript e Supabase. Ele foi projetado para permitir que múltiplos clientes (empresas) gerenciem suas finanças, enquanto um Administrador central supervisiona e gerencia os clientes.

## 🚀 Principais Funcionalidades

-   **Arquitetura Multi-Inquilino:** O sistema suporta três níveis de acesso:
    1.  **Admin:** Gerencia clientes, aprova novas empresas e tem visão geral do sistema.
    2.  **Cliente (Empresa):** Gerencia sua própria equipe de usuários, define suas permissões e utiliza os módulos financeiros.
    3.  **Usuário:** Membro da equipe de um cliente, com acesso apenas aos módulos permitidos por seu gestor (Cliente).
-   **Sistema de Permissões em Cascata (Admin -> Cliente -> Usuário):** O controle de acesso foi aprimorado para um modelo de dois níveis:
    1.  **Admin para Cliente:** O Administrador define quais módulos (Contas a Pagar, Relatórios, etc.) cada empresa Cliente pode acessar. Isso é feito através de uma coluna `permissoes` na tabela `tbl_clientes`.
    2.  **Cliente para Usuário:** A empresa Cliente pode, então, gerenciar as permissões de sua própria equipe, mas apenas dentro dos limites que o Administrador permitiu. Se um módulo está desativado para a empresa, ela não pode ativá-lo para seus usuários.
    3.  **Permissão para Cadastrar:** O Admin também controla se uma empresa pode ou não adicionar novos usuários à sua equipe através da permissão "Cadastrar Usuários".
-   **Módulos Financeiros:** Inclui funcionalidades para Contas a Pagar, Contas a Receber, Gestão de Contas Bancárias, Plano de Contas, Conciliação e Relatórios.
-   **Autenticação Segura:** Utiliza o sistema de autenticação do Supabase, incluindo um fluxo corrigido e seguro para recuperação de senha.
-   **Importação de Dados:** Funcionalidade para importar dados via arquivos CSV, como o Plano de Contas.

## 🛠️ Tech Stack

-   **Frontend:** React, TypeScript, Vite
-   **Estilização:** Tailwind CSS, shadcn/ui
-   **Roteamento:** React Router
-   **Backend (BaaS):** Supabase
    -   **Autenticação:** Supabase Auth
    -   **Banco de Dados:** Supabase (PostgreSQL)
    -   **Funções de Banco de Dados:** PL/pgSQL

## 📦 Scripts Disponíveis

-   `npm run dev`: Inicia o servidor de desenvolvimento.
-   `npm run build`: Compila o projeto para produção.
-   `npm run lint`: Executa o linter para análise de código.

## 🗄️ Arquitetura do Banco de Dados (Supabase/PostgreSQL)

O banco de dados é o coração do sistema multi-inquilino.

### Extensões PostgreSQL Utilizadas

-   `plpgsql`: Para a criação de funções e triggers.
-   `uuid-ossp`: Para a geração de UUIDs (padrão no Supabase).

### Principais Tabelas

-   `public.tbl_admins`: Armazena os administradores do sistema.
    -   `id (uuid)`: Chave primária, vinculada a `auth.users.id`.
    -   `nome (text)`
    -   `email (text)`

-   `public.tbl_clientes`: Armazena as empresas/clientes que usam o sistema.
    -   `id (uuid)`: Chave primária, vinculada a `auth.users.id`.
    -   `nome (text)`: Nome da empresa.
    -   `aprovado (boolean)`: Controla se o cliente foi aprovado pelo Admin.
    -   `limite_usuarios (integer)`: Número máximo de usuários que o cliente pode cadastrar.
    -   `permissoes (jsonb)`: Controlado pelo Admin, define quais módulos a empresa pode acessar e, consequentemente, conceder aos seus usuários.

-   `public.tbl_usuarios`: Armazena os usuários finais, que pertencem a um cliente.
    -   `id (uuid)`: Chave primária, vinculada a `auth.users.id`.
    -   `cliente_id (uuid)`: Chave estrangeira para `public.tbl_clientes.id`, vinculando o usuário à sua empresa.
    -   `permissoes (jsonb)`: Armazena as permissões de acesso do usuário (ex: `{"contas_pagar": true, "relatorios": false}`), definidas pelo gestor do Cliente.

### Lógica de Roteamento de Usuários

-   Um trigger (`on_auth_user_created`) em `auth.users` executa a função `route_new_user()` sempre que um novo usuário se cadastra.
-   A função `route_new_user()` lê os metadados (`role`, `cliente_id`) fornecidos no momento do cadastro e insere o registro na tabela correta (`tbl_admins`, `tbl_clientes` ou `tbl_usuarios`), estabelecendo a arquitetura de papéis.

---

## 🧠 Análise de Caso: Resolvendo o Bug do "Link Mágico" na Recuperação de Senha

Um dos desafios críticos resolvidos neste projeto foi o bug onde o link de recuperação de senha se comportava como um link de login mágico, autenticando o usuário e redirecionando-o para o painel principal em vez da página de atualização de senha.

### O Problema

1.  O usuário solicita a recuperação de senha.
2.  Ele recebe o link por e-mail e clica nele.
3.  O aplicativo o redireciona para `/painel` como se estivesse logado, nunca mostrando a tela para criar uma nova senha.

### A Causa Raiz: Corrida de Eventos (Race Condition)

O Supabase Auth emite diferentes eventos de autenticação. O problema ocorria devido à ordem e à forma como o aplicativo reagia a eles:

-   Quando o usuário clica no link de recuperação, o Supabase cria uma sessão temporária e emite **dois eventos** em rápida sucessão: primeiro um evento genérico `SIGNED_IN` (usuário logado) e depois o evento específico `PASSWORD_RECOVERY` (recuperação de senha).
-   A lógica de autenticação global do aplicativo (no `SessionContext`) via o evento `SIGNED_IN` primeiro, concluía que o usuário estava logado e executava o redirecionamento padrão para o painel.
-   O evento `PASSWORD_RECOVERY` chegava tarde demais; o redirecionamento já havia ocorrido.

### A Solução Definitiva (Implementada)

A solução foi reestruturar a lógica de autenticação para tratar a recuperação de senha como uma exceção de alta prioridade, interrompendo o fluxo de login normal.

**Passo 1: Priorizar o Evento `PASSWORD_RECOVERY`**

No `SessionContext.tsx`, o listener `onAuthStateChange` foi modificado para verificar **primeiro** se o evento é de recuperação de senha.

```typescript
// Dentro de SessionContext.tsx

supabase.auth.onAuthStateChange((event, session) => {
  // Lógica de alta prioridade:
  if (event === 'PASSWORD_RECOVERY') {
    // 1. Navega IMEDIATAMENTE para a página correta.
    navigate('/atualizar-senha');
    // 2. NÃO executa o resto do código (como buscar perfil),
    //    impedindo que o app trate isso como um login.
  } else {
    // Fluxo normal para todos os outros eventos (SIGNED_IN, SIGNED_OUT, etc.)
    buscarDadosAdicionais(session?.user ?? null);
  }
});
```

**Passo 2: Proteger e Limpar na Página de Atualização**

A página `AtualizarSenha.tsx` foi simplificada para ter uma única responsabilidade: atualizar a senha e limpar a sessão.

```typescript
// Dentro de AtualizarSenha.tsx

const handleSubmit = async (e: React.FormEvent) => {
  // ... lógica de validação da senha ...

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    // Trata o erro
  } else {
    showSuccess('Senha atualizada com sucesso!');
    
    // PASSO CRUCIAL: Destruir a sessão temporária de recuperação.
    await supabase.auth.signOut(); 
    
    // Redirecionar para o login.
    navigate('/login');
  }
};
```

> **Principal Lição Aprendida:** Em sistemas de autenticação baseados em eventos, sempre trate os casos de uso específicos (como recuperação de senha, verificação de e-mail) com prioridade máxima antes de lidar com o caso genérico de "usuário logado". Isso evita corridas de eventos e comportamentos inesperados.