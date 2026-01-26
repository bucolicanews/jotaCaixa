// Função compartilhada para calcular juros e multa
// Baseado nas regras brasileiras padrão

interface CalculoJurosMulta {
  valorOriginal: number;
  dataVencimento: string;
  percentualMulta: number; // Ex: 2.00 para 2%
  percentualJurosMes: number; // Ex: 1.00 para 1% ao mês
}

interface ResultadoCalculo {
  diasAtraso: number;
  valorMulta: number;
  valorJuros: number;
  valorTotal: number;
  dataCalculo: string;
}

export function calcularJurosMulta(params: CalculoJurosMulta): ResultadoCalculo {
  const hoje = new Date();
  const vencimento = new Date(params.dataVencimento);
  
  // Zerar horas para comparação apenas de datas
  hoje.setHours(0, 0, 0, 0);
  vencimento.setHours(0, 0, 0, 0);
  
  const diasAtraso = Math.floor((hoje.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diasAtraso <= 0) {
    return {
      diasAtraso: 0,
      valorMulta: 0,
      valorJuros: 0,
      valorTotal: params.valorOriginal,
      dataCalculo: hoje.toISOString()
    };
  }
  
  // Calcular multa (aplicada no 1º dia de atraso)
  const valorMulta = params.valorOriginal * (params.percentualMulta / 100);
  
  // Calcular juros diários (pro-rata)
  const jurosDiario = (params.percentualJurosMes / 30) / 100; // Converter mês para dia
  const valorJuros = params.valorOriginal * jurosDiario * diasAtraso;
  
  const valorTotal = params.valorOriginal + valorMulta + valorJuros;
  
  return {
    diasAtraso,
    valorMulta: parseFloat(valorMulta.toFixed(2)),
    valorJuros: parseFloat(valorJuros.toFixed(2)),
    valorTotal: parseFloat(valorTotal.toFixed(2)),
    dataCalculo: hoje.toISOString()
  };
}

export function formatarInstrucoesBoleto(config: {
  percentualMulta: number;
  percentualJurosMes: number;
}): string[] {
  const jurosDiario = (config.percentualJurosMes / 30).toFixed(3);
  
  return [
    `Após vencimento: Multa de ${config.percentualMulta}%`,
    `Juros de ${jurosDiario}% ao dia (${config.percentualJurosMes}% ao mês)`
  ];
}
