import React from 'react';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

export interface ImportarPlanoContasProps {
    proprietarioId: string; // Incluindo a prop ausente
    onImportComplete: () => void;
}

const ImportarPlanoContas: React.FC<ImportarPlanoContasProps> = ({ proprietarioId: _proprietarioId, onImportComplete }) => {
    // Lógica de importação usaria proprietarioId para scoping de dados.
    // console.log('Proprietário ID para importação:', proprietarioId); 
    
    return (
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={onImportComplete}>
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Importar</span>
        </Button>
    );
};

export default ImportarPlanoContas;