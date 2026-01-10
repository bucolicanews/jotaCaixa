import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface RealizarPagamentoPagBankDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcelaId: string;
  valorParcela: number;
  descricao: string;
  onSuccess: () => void;
}

export function RealizarPagamentoPagBankDialog({
  open,
  onOpenChange,
  parcelaId,
  valorParcela,
  descricao,
  onSuccess,
}: RealizarPagamentoPagBankDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    holder: "",
    tax_id: "",
    bank: "",
    branch: "",
    account: "",
    account_type: "CHECKING",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.holder || !formData.tax_id || !formData.bank || !formData.branch || !formData.account) {
      toast({
        title: "Erro",
        description: "Todos os campos são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-pagbank-transfer", {
        body: {
          parcelaId,
          amount: valorParcela,
          description: descricao,
          holder: formData.holder,
          tax_id: formData.tax_id,
          bank: formData.bank,
          branch: formData.branch,
          account: formData.account,
          account_type: formData.account_type,
        },
      });

      if (error) throw error;

      toast({
        title: "Transferência realizada",
        description: "A transferência foi iniciada com sucesso",
      });

      setFormData({
        holder: "",
        tax_id: "",
        bank: "",
        branch: "",
        account: "",
        account_type: "CHECKING",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao realizar transferência:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao realizar transferência",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Realizar Pagamento via PagBank</DialogTitle>
          <DialogDescription>
            Preencha os dados bancários do favorecido para realizar a transferência
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="holder">Nome do Favorecido</Label>
            <Input
              id="holder"
              value={formData.holder}
              onChange={(e) => setFormData({ ...formData, holder: e.target.value })}
              placeholder="Nome completo"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax_id">CPF/CNPJ</Label>
            <Input
              id="tax_id"
              value={formData.tax_id}
              onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
              placeholder="00000000000"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank">Código do Banco</Label>
            <Input
              id="bank"
              value={formData.bank}
              onChange={(e) => setFormData({ ...formData, bank: e.target.value })}
              placeholder="000"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="branch">Agência</Label>
              <Input
                id="branch"
                value={formData.branch}
                onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                placeholder="0000"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account">Conta</Label>
              <Input
                id="account"
                value={formData.account}
                onChange={(e) => setFormData({ ...formData, account: e.target.value })}
                placeholder="00000-0"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account_type">Tipo de Conta</Label>
            <Select
              value={formData.account_type}
              onValueChange={(value) => setFormData({ ...formData, account_type: value })}
              disabled={loading}
            >
              <SelectTrigger id="account_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CHECKING">Conta Corrente</SelectItem>
                <SelectItem value="SAVINGS">Conta Poupança</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Realizar Transferência
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
