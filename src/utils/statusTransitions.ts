/**
 * Define o workflow de transições de status de protocolos
 */

export type ProtocoloStatus = 'Criado' | 'Impresso' | 'Trânsito' | 'Entregue';

/**
 * Mapa de transições válidas
 * Key: Status atual
 * Value: Array de status permitidos para transição
 */
export const STATUS_WORKFLOW: Record<ProtocoloStatus, ProtocoloStatus[]> = {
  Criado: ['Impresso'],
  Impresso: ['Trânsito'],
  Trânsito: ['Entregue'],
  Entregue: [], // Estado final - sem transições
};

/**
 * Verifica se uma transição de status é válida
 */
export function canTransitionStatus(
  from: ProtocoloStatus,
  to: ProtocoloStatus
): boolean {
  const validTransitions = STATUS_WORKFLOW[from] || [];
  return validTransitions.includes(to);
}

/**
 * Retorna array de próximos status válidos para o status atual
 */
export function getValidNextStatuses(
  current: ProtocoloStatus
): ProtocoloStatus[] {
  return STATUS_WORKFLOW[current] || [];
}

/**
 * Retorna o próximo status na sequência (se houver apenas um)
 */
export function getNextStatus(
  current: ProtocoloStatus
): ProtocoloStatus | null {
  const validNext = STATUS_WORKFLOW[current];
  return validNext && validNext.length === 1 ? validNext[0] : null;
}

/**
 * Verifica se o status é final (não permite mais transições)
 */
export function isFinalStatus(status: ProtocoloStatus): boolean {
  return STATUS_WORKFLOW[status].length === 0;
}
