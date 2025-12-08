import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { ExtratoMapeado } from '@/types/extrato';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { PlanoContas } from '@/types/plano-contas';

interface EditarMapeamentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extrato: ExtratoMapeado | null;
  onConfirmar: (extratoId: string, contaContabilId: string) => Promise<void>;
}

export const EditarMapeamentoDialog: React.FC<EditarMapeamentoDialogProps> = ({
  open,
  onOpenChange,
  extrato,
  onConfirmar,
}) => {
  const { usuario } = useSessao();
  const [contaContabilId, setContaContabilId] = useState<string>('');
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open && usuario?.id) {
      fetchContasContabeis();
    }
  }, [open, usuario?.id]);

  useEffect(() => {
    if (extrato) {
      setContaContabilId(extrato.conta_contabil_id || '');
    }
  }, [extrato]);

  useEffect(() => {
    if (!open) {
      setContaContabilId('');
    }
  }, [open]);

  const fetchContasContabeis = async () => {
    if (!usuario?.id) return;
    setCarregando(true);
    
    const { data } = await supabase
      .from('plano_contas')
      .select('id, Conta, Descricao')
      .eq('proprietario_id', usuario.id)
      .eq('Analitica', 'Sim')
      .order('Conta');
    
    setContasContabeis(data as PlanoContas[] || []);
    setCarregando(false);
  };

  const handleConfirmar = async () => {
    if (!extrato || !contaContabilId) return;
    
    setSalvando(true);
    await onConfirmar(extrato.id, contaContabilId);
    setSalvando(false);
    onOpenChange(false);
  };

  if (!extrato) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Conta Contabil</DialogTitle>
          <DialogDescription>
            Altere a conta contabil associada a este extrato mapeado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm"><span className="text-muted-foreground">Extrato:</span> {extrato.descricao}</p>
            <p className="text-sm mt-1"><span className="text-muted-foreground">Conta Atual:</span> {extrato.plano_contas ? `${extrato.plano_contas.Conta} - ${extrato.plano_contas.Descricao}` : 'Nenhuma'}</p>
          </div>

          <div className="space-y-2">
            <Label>Nova Conta Contabil</Label>
            {carregando ? (
              <div className="flex items-center py-2">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Carregando contas...
              </div>
            ) : (
              <Select value={contaContabilId} onValueChange={setContaContabilId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma conta contabil..." />
                </SelectTrigger>
                <SelectContent>
                  {contasContabeis.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.Conta} - {c.Descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={!contaContabilId || salvando}>
            {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
