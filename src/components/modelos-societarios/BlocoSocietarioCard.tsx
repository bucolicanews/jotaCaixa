import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, Edit, Trash2 } from 'lucide-react';
import { BlocoSocietario } from '@/types/documentos-societarios';
import { Button } from '@/components/ui/button';
import { showSuccess } from '@/utils/toast';

interface BlocoSocietarioCardProps {
  bloco: BlocoSocietario;
  onEdit: () => void;
  onDelete: () => void;
  canManage: boolean;
}

const BlocoSocietarioCard: React.FC<BlocoSocietarioCardProps> = ({ bloco, onEdit, onDelete, canManage }) => {
  
  const handleCopy = () => {
    navigator.clipboard.writeText(bloco.conteudo);
    showSuccess(`Conteúdo do bloco '${bloco.titulo}' copiado!`);
  };
  
  return (
    <Card className="flex flex-col h-full hover:shadow-lg transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex justify-between items-center">
          {bloco.titulo}
          <div className="flex space-x-1">
              <Button variant="ghost" size="icon" onClick={handleCopy} title="Copiar Conteúdo">
                  <Copy className="w-4 h-4" />
              </Button>
              {canManage && (
                  <>
                      <Button variant="ghost" size="icon" onClick={onEdit} title="Editar Bloco">
                          <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={onDelete} title="Excluir Bloco">
                          <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                  </>
              )}
          </div>
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