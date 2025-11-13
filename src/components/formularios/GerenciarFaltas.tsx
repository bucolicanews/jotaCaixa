import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, XCircle, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { RegistroPonto } from '@/types/ponto';

type TipoAcao = 'falta_injustificada' | 'falta_justificada' | 'abono_8h' | 'abono_6h' | 'abono_4h';

interface GerenciarFaltasProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funcionario: { id: string, nome: string, empresa_id: string };
  dataFalta: Date;
  registroInicial: RegistroPonto | null; // Novo: Registro a ser editado
  onFaltaRegistrada: () => void;
}

const GerenciarFaltas: React.FC<GerenciarFaltasProps> = ({ open, onOpenChange, funcionario, dataFalta, registroInicial, onFaltaRegistrada }) => {
  const [loading, setLoading] = useState(false);
  const [atestadoFile, setAtestadoFile] = useState<File | null>(null);
  const [acaoSelecionada, setAcaoSelecionada] = useState<TipoAcao>('falta_injustificada');
  const [urlAtestadoExistente, setUrlAtestadoExistente] = useState<string | null>(null);

  const isEditing = !!registroInicial;
  const dataFormatada = format(dataFalta, 'dd/MM/yyyy');

  // Efeito para preencher o formulário se estiver em modo de edição
  useEffect(() => {
    if (registroInicial) {
      const { tipo, atestado_url, observacao } = registroInicial;
      
      if (tipo === 'Falta') {
        if (atestado_url) {
          setAcaoSelecionada('falta_justificada');
          setUrlAtestadoExistente(atestado_url);
        } else {
          setAcaoSelecionada('falta_injustificada');
          setUrlAtestadoExistente(null);
        }
      } else if (tipo === 'Abono' && observacao) {
        const horas = observacao.replace('h', '');
        // Garante que a ação selecionada corresponda ao abono existente
        const acaoExistente = `abono_${horas}h` as TipoAcao;
        if (['abono_8h', 'abono_6h', 'abono_4h'].includes(acaoExistente)) {
            setAcaoSelecionada(acaoExistente);
        } else {
            // Fallback se o observacao for inválido
            setAcaoSelecionada('abono_8h');
        }
        setUrlAtestadoExistente(null);
      }
    } else {
      // Resetar para criação
      setAcaoSelecionada('falta_injustificada');
      setUrlAtestadoExistente(null);
    }
    setAtestadoFile(null); // Sempre limpa o arquivo de upload
  }, [registroInicial, open]);

  const isFaltaJustificada = acaoSelecionada === 'falta_justificada';
  const isAbono = acaoSelecionada.startsWith('abono');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setAtestadoFile(event.target.files[0]);
      setUrlAtestadoExistente(null); // Se um novo arquivo é selecionado, remove o link existente
    } else {
      setAtestadoFile(null);
    }
  };
  
  const handleRemoveAtestado = () => {
    setAtestadoFile(null);
    setUrlAtestadoExistente(null);
    showSuccess('Link do atestado removido. Salve para confirmar.');
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
    let finalAtestadoUrl: string | null = urlAtestadoExistente;
    let tipoRegistro: 'Falta' | 'Abono' = 'Falta';
    let observacao: string | null = null;

    try {
      // 1. Lidar com o upload do atestado (se for justificada e houver novo arquivo)
      if (isFaltaJustificada) {
        if (atestadoFile) {
          finalAtestadoUrl = await uploadAtestado(atestadoFile);
        } else if (!finalAtestadoUrl) {
          showError('Selecione o atestado para justificar a falta.');
          setLoading(false);
          return;
        }
      } else {
        finalAtestadoUrl = null; // Garante que não haja atestado se não for falta justificada
      }
      
      // 2. Definir tipo e observação
      if (isAbono) {
        tipoRegistro = 'Abono';
        observacao = acaoSelecionada.split('_')[1]; // Ex: '8h', '6h', '4h'
      } else {
        tipoRegistro = 'Falta';
        observacao = null;
      }

      // --- CORREÇÃO DE FUSO HORÁRIO ---
      // Para registros de dia inteiro (Falta/Abono), salvamos o registro no meio do dia (12:00 UTC)
      // para evitar que o fuso horário local empurre a data para o dia anterior.
      const year = dataFalta.getFullYear();
      const month = dataFalta.getMonth();
      const day = dataFalta.getDate();
      const dataNoonUTC = new Date(Date.UTC(year, month, day, 12, 0, 0));
      const horarioRegistroISO = dataNoonUTC.toISOString();
      // ---------------------------------

      const dataToSave = {
        funcionario_id: funcionario.id,
        empresa_id: funcionario.empresa_id,
        horario_registro: horarioRegistroISO, 
        tipo: tipoRegistro,
        selfie_url: 'N/A',
        maps_url: 'N/A',
        atestado_url: finalAtestadoUrl,
        observacao: observacao,
      };

      let error = null;
      let successMessage = '';

      if (isEditing) {
        // EDICAO
        const result = await supabase
          .from('registros_ponto')
          .update(dataToSave)
          .eq('id', registroInicial!.id);
        error = result.error;
        successMessage = 'Registro atualizado com sucesso!';
      } else {
        // CRIACAO
        const result = await supabase
          .from('registros_ponto')
          .insert(dataToSave);
        error = result.error;
        successMessage = 'Registro criado com sucesso!';
      }

      if (error) {
        throw new Error('Erro ao salvar registro: ' + error.message);
      }

      showSuccess(successMessage);
      onFaltaRegistrada();
      onOpenChange(false);

    } catch (error: any) {
      console.error('Erro ao gerenciar registro:', error);
      showError(error.message || 'Falha ao salvar o registro.');
    } finally {
      setLoading(false);
    }
  };

  const atestadoPronto = atestadoFile || urlAtestadoExistente;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Registro' : 'Gerenciar Dia Sem Registro'}</DialogTitle>
          <DialogDescription>
            Ação para <strong>{funcionario.nome}</strong> em <strong>{dataFormatada}</strong>.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <Label className="font-semibold">1. Selecione a Ação</Label>
          <div className="flex flex-wrap justify-center gap-2">
            <Button 
              variant={acaoSelecionada === 'falta_injustificada' ? 'destructive' : 'outline'} 
              onClick={() => setAcaoSelecionada('falta_injustificada')}
              className="w-full sm:w-auto text-xs md:text-sm h-10"
            >
              Falta Injustificada
            </Button>
            <Button 
              variant={isFaltaJustificada ? 'default' : 'outline'} 
              onClick={() => setAcaoSelecionada('falta_justificada')}
              className="w-full sm:w-auto text-xs md:text-sm h-10"
            >
              Falta Justificada
            </Button>
            <Button 
              variant={acaoSelecionada === 'abono_8h' ? 'default' : 'outline'} 
              onClick={() => setAcaoSelecionada('abono_8h')}
              className="w-full sm:w-auto flex items-center justify-center text-xs md:text-sm h-10"
            >
              <Clock className="w-3 h-3 mr-1 md:w-4 md:h-4" /> Abono 8h
            </Button>
            <Button 
              variant={acaoSelecionada === 'abono_6h' ? 'default' : 'outline'} 
              onClick={() => setAcaoSelecionada('abono_6h')}
              className="w-full sm:w-auto flex items-center justify-center text-xs md:text-sm h-10"
            >
              <Clock className="w-3 h-3 mr-1 md:w-4 md:h-4" /> Abono 6h
            </Button>
            <Button 
              variant={acaoSelecionada === 'abono_4h' ? 'default' : 'outline'} 
              onClick={() => setAcaoSelecionada('abono_4h')}
              className="w-full sm:w-auto flex items-center justify-center text-xs md:text-sm h-10"
            >
              <Clock className="w-3 h-3 mr-1 md:w-4 md:h-4" /> Abono 4h
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
                disabled={loading || !!urlAtestadoExistente}
              />
              
              {atestadoPronto && (
                <div className="flex justify-between items-center text-sm">
                    <p className={cn("flex items-center", atestadoPronto ? "text-green-600" : "text-red-500")}>
                        {atestadoFile ? `Novo arquivo: ${atestadoFile.name}` : 'Atestado já anexado.'}
                    </p>
                    <div className="flex space-x-2">
                        {urlAtestadoExistente && (
                            <a href={urlAtestadoExistente} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                Visualizar
                            </a>
                        )}
                        <Button variant="ghost" size="sm" onClick={handleRemoveAtestado} className="h-auto p-0 text-red-500 hover:text-red-700">
                            <XCircle className="w-4 h-4 mr-1" /> Remover
                        </Button>
                    </div>
                </div>
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
          disabled={loading || (isFaltaJustificada && !atestadoPronto)}
          className="w-full"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isEditing ? 'Salvar Edição' : `Confirmar ${getAcaoLabel(acaoSelecionada)}`)}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default GerenciarFaltas;