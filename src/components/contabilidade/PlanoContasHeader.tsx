import React from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import ImportarPlanoContas from './ImportarPlanoContas';

interface PlanoContasHeaderProps {
    onNewAccount: () => void;
    onImportComplete: () => void;
}

const PlanoContasHeader: React.FC<PlanoContasHeaderProps> = ({ onNewAccount, onImportComplete }) => {
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <h1 className="text-2xl md:text-3xl font-bold">Plano de Contas</h1>
                <div className="space-x-2 w-full sm:w-auto">
                    <Button onClick={onNewAccount} className="w-full sm:w-auto">
                        <PlusCircle className="w-4 h-4 mr-2" />
                        Nova Conta
                    </Button>
                </div>
            </div>
            <ImportarPlanoContas onImportComplete={onImportComplete} />
        </div>
    );
};

export default PlanoContasHeader;