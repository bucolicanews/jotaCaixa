export interface Plano {
  id: string;
  nome: string;
  descricao: string | null;
  preco_mensal: number;
  permissoes: Record<string, boolean>;
  tipo_cliente: 'PF' | 'PJ';
  criado_em: string;
  visivel_vendas: boolean;
}