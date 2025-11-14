// Adicione estas linhas no topo do arquivo, se estiverem faltando:
import { parseHorasObservacao } from '@/components/ponto/DetalheFolhaPonto'; 
// Importe RegistroPonto e defina a constante se não estiverem definidos
// import { RegistroPonto } from '@/types/ponto'; 
const JORNADA_DIARIA_PADRAO = 8; // 8 horas padrão CLT

// ... (No local onde o erro ocorreu, provavelmente dentro de uma função de cálculo/impressão)

                // Certifica que observacao é string | null
                if (registro.tipo === 'Abono') {
                    const horasCreditadas = parseHorasObservacao(registro.observacao ?? null, JORNADA_DIARIA_PADRAO);
                    minutosAbonados = Math.round(horasCreditadas * 60);
                }
// ...