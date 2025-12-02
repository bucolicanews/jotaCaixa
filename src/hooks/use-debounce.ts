import { useState, useEffect } from 'react';

/**
 * Hook que retorna um valor 'debounced' (atrasado).
 * Útil para atrasar chamadas de API ou operações caras até que o usuário pare de digitar.
 * 
 * @param value O valor a ser debounced (geralmente o valor de um input).
 * @param delay O atraso em milissegundos (padrão: 500ms).
 * @returns O valor debounced.
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Configura um timer para atualizar o valor debounced
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Limpa o timer anterior se o valor mudar antes do delay
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}