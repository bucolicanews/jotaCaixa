import React from 'react';
import { Button } from '@/components/ui/button';
import { Eye, Save, Loader2 } from 'lucide-react';

interface ContratoAcoesRodapeProps {
    isEditing: boolean;
    isSubmitting: boolean;
    isReadyToSave: boolean;
    handlePreview: () => void;
    handleSalvarContrato: () => Promise<void>;
}

const ContratoAcoesRodape: React.FC<ContratoAcoesRodapeProps> = ({
    isEditing,
    isSubmitting,
    isReadyToSave,
    handlePreview,
    handleSalvarContrato,
}) => {
    return (
        <div className="lg:col-span-3 flex flex-col sm:flex-row gap-4">
            <Button 
                onClick={handlePreview} 
                variant="outline"
                className="flex-1 h-12"
                disabled={!isReadyToSave || isSubmitting}
            >
                <Eye className="mr-2 h-4 w-4" />
                Pré-visualizar Contrato
            </Button>
            <Button 
                onClick={handleSalvarContrato} 
                className="flex-1 h-12"
                disabled={isSubmitting || !isReadyToSave}
            >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isEditing ? 'Salvar Edição e Reajustar Contas' : 'Salvar e Gerar Contas a Receber'}
            </Button>
        </div>
    );
};

export default ContratoAcoesRodape;