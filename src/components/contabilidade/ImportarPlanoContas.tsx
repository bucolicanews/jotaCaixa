import React from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';

// Exportando a interface de props para ser reconhecida pelo TypeScript
export interface ImportarPlanoContasProps {
    proprietarioId: string; // Corrigido para incluir proprietarioId
    onImportComplete: () => void;
}

const ImportarPlanoContas: React.FC<ImportarPlanoContasProps> = ({ proprietarioId, onImportComplete }) => {
    // Implementação da lógica de importação (mantida como placeholder)
    const handleImport = () => {
        // Lógica de importação...
        console.log(`Iniciando importação para proprietário: ${proprietarioId}`);
        // Simulação de sucesso
        onImportComplete();
    };

    return (
        <Button size="sm" className="h-8 gap-1" onClick={handleImport}>
            <PlusCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Importar</span>
        </Button>
    );
};

export default ImportarPlanoContas;