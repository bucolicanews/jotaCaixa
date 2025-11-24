# 👥 Módulos de RH, Ponto Eletrônico e Contratos

## 1. Módulo de Ponto Eletrônico e Folha de Ponto

Sistema para registro e gestão da jornada de trabalho.

### Tabelas Chave

| Tabela | Propósito | RLS |
| :--- | :--- | :--- |
| `tbl_usuarios` | Armazena dados de RH (salário, jornada, folgas fixas). | Acesso restrito ao próprio usuário e ao Cliente/Admin. |
| `registros_ponto` | Registros de Entrada/Saída, Falta, Abono, Compensação. | Usuário só insere/vê os próprios. Cliente/Admin gerencia todos da empresa. |
| `ferias` | Períodos de férias agendados. | Usuário só vê os próprios. Cliente/Admin gerencia todos da empresa. |

### Fluxos de Gestão (`/folha-ponto`)

*   **Cálculo de Jornada:** O componente `DetalheFolhaPonto.tsx` calcula as horas trabalhadas, horas extras e saldo de horas com base nos registros e nas configurações de jornada (`horas_mensais`, `dias_folga_fixos`).
*   **Ajuste de Ponto (`AjustarPontoDialog`):** Permite que o gestor (Cliente/Admin) apague e reinsira os registros de Entrada/Saída de um dia.
*   **Gerenciamento de Faltas/Abonos (`GerenciarFaltas`):** Cria um registro de dia inteiro (`tipo: 'Falta'` ou `tipo: 'Abono'`) para justificar a ausência.
*   **Gestão de Folga Trabalhada (`GerenciarFolgaTrabalhada`):** Cria um registro de decisão (`tipo: 'Compensacao'` ou `tipo: 'Extra100'`) para o dia de folga que foi trabalhado, afetando o cálculo de horas extras.

## 2. Módulo de Contratos

Criação, gestão e preenchimento de contratos dinâmicos.

### Tabelas Chave

| Tabela | Propósito | RLS |
| :--- | :--- | :--- |
| `contrato_tags` | Tags dinâmicas customizadas (ex: `{{NOME_DO_PROJETO}}`). | Acesso restrito ao Cliente/Admin proprietário. |
| `contrato_modelos` | Templates de contrato (HTML/Texto). | Acesso restrito ao Cliente/Admin proprietário. |
| `contratos_gerados` | Contratos preenchidos e prontos para assinatura. | Acesso restrito ao Cliente/Admin proprietário. |
| `configuracao_contratos` | Configurações de URL base e templates de envio (Admin-only). | Acesso restrito ao Admin. |

### Fluxos de Geração

1.  **Seleção de Modelo:** O usuário escolhe um modelo em `/contratos/novo`.
2.  **Preenchimento de Tags:** Em `/contratos/preencher/:modeloId`, o sistema preenche automaticamente as tags de sistema (`{{CLIENTE_NOME}}`, `{{VALOR_TOTAL_CONTRATO}}`) e solicita o preenchimento das tags customizadas.
3.  **Geração de CR:** Ao salvar, o sistema:
    *   Cria/Atualiza o registro em `contratos_gerados`.
    *   Cria a conta sintética (`admin_contas_receber` ou `contas_receber`) e as parcelas correspondentes.
4.  **Assinatura:** O link gerado (`/contrato-link/:id`) redireciona para a página de assinatura (`/assinar-contrato/:id`), onde o cliente assina com nome e selfie, atualizando o status do contrato para `ativo`.

## 3. Módulo de Documentos Societários

Criação e gestão de documentos internos (Atas, Contratos Sociais, etc.).

### Tabelas Chave

| Tabela | Propósito | RLS |
| :--- | :--- | :--- |
| `blocos_societarios` | Blocos de conteúdo reutilizáveis. | Proprietário/Admin. |
| `modelos_societarios` | Templates de documentos (HTML/Texto). | Proprietário/Admin. |
| `documentos_societarios_gerados` | Documentos preenchidos e finalizados. | Proprietário/Admin. |

### Fluxos de Gestão

*   **Gerenciar Blocos (`/documentos-societarios/blocos`):** Permite a criação e edição de blocos de texto que podem ser inseridos nos modelos.
*   **Gerenciar Modelos (`/documentos-societarios/modelos`):** Permite a criação e edição de templates de documentos, utilizando tags de perfil e blocos de conteúdo.
*   **Geração de Documento (`/documentos-societarios/gerar/:modeloId`):** Fluxo para selecionar um cliente, preencher tags e editar o conteúdo principal, resultando em um registro em `documentos_societarios_gerados`.