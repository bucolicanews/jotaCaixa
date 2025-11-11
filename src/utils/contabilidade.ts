/**
 * Função de validação da máscara de código contábil.
 * Verifica se o código da conta segue a estrutura definida pela máscara (ex: 0.0.00.0000).
 * @param code Código da conta (ex: 1.1.01.0001)
 * @param mask Máscara (ex: 0.0.00.0000)
 * @returns true se o código for válido, false caso contrário.
 */
export const validateMask = (code: string, mask: string): boolean => {
    if (!mask) return true; // Se não houver máscara, a validação passa
    
    const codeParts = code.split('.');
    const maskParts = mask.split('.');
    
    // 1. Verifica se o número de níveis é o mesmo
    if (codeParts.length !== maskParts.length) {
        return false;
    }
    
    for (let i = 0; i < codeParts.length; i++) {
        const codeSegment = codeParts[i];
        const maskSegment = maskParts[i];
        
        // 2. Verifica se o comprimento do segmento é o mesmo
        if (codeSegment.length !== maskSegment.length) {
            return false;
        }
        
        // 3. Verifica se o segmento contém apenas dígitos
        if (!/^\d+$/.test(codeSegment)) {
            return false;
        }
    }
    
    return true;
};