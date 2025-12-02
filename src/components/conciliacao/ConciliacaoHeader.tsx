import React from 'react';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';

interface ConciliacaoHeaderProps {
  onReset: () => void;
}

const ConciliacaoHeader: React.FC<ConciliacaoHeaderProps> = ({ onReset }) => {
  return (
    <div className="flex justify-between items-center mb-6">
      <h1 className="text-2xl md:text-3xl font-bold">Conciliação Bancária</h1>
      <Button variant="outline" onClick={onReset}>
        <Settings className="w-4 h-4 mr-2" /> Reiniciar
      </Button>
    </div>
  );
};

export default ConciliacaoHeader;