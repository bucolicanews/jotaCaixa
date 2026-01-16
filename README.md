# Jota App - Sistema de Gestão Financeira e RH Multi-Tenant

![Version](https://img.shields.io/badge/version-2.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-production-brightgreen)

Um sistema robusto de gestão financeira, RH e contratos construído com React, TypeScript, Supabase e Stripe. Oferece soluções completas para administração de empresas, gestão de clientes, contas a receber/pagar, ponto eletrônico, folha de ponto e contratos dinâmicos.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Requisitos do Sistema](#requisitos-do-sistema)
- [Arquitetura de Acesso e RLS](#️-arquitetura-de-acesso-e-rls-padrão-definitivo)
- [Gestão de Usuários (Frontend & Backend)](#-gestão-de-usuários-frontend--backend)
- [Funcionalidades e Telas](#funcionalidades-e-telas)
- [API e Integrações](#api-e-integrações)

---

## 🏛️ Arquitetura de Acesso e RLS (Padrão Definitivo)

Esta seção documenta o padrão **obrigatório** para o controle de acesso, projetado para evitar erros de "infinite recursion" e garantir que funcionários autorizados possam gerenciar dados de sua organização.

### 1. Prevenção de Recursividade Infinita

Nunca faça subqueries na mesma tabela dentro de uma política RLS. Use as seguintes ferramentas:

#### A Tabela `admin_user_lookup`
Esta tabela armazena a relação `user_id -> admin_id`. Ela atua como um cache para que as políticas RLS possam verificar a qual Admin um funcionário pertence sem consultar a tabela `admin_usuarios` diretamente (o que causaria recursão).
- **Trigger**: É atualizada automaticamente por triggers nas tabelas de usuários.

#### A Função `public.get_my_admin_id()`
Identifica o ID do dono final dos dados (Admin ou Cliente) de forma segura:
```sql
-- Se Admin: retorna auth.uid()
-- Se Funcionário: retorna o admin_id da tabela de lookup (sem RLS)
```

### 2. Padrão de Políticas RLS para Tabelas Admin

Para permitir que o Admin e seus Funcionários Gerentes acessem os dados:

```sql
-- SELECT / UPDATE / DELETE
USING (
  admin_id = auth.uid() 
  OR admin_id = public.get_admin_id_for_current_user()
)

-- INSERT / UPDATE (Filtro de Escrita)
WITH CHECK (
  admin_id = auth.uid() 
  OR admin_id = public.get_admin_id_for_current_user()
)
```

---

## 👥 Gestão de Usuários (Frontend & Backend)

A gestão de usuários exige atenção especial ao roteamento de tabelas e à construção de payloads.

### 1. Diferenciação de Tabelas
- **`admin_usuarios`**: Funcionários diretos do Administrador do sistema (Sub-Admins, Suporte).
- **`tbl_usuarios`**: Funcionários das Empresas Clientes.

### 2. Regra de Ouro do Payload (Escrita) ⚠️
Para que um `upsert` ou `insert` funcione no Supabase com RLS ativo, o objeto enviado **DEVE conter a chave estrangeira do proprietário**, mesmo que o banco de dados tenha um default ou trigger. Caso contrário, a política `WITH CHECK` falhará por não encontrar o vínculo no payload.

**Exemplo Correto no Frontend:**
```typescript
const dataToSave = {
    nome: values.nome,
    // ... outros campos
    // OBRIGATÓRIO: Passar o ID do dono para validar o RLS
    admin_id: proprietarioIdOriginal, 
};
const { error } = await supabase.from('admin_usuarios').upsert(dataToSave);
```

### 3. Detecção de Contexto de Gestão

```typescript
const { role, perfil } = useSessao();
const isAdminContext = role === 'Admin' || (role === 'Usuario' && !!perfil.admin_id);
const tabelaDestino = isAdminContext ? 'admin_usuarios' : 'tbl_usuarios';
const ownerKey = isAdminContext ? 'admin_id' : 'cliente_id';
```

---

## 🛠️ Checklist de Desenvolvimento

Ao modificar permissões ou fluxos de usuário:
1. [ ] **Payload**: Verifique se `admin_id` ou `cliente_id` está sendo incluído no objeto enviado ao Supabase.
2. [ ] **Lookup**: Se criou uma nova tabela de usuários, adicione o trigger de sincronização para `admin_user_lookup`.
3. [ ] **Recursão**: Garanta que as políticas RLS usem as funções helper (`get_my_admin_id`) em vez de consultas diretas à própria tabela.
4. [ ] **Permissões**: Funcionários (role: `Usuario`) dependem da flag `permissoes` em seu perfil para acessar módulos específicos.

---

## API e Integrações

### Edge Functions (Deno)
- `create-user-admin`: Cria usuários no Auth com metadados corretos para evitar falhas de trigger.
- `create-pagbank-payment`: Integração com API PagBank para cobranças.
- `contabil-setup`: Inicializa plano de contas e históricos para novos clientes.

### Funções RPC (PostgreSQL)
- `insert_manual_lancamentos`: Transação atômica para partidas dobradas.
- `get_my_admin_id`: Helper principal de segurança.
- `demote_system_client`: Exclusão segura de empresas verificando vínculos ativos.