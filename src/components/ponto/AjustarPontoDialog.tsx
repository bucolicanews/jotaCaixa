import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { RegistroPonto } from '@/types/ponto';
import { format, parseISO, setHours, setMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// import { useSessao } from '@/hooks/use-sessao'; // Removido

interface AjustarPontoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funcionario: { id: string, nome: string, empresa_id: string, isFuncionarioAdmin: boolean }; // NOVO CAMPO
  dia: Date;
  registrosIniciais: RegistroPonto[];
  onSaveComplete: () => void;
}

interface RegistroLocal {
    id: string;
    horario: string; // HH:mm
    tipo: 'Entrada' | 'Saida';
    isNew: boolean;
}

const AjustarPontoDialog: React.FC<AjustarPontoDialogProps> = ({ open, onOpenChange, funcionario, dia, registrosIniciais, onSaveComplete }) => {
  const [loading, setLoading] = useState(false);
  const [registrosLocais, setRegistrosLocais] = useState<RegistroLocal[]>([]);
  const diaFormatado = format(dia, 'dd/MM/yyyy');
  
  // Determina a tabela de destino e a chave do proprietário
  const tabelaRegistros = funcionario.isFuncionarioAdmin ? 'admin_registros_ponto' : 'registros_ponto';
  const ownerKey = funcionario.isFuncionarioAdmin ? 'admin_id' : 'empresa_id';

  useEffect(() => {
    if (open) {
      // Mapeia apenas registros de Entrada/Saída para edição
      const mapped: RegistroLocal[] = registrosIniciais
        .filter((r): r is RegistroPonto & { tipo: 'Entrada' | 'Saida' } => r.tipo === 'Entrada' || r.tipo === 'Saida')
        .map(r => ({
          id: r.id,
          horario: format(parseISO(r.horario_registro), 'HH:mm'),
          tipo: r.tipo,
          isNew: false,
        }))
        .sort((a, b) => a.horario.localeCompare(b.horario));
      
      setRegistrosLocais(mapped);
    }
  }, [open, registrosIniciais]);

  const handleAddRegistro = () => {
    const newId = `new-${Date.now()}`;
    const newRegistro: RegistroLocal = {
      id: newId,
      horario: format(new Date(), 'HH:mm'),
      tipo: registrosLocais.length % 2 === 0 ? 'Entrada' : 'Saida',
      isNew: true,
    };
    setRegistrosLocais(prev => [...prev, newRegistro].sort((a, b) => a.horario.localeCompare(b.horario)));
  };

  const handleRemoveRegistro = (id: string) => {
    setRegistrosLocais(prev => prev.filter(r => r.id !== id));
  };

  const handleHorarioChange = (id: string, novoHorario: string) => {
    setRegistrosLocais(prev => 
      prev.map(r => r.id === id ? { ...r, horario: novoHorario } : r)
    );
  };
  
  const handleTipoChange = (id: string, novoTipo: 'Entrada' | 'Saida') => {
    setRegistrosLocais(prev => 
      prev.map(r => r.id === id ? { ...r, tipo: novoTipo } : r)
    );
  };

  const handleSubmit = async () => {
    setLoading(true);
    
    // 1. Validação básica
    if (registrosLocais.length === 0) {
        showError('Adicione pelo menos um registro.');
        setLoading(false);
        return;
    }
    
    // 2. Preparar dados para o banco
    const registrosParaSalvar = registrosLocais.map(r => {
        const [hours, minutes] = r.horario.split(':').map(Number);
        let dataHora = setMinutes(setHours(dia, hours), minutes);
        
        return {
            funcionario_id: funcionario.id,
            [ownerKey]: funcionario.empresa_id, // empresa_id ou admin_id
            horario_registro: dataHora.toISOString(),
            tipo: r.tipo,
            selfie_url: 'Ajuste Manual',
            maps_url: 'Ajuste Manual',
            atestado_url: null,
            observacao: 'Ajuste manual do gestor',
        };
    });
    
    try {
        // 3. Deletar todos os registros de Entrada/Saída existentes para este dia
        const registrosExistentesIds = registrosIniciais
            .filter(r => r.tipo === 'Entrada' || r.tipo === 'Saida')
            .map(r => r.id);
            
        if (registrosExistentesIds.length > 0) {
            const { error: deleteError } = await supabase
                .from(tabelaRegistros) // ROTEAMENTO AQUI
                .delete()
                .in('id', registrosExistentesIds);
            if (deleteError) throw deleteError;
        }
        
        // 4. Inserir os novos/ajustados registros
        const { error: insertError } = await supabase
            .from(tabelaRegistros) // ROTEAMENTO AQUI
            .insert(registrosParaSalvar);
            
        if (insertError) throw insertError;

        showSuccess('Ponto ajustado com sucesso!');
        onSaveComplete();
        onOpenChange(false);

    } catch (error: any) {
        console.error('Erro ao ajustar ponto:', error);
        showError('Falha ao salvar ajustes: ' + error.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustar Ponto Manualmente</DialogTitle>
          <DialogDescription>
            Ajustando registros de <strong>{funcionario.nome}</strong> para o dia <strong>{diaFormatado}</strong>.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex justify-between items-center">
            <Label className="font-semibold">Registros de Entrada/Saída</Label>
            <Button type="button" variant="outline" size="sm" onClick={handleAddRegistro} disabled={loading}>
              <PlusCircle className="w-4 h-4 mr-2" /> Adicionar Registro
            </Button>
          </div>

          <div className="space-y-3">
            {registrosLocais.length === 0 && (
                <p className="text-center text-muted-foreground py-4 border rounded-md">Nenhum registro para este dia.</p>
            )}
            {registrosLocais.map((registro) => (
              <div key={registro.id} className="flex items-center space-x-3 p-2 border rounded-md bg-secondary/50">
                <div className="w-1/3">
                    <Select 
                        value={registro.tipo} 
                        onValueChange={(value: 'Entrada' | 'Saida') => handleTipoChange(registro.id, value)}
                        disabled={loading}
                    >
                        <SelectTrigger className={cn(registro.tipo === 'Entrada' ? 'border-green-500' : 'border-red-500')}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Entrada">Entrada</SelectItem>
                            <SelectItem value="Saida">Saída</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="w-1/3">
                  <Input
                    type="time"
                    value={registro.horario}
                    onChange={(e) => handleHorarioChange(registro.id, e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="w-1/3 text-right">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleRemoveRegistro(registro.id)}
                    disabled={loading}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Button 
          onClick={handleSubmit} 
          disabled={loading || registrosLocais.length === 0}
          className="w-full"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar Ajustes de Ponto'}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default AjustarPontoDialog;