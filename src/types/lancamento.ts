export interface Lancamento {
  id: string;
  proprietario_id: string;
  data_movimentacao: string;
  descricao: string;
  valor: number; // Valor absoluto (positivo)
  tipo: 'Entrada' | 'Saida'; // Débito ou Crédito (depende da natureza da conta)
  conta_bancaria_id: string | null;
  conta_contabil_id: string | null;
  conciliado: boolean;
  origem: string;
  documento: string | null;
  historico_id: string | null;
  conta_resultado_id: string | null; // ID do lançamento de partida dobrada
}