import { showError } from '@/utils/toast';

interface AddressData {
    logradouro: string;
    bairro: string;
    localidade: string;
    uf: string;
}

/**
 * Busca o endereço completo a partir de um CEP usando a API ViaCEP.
 * @param cep O CEP a ser consultado (apenas dígitos).
 * @returns Promise<AddressData | null>
 */
export const fetchAddressByCep = async (cep: string): Promise<AddressData | null> => {
    const cleanCep = cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) {
        return null;
    }
    
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();

        if (data.erro) {
            showError('CEP não encontrado.');
            return null;
        }

        return {
            logradouro: data.logradouro || '',
            bairro: data.bairro || '',
            localidade: data.localidade || '',
            uf: data.uf || '',
        };
        
    } catch (error) {
        console.error('Erro ao consultar ViaCEP:', error);
        showError('Falha ao consultar o CEP. Verifique sua conexão ou o serviço ViaCEP.');
        return null;
    }
};