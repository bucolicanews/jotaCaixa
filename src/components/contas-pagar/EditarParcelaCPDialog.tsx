import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ExtendedParcelaPagar } from '@/types/contas-pagar';

interface EditarParcelaCPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcela: ExtendedParcelaPagar;
  tabelaParcelas: string;
  onSaved: () => void;
}

const EditarParcelaCPDialog: React.FC<EditarParcelaCPDialogProps> = ({
  open,
  onOpenChange,
  parcela,
  tabelaParcelas,
  onSaved,
}) => {
  const [salvando, setSalvando] = useState(false);
  const [valores, setValores] = useState({
    data_vencimento: '',
    valor_parcela: '',
    numero_parcela: '',
  });

  useEffect(() => {
    if (open && parcela) {
      setValores({
        data_vencimento: parcela.data_vencimento?.split('T')[0] || '',
        valor_parcela: String(parcela.valor_parcela || ''),
        numero_parcela: String(parcela.numero_parcela || ''),
      });
    }
  }, [open, parcela]);

  const handleSalvar = async () => {
    const valorNum = parseFloat(valores.valor_parcela.replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
      showError('Informe um valor válido.');
      return;
    }
    if (!valores.data_vencimento) {
      showError('Informe a data de vencimento.');
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase
        .from(tabelaParcelas)
        .update({
          data_vencimento: valores.data_vencimento,
          valor_parcela: valorNum,
          numero_parcela: parseInt(valores.numero_parcela) || parcela.numero_parcela,
        })
        .eq('id', parcela.id);

      if (error) throw error;
      showSuccess('Parcela atualizada com sucesso.');
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      showError('Erro ao salvar: ' + error.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Editar Parcela {parcela.numero_parcela}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Número da Parcela</Label>
            <Input
              type="number"
              value={valores.numero_parcela}
              onChange={e => setValores(v => ({ ...v, numero_parcela: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data de Vencimento</Label>
            <Input
              type="date"
              value={valores.data_vencimento}
              onChange={e => setValores(v => ({ ...v, data_vencimento: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valor (R$)</Label>
            <Input
              value={valores.valor_parcela}
              onChange={e => setValores(v => ({ ...v, valor_parcela: e.target.value }))}
              placeholder="0,00"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={salvando}>
            {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditarParcelaCPDialog;
