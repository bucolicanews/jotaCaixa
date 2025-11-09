import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy } from 'lucide-react';
import { BlocoSocietario } from '@/types/documentos-societarios';
import { Button } from '@/components/ui/button';
import { showSuccess } from '@/utils/toast';

interface BlocoSocietarioCardProps {
  bloco: BlocoSocietario;
}

const BlocoSocietarioCard: React.FC<BlocoSocietarioCardProps> = ({ bloco }) => {
  
  const handleCopy = () => {
    navigator.clipboard.writeText(bloco.conteudo);
    showSuccess(`Conteúdo do bloco '${bloco.titulo}' copiado!`);
  };
  
  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex justify-between items-center">
          {bloco.titulo}
          <Button variant="ghost" size="icon" onClick={handleCopy} title="Copiar Conteúdo">
            <Copy className="w-4 h-4" />
          </Button>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{bloco.tipo_bloco || 'Bloco Padrão'}</p>
      </CardHeader>
      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground line-clamp-3">
          {bloco.conteudo.substring(0, 100)}...
        </p>
      </CardContent>
    </Card>
  );
};

export default BlocoSocietarioCard;