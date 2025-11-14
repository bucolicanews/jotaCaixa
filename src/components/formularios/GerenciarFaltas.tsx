import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, XCircle, CheckCircle2, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { RegistroPonto } from '@/types/ponto';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '../ui/textarea';

type Acao = 'Falta' | 'Abono' | 'Nenhum';
type AbonoDecision = 'total' | 'partial' | null;
type AbonoHoras = '8h' | '6h' | '4h' | '2h'; // Removido '0h'

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
const ATESTADO_BUCKET = 'atestados'; 

// Função utilitária para extrair horas da observação (mantida para compatibilidade)
// REMOVIDA: const parseHorasObservacao = (observacao: string | null | undefined, defaultHours: number): number => {
//     if (!observacao) return defaultHours;
//     const match = observacao.match(/(\d+)h/);
//     if (match) {
//         return parseInt(match[1], 10);
//     }
//     return defaultHours;
// };


const GerenciarFaltas: React.FC<GerenciarFaltasProps> = ({ open, onOpenChange, funcionario, dataFalta, registroInicial, onFaltaRegistrada }) => {
  
  const [loading, setLoading] = useState(false);
  const [acao, setAcao] = useState<Acao>(registroInicial ? (registroInicial.tipo === 'Falta' ? 'Falta' : 'Abono') : 'Falta');
  const [horasSelecionadas, setHorasSelecionadas] = useState<AbonoHoras>('8h');
  const [atestadoFile, setAtestadoFile] = useState<File | null>(null);
  const [atestadoUrl, setAtestadoUrl] = useState<string | null>(registroInicial?.atestado_url || null);
  const [observacao, setObservacao] = useState(registroInicial?.observacao || '');
  
  // NOVOS ESTADOS PARA ABONO JUSTIFICADO
  const [abonoDecision, setAbonoDecision] = useState<AbonoDecision>(null);
  const [faltasHours, setFaltasHours] = useState(0);
  const [abonoHours, setAbonoHours] = useState(0);
  // const [showDecisionModal, setShowDecisionModal] = useState(false); // Removido TS6133

  const isEditing = !!registroInicial;
  const diaFormatado = dataFalta ? format(dataFalta, 'dd/MM/yyyy') : 'N/A';
  const isFalta = acao === 'Falta';
  const isAbono = acao === 'Abono';
  
  // Variável para verificar se o atestado está presente (URL ou File)
  const atestadoPronto = atestadoFile || atestadoUrl;
  const isJustified = isFalta && !!atestadoPronto;
  const isDecisionMade = isJustified && !!abonoDecision;
  
  // Determina a tabela de destino e a chave do proprietário
  const tabelaRegistros = funcionario.isFuncionarioAdmin ? 'admin_registros_ponto' : 'registros_ponto';
  const ownerKey = funcionario.isFuncionarioAdmin ? 'admin_id' : 'empresa_id';

  useEffect(() => {
    if (open) {
        let initialObs = registroInicial?.observacao || '';
        let initialHoras: AbonoHoras = '8h';
        
        if (registroInicial) {
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
        
        // Lógica de inicialização da decisão de abono
        if (registroInicial?.atestado_url) {
            if (registroInicial.observacao?.includes('Falta Total Abonada')) {
                setAbonoDecision('total');
                setFaltasHours(0);
                setAbonoHours(8);
            } else if (registroInicial.observacao?.includes('Falta Parcial Abonada')) {
                setAbonoDecision('partial');
                const match = registroInicial.observacao.match(/Faltas=(\d+)h, Abono=(\d+)h/);
                if (match) {
                    setFaltasHours(parseInt(match[1], 10));
                    setAbonoHours(parseInt(match[2], 10));
                }
            } else {
                // Se tem atestado mas não tem decisão, força a decisão
                setAbonoDecision(null);
            }
        } else {
            setAbonoDecision(null);
            setFaltasHours(0);
            setAbonoHours(0);
        }
    }
  }, [registroInicial, open]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setAtestadoFile(event.target.files[0]);
      setAtestadoUrl(null); // Se um novo arquivo é selecionado, remove o link existente
      
      // Se for Falta e um novo atestado for anexado, abre o modal de decisão
      if (acao === 'Falta') {
          // setShowDecisionModal(true); // Removido
          // Como o modal de decisão não é um componente separado, forçamos a decisão aqui
          setAbonoDecision(null); 
      }
    } else {
      setAtestadoFile(null);
    }
  };
  
  const handleRemoveAtestado = () => {
    setAtestadoFile(null);
    setAtestadoUrl(null);
    setAbonoDecision(null); // Limpa a decisão se o atestado for removido
    setObservacao('');
    showSuccess('Link do atestado removido. Salve para confirmar.');
  };
  
  const handleViewAtestado = () => {
      if (atestadoUrl) {
          window.open(atestadoUrl, '_blank');
      }
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
  
  // Handler para a decisão de abono (chamado pelo RadioGroup)
  const handleAbonoDecision = (decision: AbonoDecision) => {
      if (!decision) return;
      setAbonoDecision(decision);
      // setShowDecisionModal(false); // Removido
      
      if (decision === 'total') {
          setFaltasHours(0);
          setAbonoHours(8);
          setObservacao('Falta Total Abonada (8h)');
      } else if (decision === 'partial') {
          // Mantém os valores parciais existentes ou define 4h/4h como default
          if (faltasHours + abonoHours !== 8) {
              setFaltasHours(4);
              setAbonoHours(4);
          }
          setObservacao(`Falta Parcial Abonada. Faltas=${faltasHours}h, Abono=${abonoHours}h`);
      }
  };
  
  const handlePartialHoursChange = (type: 'faltas' | 'abono', value: number) => {
      const newValue = Math.min(8, Math.max(0, value));
      const remaining = 8 - newValue;
      
      let newFaltas = 0;
      let newAbono = 0;

      if (type === 'faltas') {
          newFaltas = newValue;
          newAbono = remaining;
      } else {
          newAbono = newValue;
          newFaltas = remaining;
      }
      
      setFaltasHours(newFaltas);
      setAbonoHours(newAbono);
      
      // Atualiza a observação imediatamente
      setObservacao(`Falta Parcial Abonada. Faltas=${newFaltas}h, Abono=${newAbono}h`);
  };
  
  // Determina o status de submissão
  const isReadyToSubmit = isAbono && horasSelecionadas || isJustified && isDecisionMade || isFalta && !isJustified;

  const handleSubmit = async () => {
    if (!dataFalta || !funcionario.id || !funcionario.empresa_id) {
      showError('Dados incompletos.');
      return;
    }
    
    if (isJustified && !isDecisionMade) {
        showError('Selecione se o abono é total ou parcial.');
        return;
    }
    
    if (isAbono && !horasSelecionadas) {
        showError('Selecione a quantidade de horas.');
        return;
    }

    setLoading(true);
    
    try {
      let finalAtestadoUrl = atestadoUrl;
      let tipoRegistro: 'Falta' | 'Abono' | 'Nenhum' = 'Nenhum';
      let observacaoFinal = observacao;
      
      // 1. Lidar com o upload do atestado
      if (isJustified && atestadoFile) {
          finalAtestadoUrl = await uploadAtestado(atestadoFile);
      }
      
      // 2. Determinar o tipo de registro e observação
      if (isJustified) {
          tipoRegistro = 'Falta'; // Registra como Falta, mas a observação define o abono
          
          if (abonoDecision === 'total') {
              observacaoFinal = 'Falta Total Abonada (8h)';
          } else if (abonoDecision === 'partial') {
              // Observação já foi atualizada em handlePartialHoursChange
              observacaoFinal = `Falta Parcial Abonada. Faltas=${faltasHours}h, Abono=${abonoHours}h`;
          }
          
      } else if (isFalta) {
          // Falta Injustificada
          tipoRegistro = 'Falta';
          observacaoFinal = observacao.trim() || 'Falta Injustificada';
          finalAtestadoUrl = null;
          
      } else if (isAbono) {
          // Abono Manual
          tipoRegistro = 'Abono';
          observacaoFinal = `Abono de ${horasSelecionadas}`;
          finalAtestadoUrl = null;
      }
      
      // 3. Deletar o registro inicial (se for edição)
      if (registroInicial) {
          const { error: deleteError } = await supabase
              .from(tabelaRegistros)
              .delete()
              .eq('id', registroInicial.id);
          if (deleteError) throw deleteError;
      }

      // 4. Inserir o novo registro
      if (tipoRegistro !== 'Nenhum') {
          const dataNoonUTC = new Date(Date.UTC(dataFalta.getFullYear(), dataFalta.getMonth(), dataFalta.getDate(), 12, 0, 0));
          
          const dataToInsert = {
            funcionario_id: funcionario.id,
            [ownerKey]: funcionario.empresa_id,
            horario_registro: dataNoonUTC.toISOString(),
            tipo: tipoRegistro,
            selfie_url: 'N/A',
            maps_url: 'N/A',
            atestado_url: finalAtestadoUrl,
            observacao: observacaoFinal,
          };

          const { error: insertError } = await supabase
            .from(tabelaRegistros)
            .insert(dataToInsert);
                
          if (insertError) throw insertError;
      }

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

  return (
    <>
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
                <div className="flex items-center space-x-2"><RadioGroupItem value="Abono" id="abono" /><Label htmlFor="abono">Abono Manual</Label></div>
              </RadioGroup>
            </div>

            {/* Opções de Abono Manual */}
            {isAbono && (
              <div className="space-y-4 p-4 border rounded-md">
                <h4 className="font-semibold">Horas a Abonar</h4>
                <p className="text-sm text-muted-foreground">Selecione a quantidade de horas abonadas (será registrado como Abono).</p>
                <RadioGroup value={horasSelecionadas} onValueChange={(v: AbonoHoras) => { setHorasSelecionadas(v); setObservacao(`Abono de ${v}`); }} className="grid grid-cols-2 gap-4">
                  {['8h', '6h', '4h', '2h'].map(h => (
                      <div key={h} className="flex items-center space-x-2 border p-2 rounded-md">
                          <RadioGroupItem value={h} id={`horas-${h}`} />
                          <Label htmlFor={`horas-${h}`}>{h}</Label>
                      </div>
                  ))}
                </RadioGroup>
                
                <div className="space-y-2 pt-4 border-t">
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

            {/* Opções de Falta (Justificada ou Injustificada) */}
            {isFalta && (
              <div className="space-y-4 p-4 border rounded-md">
                <h4 className="font-semibold">Detalhes da Falta</h4>
                
                {/* Atestado Upload/View */}
                <div className="space-y-2 pt-4 border-t">
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
                              {atestadoFile ? `Novo arquivo: ${atestadoFile.name}` : 'Atestado anexado.'}
                          </p>
                          <div className="flex space-x-2">
                              <Button variant="link" size="sm" onClick={handleViewAtestado} className="h-auto p-0 text-blue-500 hover:text-blue-700" disabled={!atestadoUrl}>
                                  <Eye className="w-4 h-4 mr-1" /> Visualizar
                              </Button>
                              <Button variant="link" size="sm" onClick={handleRemoveAtestado} className="h-auto p-0 text-red-500 hover:text-red-700">
                                  <XCircle className="w-4 h-4 mr-1" /> Remover
                              </Button>
                          </div>
                      </div>
                  )}
                </div>
                
                {/* NOVO: Decisão de Abono (Aparece se houver atestado) */}
                {isJustified && (
                    <div className="space-y-4 pt-4 border-t">
                        <h4 className="font-semibold">Abono de Atestado (8h)</h4>
                        <RadioGroup 
                            value={abonoDecision || ''} 
                            onValueChange={(v: string) => handleAbonoDecision(v as AbonoDecision)} 
                            className="flex space-x-4"
                        >
                            <div className="flex items-center space-x-2"><RadioGroupItem value="total" id="abono-total" /><Label htmlFor="abono-total">Total (8h Abono)</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="partial" id="abono-parcial" /><Label htmlFor="abono-parcial">Parcial</Label></div>
                        </RadioGroup>
                        
                        {abonoDecision === 'partial' && (
                            <div className="grid grid-cols-2 gap-4 p-3 bg-secondary rounded-md">
                                <div className="space-y-1">
                                    <Label htmlFor="faltas-h">Horas de Falta (0-8h)</Label>
                                    <Input 
                                        id="faltas-h"
                                        type="number"
                                        min={0}
                                        max={8}
                                        value={faltasHours}
                                        onChange={(e) => handlePartialHoursChange('faltas', parseInt(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="abono-h">Horas de Abono (0-8h)</Label>
                                    <Input 
                                        id="abono-h"
                                        type="number"
                                        min={0}
                                        max={8}
                                        value={abonoHours}
                                        onChange={(e) => handlePartialHoursChange('abono', parseInt(e.target.value) || 0)}
                                    />
                                </div>
                                <p className={cn("text-sm col-span-2", faltasHours + abonoHours === 8 ? 'text-green-600' : 'text-red-600')}>
                                    Soma: {faltasHours + abonoHours}h (Deve ser 8h)
                                </p>
                            </div>
                        )}
                    </div>
                )}
                
                {/* Observação (Aparece se não for justificada OU se a decisão for feita) */}
                {(!isJustified || isDecisionMade) && (
                    <div className="space-y-2">
                        <Label htmlFor="observacao">Observação (Motivo da Falta)</Label>
                        <Textarea 
                            id="observacao"
                            value={observacao}
                            onChange={(e) => setObservacao(e.target.value)}
                            placeholder="Ex: Motivo pessoal, sem atestado."
                            disabled={loading || isJustified} // Bloqueia se for justificada (observação é automática)
                        />
                    </div>
                )}
              </div>
            )}
          </div>

          <Button 
            onClick={handleSubmit} 
            disabled={loading || !isReadyToSubmit}
            className="w-full"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isEditing ? 'Salvar Edição' : `Confirmar Registro`)}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default GerenciarFaltas;