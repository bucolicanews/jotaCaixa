import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, XCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { RegistroPonto } from '@/types/ponto';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '../ui/textarea';

type Acao = 'Falta' | 'Abono' | 'Nenhum';
type AbonoHoras = '8h' | '6h' | '4h' | '2h';

interface FuncionarioGerenciado {
  id: string;
  nome: string;
  empresa_id: string; // ID do Cliente/Admin proprietário
  isFuncionarioAdmin: boolean; // NOVO CAMPO
}

interface GerenciarFaltasProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funcionario: FuncionarioGerenciado;
  dataFalta: Date | null;
  registroInicial: RegistroPonto | null; // Registro de Falta/Abono existente
  onFaltaRegistrada: () => void;
}

// Nome do bucket de armazenamento para atestados
const ATESTADO_BUCKET = 'documentos-admissao'; 

const GerenciarFaltas: React.FC<GerenciarFaltasProps> = ({ open, onOpenChange, funcionario, dataFalta, registroInicial, onFaltaRegistrada }) => {
  // const { perfil } = useSessao(); // Removido
  
  const [loading, setLoading] = useState(false);
  const [acao, setAcao] = useState<Acao>(registroInicial ? (registroInicial.tipo === 'Falta' ? 'Falta' : 'Abono') : 'Falta');
  const [horasSelecionadas, setHorasSelecionadas] = useState<AbonoHoras>('8h');
  const [atestadoFile, setAtestadoFile] = useState<File | null>(null);
  const [atestadoUrl, setAtestadoUrl] = useState<string | null>(registroInicial?.atestado_url || null);
  const [observacao, setObservacao] = useState(registroInicial?.observacao || '');

  const isEditing = !!registroInicial;
  const diaFormatado = dataFalta ? format(dataFalta, 'dd/MM/yyyy') : 'N/A';
  const isFalta = acao === 'Falta';
  const isAbono = acao === 'Abono';
  
  // Determina a tabela de destino e a chave do proprietário
  const tabelaRegistros = funcionario.isFuncionarioAdmin ? 'admin_registros_ponto' : 'registros_ponto';
  const ownerKey = funcionario.isFuncionarioAdmin ? 'admin_id' : 'empresa_id';

  useEffect(() => {
    if (open) {
        // Lógica de inicialização de Horas e Observação
        let initialObs = registroInicial?.observacao || '';
        let initialHoras: AbonoHoras = '8h';
        
        if (registroInicial) {
            // Tenta extrair as horas da observação (ex: "Falta Justificada (4h)")
            const match = registroInicial.observacao?.match(/(\d+)h/);
            if (match) {
                initialHoras = match[0] as AbonoHoras;
            }
        }
        
        setAcao(registroInicial ? (registroInicial.tipo === 'Falta' ? 'Falta' : 'Abono') : 'Falta');
        setAtestadoUrl(registroInicial?.atestado_url || null);
        setAtestadoFile(null);
        setHorasSelecionadas(initialHoras);
        setObservacao(initialObs);
    }
  }, [registroInicial, open]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setAtestadoFile(event.target.files[0]);
      setAtestadoUrl(null); // Se um novo arquivo é selecionado, remove o link existente
    } else {
      setAtestadoFile(null);
    }
  };
  
  const handleRemoveAtestado = () => {
    setAtestadoFile(null);
    setAtestadoUrl(null);
    showSuccess('Link do atestado removido. Salve para confirmar.');
  };

  const uploadAtestado = async (file: File): Promise<string> => {
    setLoading(true);
    
    const bucket = ATESTADO_BUCKET; 
    
    const fileExt = file.name.split('.').pop();
    const fileName = `faltas/${funcionario.id}/${format(dataFalta!, 'yyyyMMdd')}-${Date.now()}.${fileExt}`;
    
    try {
      const { data, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }
      
      // Obtém a URL pública
      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);
        
      showSuccess('Atestado enviado com sucesso!');
      return publicUrlData.publicUrl;
      
    } catch (error: any) {
      showError('Falha ao fazer upload do atestado: ' + error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!dataFalta || !funcionario.id || !funcionario.empresa_id) {
      showError('Dados incompletos.');
      return;
    }
    
    const isJustificada = isFalta && (atestadoUrl || atestadoFile);
    
    if (isFalta && !isJustificada && !window.confirm('Você está registrando uma Falta Injustificada. Deseja continuar?')) {
        return;
    }
    
    if ((isFalta || isAbono) && !horasSelecionadas) {
        showError('Selecione a quantidade de horas.');
        return;
    }

    setLoading(true);
    
    try {
      let finalAtestadoUrl = atestadoUrl;
      
      // 1. Lidar com o upload do atestado (se for falta justificada e houver novo arquivo)
      if (isFalta && atestadoFile) {
          finalAtestadoUrl = await uploadAtestado(atestadoFile);
      } else if (isAbono) {
          finalAtestadoUrl = null; // Abono não usa atestado
      }
      
      // 2. Deletar o registro inicial (se for edição)
      if (registroInicial) {
          const { error: deleteError } = await supabase
              .from(tabelaRegistros) // ROTEAMENTO AQUI
              .delete()
              .eq('id', registroInicial.id);
          if (deleteError) throw deleteError;
      }

      // 3. Inserir o novo registro (Falta ou Abono)
      const dataNoonUTC = new Date(Date.UTC(dataFalta.getFullYear(), dataFalta.getMonth(), dataFalta.getDate(), 12, 0, 0));
      
      const tipoRegistro = isFalta ? 'Falta' : (isAbono ? 'Abono' : 'Nenhum');
      
      if (tipoRegistro === 'Nenhum') {
          showSuccess('Ação cancelada. Nenhum registro inserido.');
          onFaltaRegistrada();
          onOpenChange(false);
          return;
      }
      
      // Observação final:
      let observacaoFinal = observacao;
      if (isAbono) {
          observacaoFinal = `${horasSelecionadas} de Abono`;
      } else if (isFalta) {
          // CORREÇÃO: Para falta, a observação deve incluir as horas selecionadas
          const horas = horasSelecionadas;
          if (isJustificada) {
              observacaoFinal = `Falta Justificada (${horas})`;
          } else {
              // Falta Injustificada: Inclui as horas para o cálculo de saldo
              observacaoFinal = `Falta Injustificada (${horas})`;
          }
      }

      const dataToInsert = {
        funcionario_id: funcionario.id,
        [ownerKey]: funcionario.empresa_id, // empresa_id ou admin_id
        horario_registro: dataNoonUTC.toISOString(),
        tipo: tipoRegistro,
        selfie_url: 'N/A',
        maps_url: 'N/A',
        atestado_url: finalAtestadoUrl,
        observacao: observacaoFinal,
      };

      const { error: insertError } = await supabase
        .from(tabelaRegistros) // ROTEAMENTO AQUI
        .insert(dataToInsert);
            
      if (insertError) throw insertError;

      showSuccess(`Registro de ${tipoRegistro} salvo com sucesso!`);
      onFaltaRegistrada();
      onOpenChange(false);

    } catch (error: any) {
      console.error('Erro ao gerenciar registro:', error);
      showError('Falha ao salvar registro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const atestadoPronto = atestadoFile || atestadoUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl">Gerenciar Ausência</DialogTitle>
          <DialogDescription>
            Funcionário: <strong>{funcionario.nome}</strong> | Dia: <strong>{diaFormatado}</strong>
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          
          {/* Seleção de Ação */}
          <div className="space-y-2">
            <Label className="font-semibold">Tipo de Registro</Label>
            <RadioGroup value={acao} onValueChange={(v: Acao) => setAcao(v)} className="flex space-x-4">
              <div className="flex items-center space-x-2"><RadioGroupItem value="Falta" id="falta" /><Label htmlFor="falta">Falta</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="Abono" id="abono" /><Label htmlFor="abono">Abono</Label></div>
            </RadioGroup>
          </div>

          {/* Opções de Horas (Comum a Falta Justificada e Abono) */}
          {(isFalta || isAbono) && (
            <div className="space-y-4 p-4 border rounded-md">
              <h4 className="font-semibold">Horas a Abonar/Justificar</h4>
              <p className="text-sm text-muted-foreground">Selecione a quantidade de horas.</p>
              <RadioGroup value={horasSelecionadas} onValueChange={(v: AbonoHoras) => setHorasSelecionadas(v)} className="grid grid-cols-2 gap-4">
                {['8h', '6h', '4h', '2h'].map(h => (
                    <div key={h} className="flex items-center space-x-2 border p-2 rounded-md">
                        <RadioGroupItem value={h} id={`horas-${h}`} />
                        <Label htmlFor={`horas-${h}`}>{h}</Label>
                    </div>
                ))}
              </RadioGroup>
            </div>
          )}

          {/* Opções de Falta */}
          {isFalta && (
            <div className="space-y-4 p-4 border rounded-md">
              <h4 className="font-semibold">Detalhes da Falta</h4>
              
              <div className="space-y-2">
                <Label htmlFor="atestado-file" className="flex items-center">
                    <FileText className="w-4 h-4 mr-2" /> Anexar Atestado Médico (Para Justificar)
                </Label>
                <Input 
                    id="atestado-file" 
                    type="file" 
                    accept="image/*, application/pdf" 
                    onChange={handleFileChange} 
                    disabled={loading} 
                />
                
                {atestadoPronto && (
                    <div className="flex justify-between items-center text-sm">
                        <p className={cn("flex items-center", atestadoPronto ? "text-green-600" : "text-red-500")}>
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            {atestadoFile ? `Novo arquivo: ${atestadoFile.name}` : 'Atestado já anexado.'}
                        </p>
                        <Button variant="link" size="sm" onClick={handleRemoveAtestado} className="h-auto p-0 text-red-500 hover:text-red-700">
                            <XCircle className="w-4 h-4 mr-1" /> Remover
                        </Button>
                    </div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="observacao">Observação (Motivo da Falta)</Label>
                <Textarea 
                    id="observacao"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Ex: Motivo pessoal, sem atestado."
                    disabled={loading}
                />
              </div>
            </div>
          )}

          {/* Opções de Abono */}
          {isAbono && (
            <div className="space-y-4 p-4 border rounded-md">
              <h4 className="font-semibold">Detalhes do Abono</h4>
              <div className="space-y-2">
                <Label htmlFor="observacao-abono">Observação (Opcional)</Label>
                <Textarea 
                    id="observacao-abono"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Ex: Abono por consulta médica."
                    disabled={loading}
                />
              </div>
            </div>
          )}
        </div>

        <Button 
          onClick={handleSubmit} 
          disabled={loading || (isFalta && !atestadoPronto && !window.confirm)}
          className="w-full"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isEditing ? 'Salvar Edição' : `Confirmar Registro`)}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default GerenciarFaltas;