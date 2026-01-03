
import { FC } from 'react';
import { useProtocolos, ProtocoloStatus } from '@/hooks/use-protocolos';
import ProtocoloCard from './ProtocoloCard';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const statusColumns: { title: string; status: ProtocoloStatus }[] = [
  { title: 'Impresso', status: 'Impresso' },
  { title: 'Em Trânsito', status: 'Trânsito' },
  { title: 'Entregue', status: 'Entregue' },
  { title: 'Cancelado', status: 'Cancelado' },
  { title: 'Com Problema', status: 'Problema' },
];

const ProtocoloKanbanView: FC = () => {
  const { protocolos, carregando } = useProtocolos();

  return (
    <div className="relative">
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex space-x-4 p-4">
          {statusColumns.map((col) => (
            <div key={col.status} className="flex-shrink-0 w-80">
              <div className="bg-gray-100 rounded-lg p-4 h-full">
                <h3 className="font-semibold mb-4">{col.title}</h3>
                {carregando ? (
                  <p>Carregando...</p>
                ) : (
                  protocolos
                    .filter((p) => p.status === col.status)
                    .map((protocolo) => (
                      <ProtocoloCard key={protocolo.id} protocolo={protocolo} />
                    ))
                )}
                 {protocolos.filter((p) => p.status === col.status).length === 0 && !carregando && (
                    <p className="text-sm text-gray-500">Nenhum protocolo nesta fase.</p>
                )}
              </div>
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};

export default ProtocoloKanbanView;
