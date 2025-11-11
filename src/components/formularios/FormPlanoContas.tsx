import React from 'react';
import { PlanoContas } from '@/types/plano-contas';

interface NovaContaInicial {
    Conta: string;
    Analitica: 'Sim' | 'Não';
}

export interface FormPlanoContasProps {
    proprietarioId: string;
    initialData: PlanoContas | NovaContaInicial | null; // Incluindo a prop ausente
    onSaveSuccess: () => void;
    mascaraAtiva: string | null;
}

const FormPlanoContas: React.FC<FormPlanoContasProps> = ({ initialData }) => {
    // Implementação do formulário...
    return (
        <div>
            {/* Conteúdo do formulário */}
            <p>Formulário de Plano de Contas. Editando: {initialData?.Conta || 'Nova Conta'}</p>
        </div>
    );
};

export default FormPlanoContas;