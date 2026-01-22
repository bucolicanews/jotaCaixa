export function normalizarNome(nome: string): string {
  if (!nome) return '';
  
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function calcularDistanciaLevenshtein(str1: string, str2: string): number {
  const s1 = normalizarNome(str1);
  const s2 = normalizarNome(str2);
  
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  const matriz: number[][] = [];

  for (let i = 0; i <= s2.length; i++) {
    matriz[i] = [i];
  }

  for (let j = 0; j <= s1.length; j++) {
    matriz[0][j] = j;
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matriz[i][j] = matriz[i - 1][j - 1];
      } else {
        matriz[i][j] = Math.min(
          matriz[i - 1][j - 1] + 1,
          matriz[i][j - 1] + 1,
          matriz[i - 1][j] + 1
        );
      }
    }
  }

  return matriz[s2.length][s1.length];
}

export function calcularSimilaridade(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const s1 = normalizarNome(str1);
  const s2 = normalizarNome(str2);
  
  if (s1 === s2) return 100;
  if (s1.length === 0 || s2.length === 0) return 0;

  const distancia = calcularDistanciaLevenshtein(str1, str2);
  const maxLength = Math.max(s1.length, s2.length);
  
  const similaridade = ((maxLength - distancia) / maxLength) * 100;
  
  return Math.max(0, Math.min(100, similaridade));
}

export function verificarMatch(
  nome1: string, 
  nome2: string, 
  limiarSimilaridade: number = 80
): boolean {
  if (!nome1 || !nome2) return false;
  
  const similaridade = calcularSimilaridade(nome1, nome2);
  return similaridade >= limiarSimilaridade;
}

export function calcularSimilaridadeAvancada(str1: string, str2: string): number {
  const similaridadeLevenshtein = calcularSimilaridade(str1, str2);
  
  const s1Normalizado = normalizarNome(str1);
  const s2Normalizado = normalizarNome(str2);
  
  const palavras1 = s1Normalizado.split(' ').filter(p => p.length > 2);
  const palavras2 = s2Normalizado.split(' ').filter(p => p.length > 2);
  
  if (palavras1.length === 0 || palavras2.length === 0) {
    return similaridadeLevenshtein;
  }
  
  let matchesPalavras = 0;
  for (const p1 of palavras1) {
    for (const p2 of palavras2) {
      if (p1 === p2 || p1.includes(p2) || p2.includes(p1)) {
        matchesPalavras++;
        break;
      }
    }
  }
  
  const similaridadePalavras = (matchesPalavras / Math.max(palavras1.length, palavras2.length)) * 100;
  
  return (similaridadeLevenshtein * 0.6) + (similaridadePalavras * 0.4);
}
