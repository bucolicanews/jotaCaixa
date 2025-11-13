import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MapPin, Clock, ArrowUpCircle, ArrowDownCircle, Camera, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import CameraCapture from '../CameraCapture';
import { UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import usePontoStatus from '@/hooks/use-ponto-status';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

type RegistroTipo = 'Entrada' | 'Saida';

interface GeoLocation {
  latitude: number;
  longitude: number;
}

const RegistroPonto: React.FC = () => {
  const { usuario, perfil, role } = useSessao();
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState<GeoLocation | null>(null);
  
  // State for camera capture
  const [selfieFile, setSelfieFile] = useState<File | null>(null); 
  
  // State for confirmation dialog
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [pendingRegistroType, setPendingRegistroType] = useState<RegistroTipo | null>(null);

  // CORREÇÃO: Determina o ID da empresa/proprietário
  const isUsuario = role === 'Usuario' && perfil && ('cliente_id' in perfil || 'admin_id' in perfil);
  
  const empresaId = isUsuario 
    ? (perfil as UsuarioProfile)?.cliente_id || (perfil as AdminUsuarioProfile)?.admin_id 
    : null;
    
  const funcionarioId = usuario?.id;
  
  // Hook para status do ponto
  const { ultimoRegistro, proximaAcao, alerta4Horas, carregando: carregandoStatus, refetch: refetchStatus } = usePontoStatus(funcionarioId);

  // Nova verificação de permissão
  const podeVisualizarProprioPonto = isUsuario && (perfil as UsuarioProfile)?.permissoes?.visualizar_proprio_ponto;

  const getGeoLocation = (): Promise<GeoLocation> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalização não suportada pelo seu navegador.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          reject(new Error(`Erro ao obter localização: ${error.message}`));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const uploadSelfie = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${funcionarioId}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
    const filePath = `${funcionarioId}/${fileName}`;

    const { error } = await supabase.storage
      .from('ponto-selfies')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error("LOG: Erro detalhado do Supabase Storage:", error);
      throw new Error('Falha ao fazer upload da selfie: ' + error.message);
    }

    const { data: publicUrlData } = supabase.storage.from('ponto-selfies').getPublicUrl(filePath);
    return publicUrlData.publicUrl;
  };

  const handleCapture = useCallback((file: File) => {
    setSelfieFile(file);
  }, []);

  const handleResetSelfie = useCallback(() => {
    setSelfieFile(null);
  }, []);

  const handlePreRegister = (tipo: RegistroTipo) => {
    if (!selfieFile) {
      showError('Por favor, capture uma selfie antes de registrar o ponto.');
      return;
    }
    
    // Regra 2: Verifica se a ação é a esperada
    if (tipo !== proximaAcao) {
        showError(`A próxima ação esperada é ${proximaAcao}, não ${tipo}.`);
        return;
    }

    setPendingRegistroType(tipo);
    setIsConfirmDialogOpen(true);
  };

  const registrarPonto = async (tipo: RegistroTipo) => {
    if (!funcionarioId || !empresaId || !selfieFile) {
      showError('Dados incompletos para registro.');
      return;
    }

    setLoading(true);
    try {
      const geo = await getGeoLocation();
      setLocation(geo);

      const selfieUrl = await uploadSelfie(selfieFile);
      
      // Constrói a URL do Google Maps
      const mapsUrl = `https://www.google.com/maps?q=${geo.latitude},${geo.longitude}`;

      const { error } = await supabase
        .from('registros_ponto')
        .insert({
          funcionario_id: funcionarioId,
          empresa_id: empresaId, // Usando o ID do Cliente ou Admin
          horario_registro: new Date().toISOString(),
          selfie_url: selfieUrl,
          tipo: tipo,
          latitude: geo.latitude,
          longitude: geo.longitude,
          maps_url: mapsUrl, // Salva a URL no banco de dados
        });

      if (error) {
        throw new Error('Erro ao registrar ponto: ' + error.message);
      }

      showSuccess(`Ponto de ${tipo} registrado com sucesso!`);
      
      // Força a atualização do status do ponto
      refetchStatus();
      
      setSelfieFile(null);

    } catch (error: any) {
      console.error('Erro no registro de ponto:', error);
      showError(error.message || 'Falha ao registrar o ponto.');
    } finally {
      setLoading(false);
      setPendingRegistroType(null);
      setIsConfirmDialogOpen(false);
    }
  };

  if (!isUsuario) {
    return (
      <Card className="w-full max-w-xl mx-auto">
        <CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader>
        <CardContent><p>Apenas usuários vinculados a uma empresa podem registrar o ponto.</p></CardContent>
      </Card>
    );
  }
  
  const isEntrada = proximaAcao === 'Entrada';
  const isSaida = proximaAcao === 'Saida';

  return (
    <Card className="w-full max-w-xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Clock className="w-6 h-6 mr-2" />
          Registro de Ponto Eletrônico
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-6"> 
        
        {/* Alerta de 4 horas (Regra 3) */}
        {alerta4Horas && isSaida && (
            <div className="p-3 bg-red-100 dark:bg-red-900/50 border border-red-500 rounded-md flex items-center space-x-3 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-medium">
                    ALERTA: Já se passaram 4 horas desde sua última Entrada ({format(parseISO(ultimoRegistro!.horario_registro), 'HH:mm')}). Lembre-se de registrar sua Saída para o intervalo ou fim do turno.
                </p>
            </div>
        )}

        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center">
            <Camera className="w-5 h-5 mr-2" /> 1. Captura de Selfie
          </h3>
          <p className="text-sm text-muted-foreground">
            Capture sua foto em tempo real para comprovação do registro.
          </p>
          <CameraCapture 
            onCapture={handleCapture} 
            onReset={handleResetSelfie} 
            capturedFile={selfieFile}
          />
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">2. Registrar Horário</h3>
          <p className="text-sm text-muted-foreground">
            A próxima ação esperada é: <span className={cn("font-bold", isEntrada ? "text-green-600" : "text-red-600")}>{proximaAcao}</span>.
          </p>
          
          <div className="flex flex-col space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0"> 
            <Button 
              onClick={() => handlePreRegister('Entrada')} 
              disabled={loading || carregandoStatus || !selfieFile || isSaida}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {loading && pendingRegistroType === 'Entrada' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUpCircle className="mr-2 h-4 w-4" />}
              Bater Ponto (Entrada)
            </Button>
            <Button 
              onClick={() => handlePreRegister('Saida')} 
              disabled={loading || carregandoStatus || !selfieFile || isEntrada}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              {loading && pendingRegistroType === 'Saida' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowDownCircle className="mr-2 h-4 w-4" />}
              Bater Ponto (Saída)
            </Button>
          </div>
        </div>

        {podeVisualizarProprioPonto && ultimoRegistro && (
          <div className="mt-6 p-4 border rounded-lg bg-secondary/50">
            <p className="font-medium">Último Registro:</p>
            <p className={ultimoRegistro.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600'}>
              {ultimoRegistro.tipo} às {format(parseISO(ultimoRegistro.horario_registro), 'HH:mm:ss')}
            </p>
            {location && (
              <a
                href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline flex items-center mt-1"
              >
                <MapPin className="w-3 h-3 mr-1" />
                Localização Registrada
              </a>
            )}
          </div>
        )}
        
        {!podeVisualizarProprioPonto && (
            <div className="mt-6 p-4 border rounded-lg bg-secondary/50 text-center text-sm text-muted-foreground">
                O registro de ponto foi concluído. A visualização do histórico é controlada pelo seu gestor.
            </div>
        )}
      </CardContent>
      
      <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Registro de Ponto</AlertDialogTitle>
            <div className="text-sm text-muted-foreground">
              Você está prestes a registrar um ponto de <span className="font-bold text-primary">{pendingRegistroType}</span>.
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => registrarPonto(pendingRegistroType!)} 
              disabled={loading}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirmar Registro'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default RegistroPonto;