import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, FileSignature } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ContratoHeaderProps {
  title: string;
  isEditing: boolean;
}

const ContratoHeader: React.FC<ContratoHeaderProps> = ({ title, isEditing }) => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center mb-6">
      <Button 
          onClick={() => { navigate(-1); }} 
          variant="link" 
          type="button"
          className="text-muted-foreground hover:text-primary flex items-center mr-4 p-0 h-auto"
      >
          <ChevronLeft className="w-5 h-5" />
          Voltar
      </Button>
      <h1 className="text-2xl md:text-3xl font-bold flex items-center">
        <FileSignature className="w-6 h-6 mr-2" /> {isEditing ? 'Editar Contrato' : 'Preencher Contrato'}: {title}
      </h1>
    </div>
  );
};

export default ContratoHeader;