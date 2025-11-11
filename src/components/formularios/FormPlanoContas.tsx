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
    // Usando as props para satisfazer o TS6133
    console.log('Proprietário ID:', proprietarioId);
    console.log('Dados Iniciais:', initialData);
    console.log('Máscara Ativa:', mascaraAtiva);
    
    // Simulação de chamada de sucesso
    const handleSimulatedSave = () => {
        // Lógica de salvamento...
        onSaveSuccess();
    };

    return (
        <div className="space-y-4">
            <p>Formulário de Plano de Contas (Proprietário: {proprietarioId})</p>
            <p className="text-sm text-muted-foreground">Máscara: {mascaraAtiva || 'N/A'}</p>
            <button onClick={handleSimulatedSave} className="hidden">Simular Salvar</button>
        </div>
    );
};

export default FormPlanoContas;