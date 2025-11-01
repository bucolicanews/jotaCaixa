# 👥 Módulos de RH, Ponto Eletrônico e Contratos

## 1. Módulo de Ponto Eletrônico e Folha de Ponto

Sistema para registro e gestão da jornada de trabalho.

*   **Registro de Ponto (`/ponto-eletronico`):** Permite que o Usuário (Funcionário) registre Entrada/Saída com captura de selfie e geolocalização.
*   **Folha de Ponto (`/folha-ponto`):** Interface de gestão para Clientes/Admin, com funcionalidades como:
    *   Visualização detalhada da jornada mensal (horas trabalhadas, saldo, horas extras).
    *   Ajuste manual de registros.
    *   Gerenciamento de Faltas e Abonos.
    *   Gestão de Folgas Trabalhadas.

## 2. Módulo de Contratos

Sistema para criação e gestão de documentos dinâmicos.

*   **Gerenciamento de Tags (`/contratos/tags`):** Criação de tags dinâmicas customizadas que podem ser usadas nos modelos.
*   **Gerenciamento de Modelos (`/contratos/modelos`):** Criação e importação de templates de contrato (HTML ou Texto Simples).
*   **Geração de Contrato (`/contratos/preencher/:modeloId`):** Fluxo que permite:
    *   Selecionar um cliente.
    *   Preencher tags customizadas e dados financeiros (valor, parcelamento).
    *   Renderizar o contrato final.
    *   Gerar as Contas a Receber correspondentes no sistema financeiro.