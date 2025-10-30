import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, XCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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
  const [tipoFalta, setTipoFalta] = useState<'justificada' | 'injustificada'>('injustificada');

  const dataFormatada = format(dataFalta, 'dd/MM/yyyy');

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
      .from('documentos-admissao') // Reutilizando o bucket de documentos
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

  const handleRegisterFalta = async () => {
    setLoading(true);
    let finalAtestadoUrl: string | null = null;

    try {
      if (tipoFalta === 'justificada' && !atestadoFile) {
        showError('Selecione o atestado para justificar a falta.');
        setLoading(false);
        return;
      }

      if (atestadoFile) {
        finalAtestadoUrl = await uploadAtestado(atestadoFile);
      }

      // O registro de falta é feito inserindo um registro de ponto especial
      // que marca o dia como 'Falta' ou 'Falta Justificada'.
      // Usaremos o tipo 'Falta' e a coluna atestado_url para diferenciar.
      
      const { error } = await supabase
        .from('registros_ponto')
        .insert({
          funcionario_id: funcionario.id,
          empresa_id: funcionario.empresa_id,
          horario_registro: format(dataFalta, 'yyyy-MM-dd') + 'T00:00:00Z', // Marca o início do dia
          tipo: 'Falta',
          selfie_url: 'N/A', // Não aplicável
          maps_url: 'N/A', // Não aplicável
          atestado_url: finalAtestadoUrl,
        });

      if (error) {
        throw new Error('Erro ao registrar falta: ' + error.message);
      }

      showSuccess(`Falta ${tipoFalta} registrada para ${funcionario.nome} em ${dataFormatada}.`);
      onFaltaRegistrada();
      onOpenChange(false);

    } catch (error: any) {
      console.error('Erro ao gerenciar falta:', error);
      showError(error.message || 'Falha ao registrar a falta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Gerenciar Falta</DialogTitle>
          <DialogDescription>
            Registrar falta para <strong>{funcionario.nome}</strong> em <strong>{dataFormatada}</strong>.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex space-x-4">
            <Button 
              variant={tipoFalta === 'injustificada' ? 'destructive' : 'outline'} 
              onClick={() => setTipoFalta('injustificada')}
              className="flex-1"
            >
              Falta Injustificada
            </Button>
            <Button 
              variant={tipoFalta === 'justificada' ? 'default' : 'outline'} 
              onClick={() => setTipoFalta('justificada')}
              className="flex-1"
            >
              Falta Justificada
            </Button>
          </div>

          {tipoFalta === 'justificada' && (
            <div className="space-y-2 border p-3 rounded-md">
              <Label htmlFor="atestado-file" className="font-semibold flex items-center">
                <FileText className="w-4 h-4 mr-2" /> Anexar Atestado
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
        </div>

        <Button onClick={handleRegisterFalta} disabled={loading || (tipoFalta === 'justificada' && !atestadoFile)}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : `Confirmar Falta ${tipoFalta === 'justificada' ? 'Justificada' : 'Injustificada'}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default GerenciarFaltas;