import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, XCircle, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type TipoAcao = 'falta_injustificada' | 'falta_justificada' | 'abono_8h' | 'abono_6h' | 'abono_4h';

interface GerenciarFaltasProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funcionario: { id: string, nome: string, empresa_id: string };
  dataFalta: Date;
  onFaltaRegistrada: () => void;
}

const GerenciarFaltas: React.FC<GerenciarFaltasProps> = ({ open, onOpenChange, funcionario, dataFalta, onFaltaRegistrada }) => {
  const [loading, setLoading] = useState(false);
  const [atestadoFile, setAtestadoFile] = useState<File | null>(null);
  const [acaoSelecionada, setAcaoSelecionada] = useState<TipoAcao>('falta_injustificada');

  const dataFormatada = format(dataFalta, 'dd/MM/yyyy');
  const isFaltaJustificada = acaoSelecionada === 'falta_justificada';
  const isAbono = acaoSelecionada.startsWith('abono');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setAtestadoFile(event.target.files[0]);
    } else {
      setAtestadoFile(null);
    }
  };

  const uploadAtestado = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const filePath = `${funcionario.id}/atestados/${format(dataFalta, 'yyyyMMdd')}-${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
      .from('documentos-admissao')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new Error('Falha ao fazer upload do atestado: ' + error.message);
    }

    const { data: publicUrlData } = supabase.storage.from('documentos-admissao').getPublicUrl(filePath);
    return publicUrlData.publicUrl;
  };

  const getAcaoLabel = (acao: TipoAcao) => {
    switch (acao) {
      case 'falta_injustificada': return 'Falta Injustificada';
      case 'falta_justificada': return 'Falta Justificada';
      case 'abono_8h': return 'Abono (8h)';
      case 'abono_6h': return 'Abono (6h)';
      case 'abono_4h': return 'Abono (4h)';
      default: return 'Ação';
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    let finalAtestadoUrl: string | null = null;
    let tipoRegistro: 'Falta' | 'Abono' = 'Falta';
    let observacao: string | null = null;

    try {
      if (isFaltaJustificada) {
        if (!atestadoFile) {
          showError('Selecione o atestado para justificar a falta.');
          setLoading(false);
          return;
        }
        finalAtestadoUrl = await uploadAtestado(atestadoFile);
      } else if (isAbono) {
        tipoRegistro = 'Abono';
        observacao = acaoSelecionada.split('_')[1]; // Ex: '8h', '6h', '4h'
      }

      // Se for Abono, o registro de ponto deve ser do tipo 'Abono'
      // Se for Falta (justificada ou injustificada), o tipo é 'Falta'
      
      const { error } = await supabase
        .from('registros_ponto')
        .insert({
          funcionario_id: funcionario.id,
          empresa_id: funcionario.empresa_id,
          horario_registro: format(dataFalta, 'yyyy-MM-dd') + 'T00:00:00Z', // Marca o início do dia
          tipo: tipoRegistro,
          selfie_url: 'N/A', // Não aplicável
          maps_url: 'N/A', // Não aplicável
          atestado_url: finalAtestadoUrl,
          observacao: observacao,
        });

      if (error) {
        throw new Error('Erro ao registrar ação: ' + error.message);
      }

      showSuccess(`Ação '${getAcaoLabel(acaoSelecionada)}' registrada para ${funcionario.nome} em ${dataFormatada}.`);
      onFaltaRegistrada();
      onOpenChange(false);

    } catch (error: any) {
      console.error('Erro ao gerenciar falta:', error);
      showError(error.message || 'Falha ao registrar a ação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Gerenciar Dia Sem Registro</DialogTitle>
          <DialogDescription>
            Selecione a ação para <strong>{funcionario.nome}</strong> em <strong>{dataFormatada}</strong>.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <Label className="font-semibold">1. Selecione a Ação</Label>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Button 
              variant={acaoSelecionada === 'falta_injustificada' ? 'destructive' : 'outline'} 
              onClick={() => setAcaoSelecionada('falta_injustificada')}
              className="flex-1"
            >
              Falta Injustificada
            </Button>
            <Button 
              variant={isFaltaJustificada ? 'default' : 'outline'} 
              onClick={() => setAcaoSelecionada('falta_justificada')}
              className="flex-1"
            >
              Falta Justificada
            </Button>
            <Button 
              variant={acaoSelecionada === 'abono_8h' ? 'default' : 'outline'} 
              onClick={() => setAcaoSelecionada('abono_8h')}
              className="flex-1 flex items-center"
            >
              <Clock className="w-4 h-4 mr-1" /> Abono 8h
            </Button>
            <Button 
              variant={acaoSelecionada === 'abono_6h' ? 'default' : 'outline'} 
              onClick={() => setAcaoSelecionada('abono_6h')}
              className="flex-1 flex items-center"
            >
              <Clock className="w-4 h-4 mr-1" /> Abono 6h
            </Button>
            <Button 
              variant={acaoSelecionada === 'abono_4h' ? 'default' : 'outline'} 
              onClick={() => setAcaoSelecionada('abono_4h')}
              className="flex-1 flex items-center"
            >
              <Clock className="w-4 h-4 mr-1" /> Abono 4h
            </Button>
          </div>

          {isFaltaJustificada && (
            <div className="space-y-2 border p-3 rounded-md">
              <Label htmlFor="atestado-file" className="font-semibold flex items-center">
                <FileText className="w-4 h-4 mr-2" /> 2. Anexar Atestado
              </Label>
              <Input 
                id="atestado-file" 
                type="file" 
                accept="image/*, application/pdf" 
                onChange={handleFileChange} 
                disabled={loading}
              />
              {atestadoFile && (
                <p className={cn("text-sm flex items-center", atestadoFile ? "text-green-600" : "text-red-500")}>
                    {atestadoFile ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <XCircle className="w-4 h-4 mr-1" />}
                    {atestadoFile ? `Arquivo pronto: ${atestadoFile.name}` : 'Nenhum arquivo selecionado.'}
                </p>
              )}
            </div>
          )}
          
          {isAbono && (
            <div className="p-3 bg-blue-100 dark:bg-blue-900/20 border border-blue-500 rounded-md text-sm text-blue-600 dark:text-blue-400">
                Ao confirmar, o sistema considerará que o funcionário trabalhou {acaoSelecionada.split('_')[1]} neste dia para fins de cálculo de folha.
            </div>
          )}
        </div>

        <Button 
          onClick={handleRegister} 
          disabled={loading || (isFaltaJustificada && !atestadoFile)}
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : `Confirmar ${getAcaoLabel(acaoSelecionada)}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default GerenciarFaltas;