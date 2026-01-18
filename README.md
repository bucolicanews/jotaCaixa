# Jota App - Sistema de Gestão Financeira, Contábil e RH

![Version](https://img.shields.io/badge/version-2.5-blue)
![Status](https://img.shields.io/badge/status-production-brightgreen)

O **Jota App** é uma plataforma ERP multi-tenant completa, projetada para unificar a gestão financeira, contábil e de recursos humanos em um único painel. O sistema utiliza uma arquitetura robusta no Supabase com Row Level Security (RLS) para garantir o isolamento total de dados entre empresas.

## 🚀 Funcionalidades Principais

### 💰 Financeiro & Faturamento
- **Contas a Receber/Pagar:** Gestão sintética e analítica de parcelas com controle de status automático.
- **Integração PagBank:** Geração de links de pagamento (PIX, Boleto e Cartão) com baixa automática via Webhook.
- **Conciliação Bancária:** Processamento de extratos CSV com criação automática de lançamentos em partidas dobradas.
- **Gestão de Fluxo de Caixa:** Visualização consolidada de saldos e movimentações reais por conta.

### 📊 Contabilidade Automatizada
- **Plano de Contas Hierárquico:** Suporte a máscaras personalizáveis e marcações de natureza (Ativo, Passivo, Resultado).
- **Relatórios Contábeis:** Geração em tempo real de DRE, Balanço Patrimonial, Balancete de Verificação e Livro Razão.
- **Integração Calima:** Exportação de lançamentos e históricos no padrão aceito pelo sistema contábil.
- **Lançamentos Manuais:** Registro de partidas dobradas com referência cruzada automática.

### 👥 RH & Ponto Eletrônico
- **Ponto com Biometria Facial:** Registro de jornada com captura de selfie e geolocalização.
- **Folha de Ponto Mensal:** Cálculo automático de horas extras (100%), banco de horas, faltas e abonos.
- **Gestão de Férias:** Controle de períodos aquisitivos baseado em regras CLT e agendamento de períodos de gozo.
- **Documentação de Admissão:** Upload e gestão de documentos obrigatórios para funcionários.

### 📄 Contratos e Documentos
- **Templates Dinâmicos:** Criação de modelos com tags personalizadas (ex: `{{CLIENTE_NOME}}`).
- **Assinatura Eletrônica:** Fluxo seguro para assinatura de clientes com coleta de selfie e nome completo.
- **Documentos Societários:** Geração de atas e contratos sociais utilizando blocos de texto reutilizáveis.

## 🛡️ Arquitetura de Segurança (RLS)

O sistema segue padrões rigorosos para evitar vazamento de dados:
- **Tabela `admin_user_lookup`:** Atua como cache de permissões para evitar recursão infinita em políticas RLS.
- **Função `get_my_admin_id()`:** Helper central que identifica o proprietário dos dados, permitindo que funcionários acessem informações de sua empresa de forma segura.
- **Isolamento de Storage:** Buckets organizados por `user_id` com políticas que restringem o acesso apenas ao proprietário ou gestor.

## 💳 Integração PagBank (Homologado)

O sistema está preparado para operar em ambiente Sandbox e Produção:
1. **Geração:** O link é gerado via Edge Function chamando a API do PagBank.
2. **Notificação:** O Webhook processa pagamentos em tempo real.
3. **Contabilização:** Ao receber um pagamento, o sistema gera automaticamente os lançamentos de entrada no banco, baixa no direito a receber e registro da despesa de taxa.

## 🛠️ Stack Tecnológica

- **Frontend:** React 18, TypeScript, Tailwind CSS, Shadcn/UI, Recharts.
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions, Storage).
- **Pagamentos:** API PagBank / Stripe.
- **E-mail:** API Resend para notificações e convites.

---
© 2026 Jota Empresas. Todos os direitos reservados...
integração bagbank.2
