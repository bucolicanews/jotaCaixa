import { showError } from '@/utils/toast';

interface AddressData {
    logradouro: string;
    bairro: string;
    localidade: string;
    uf: string;
}

/**
 * Fetches the full address from a CEP using BrasilAPI with a fallback to ViaCEP.
 * @param cep The CEP to be queried (digits only).
 * @returns Promise<AddressData | null>
 */
export const fetchAddressByCep = async (cep: string): Promise<AddressData | null> => {
    const cleanCep = cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) {
        return null;
    }

    // --- Primary Provider: BrasilAPI ---
    try {
        const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cleanCep}`);
        
        if (response.ok) {
            const data = await response.json();
            return {
                logradouro: data.street || '',
                bairro: data.neighborhood || '',
                localidade: data.city || '',
                uf: data.state || '',
            };
        }
        // If BrasilAPI fails (e.g., 404, 500), it will proceed to the catch block.
        if (response.status !== 404) { // Do not log 404 as a service error
          console.error('Erro na BrasilAPI:', response.statusText);
        }
    } catch (error) {
        console.error('Falha ao conectar com a BrasilAPI, tentando ViaCEP como fallback.', error);
    }
    
    // --- Fallback Provider: ViaCEP ---
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();

        if (data.erro) {
            showError('CEP não encontrado em nenhuma das fontes.');
            return null;
        }

        return {
            logradouro: data.logradouro || '',
            bairro: data.bairro || '',
            localidade: data.localidade || '',
            uf: data.uf || '',
        };
        
    } catch (error) {
        console.error('Erro ao consultar ViaCEP (fallback):', error);
        showError('Falha ao consultar o CEP. Verifique sua conexão e os serviços de CEP.');
        return null;
    }
};