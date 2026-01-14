import { FC } from 'react';
import { Protocolo } from '@/types/protocolo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Printer, MoreVertical, Share2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from '@/hooks/use-toast';
import { BASE_URL } from '@/config/app-config';

interface ProtocoloCardProps {
  protocolo: Protocolo & { tbl_clientes: { nome: string; razao_social: string; } | null };
}

const ProtocoloCard: FC<ProtocoloCardProps> = ({ protocolo }) => {
  const { toast } = useToast();

  const handleShare = () => {
    const link = `${BASE_URL}/protocolo/confirmar/${protocolo.id}`;
    navigator.clipboard.writeText(link);
    toast({
      title: "Link copiado!",
      description: "O link de confirmação foi copiado para a área de transferência.",
    });
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span className="text-lg font-semibold">{protocolo.numero_protocolo}</span>
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium px-2 py-1 rounded-full bg-blue-100 text-blue-800">
              {protocolo.status}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>
                  <FileText className="mr-2 h-4 w-4" />
                  <span>Detalhes</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleShare}>
                  <Share2 className="mr-2 h-4 w-4" />
                  <span>Compartilhar</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Printer className="mr-2 h-4 w-4" />
                  <span>Imprimir</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div>
          <p className="font-semibold">{protocolo.tbl_clientes?.razao_social || protocolo.tbl_clientes?.nome}</p>
          {protocolo.tbl_clientes?.razao_social && <p className="text-sm text-gray-500">{protocolo.tbl_clientes?.nome}</p>}
        </div>
      </CardContent>
    </Card>
  );
};

export default ProtocoloCard;