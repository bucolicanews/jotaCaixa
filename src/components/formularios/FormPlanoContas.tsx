import React from 'react';
import { PlanoContas } from '@/types/plano-contas';

// Definindo o tipo para nova conta inicial (necessário para o initialData)
interface NovaContaInicial {
    Conta: string;
    Analitica: 'Sim' | 'Não';
}

// Exportando a interface de props para ser reconhecida pelo TypeScript
export interface FormPlanoContasProps {
    proprietarioId: string;
    initialData: PlanoContas | NovaContaInicial | null; // Corrigido para aceitar os tipos usados em PlanoContas.tsx
    onSaveSuccess: () => void;
    mascaraAtiva: string | null;
}

const FormPlanoContas: React.FC<FormPlanoContasProps> = ({ proprietarioId, initialData, onSaveSuccess, mascaraAtiva }) => {
    // Implementação do formulário (mantida como placeholder)
    return (
        <div className="space-y-4">
            <p>Formulário de Plano de Contas (Proprietário: {proprietarioId})</p>
            {/* ... lógica de formulário ... */}
        </div>
    );
};

export default FormPlanoContas;