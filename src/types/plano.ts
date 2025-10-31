export interface Plano {
  id: string;
  nome: string;
  descricao: string | null;
  preco_mensal: number;
  dias_trial: number;
  permissoes: Record<string, boolean>;
  tipo_cliente: 'PF' | 'PJ';
  criado_em: string;
}