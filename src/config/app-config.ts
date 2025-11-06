/**
 * URL base da aplicação.
 * Em desenvolvimento, usa o valor padrão (http://localhost:8080).
 * Em produção, deve ser configurado via variável de ambiente VITE_PUBLIC_BASE_URL.
 */
export const BASE_URL = import.meta.env.VITE_PUBLIC_BASE_URL || 'http://localhost:8080';