/**
 * URL base da aplicação.
 * Usa automaticamente a origem da URL atual (funciona em dev e produção).
 * Pode ser sobrescrito via variável de ambiente VITE_PUBLIC_BASE_URL se necessário.
 */
export const BASE_URL = import.meta.env.VITE_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080');