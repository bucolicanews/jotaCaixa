import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MapPin, Clock, ArrowUpCircle, ArrowDownCircle, Camera, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
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
  accuracy?: number; // Adicionando precisão
}

const RegistroPonto: React.FC = () => {
  const { usuario, perfil, role } = useSessao();
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  
  // State for camera capture
  const [selfieFile, setSelfieFile] = useState<File | null>(null); 
  
  // State for confirmation dialog
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [pendingRegistroType, setPendingRegistroType] = useState<RegistroTipo | null>(null);

  // Determina o ID da empresa/proprietário e a tabela de destino
  const isUsuario = role === 'Usuario' && perfil && ('cliente_id' in perfil || 'admin_id' in perfil);
  
  const isFuncionarioAdmin = isUsuario && (perfil as AdminUsuarioProfile)?.admin_id;
  
  const empresaId = isUsuario 
    ? (perfil as UsuarioProfile)?.cliente_id || (perfil as AdminUsuarioProfile)?.admin_id 
    : null;
    
  const funcionarioId = usuario?.id;
  
  // Determina a tabela de destino
  const tabelaRegistros = isFuncionarioAdmin ? 'admin_registros_ponto' : 'registros_ponto';
  const ownerKey = isFuncionarioAdmin ? 'admin_id' : 'empresa_id';
  
  // Hook para status do ponto
  const { ultimoRegistro, proximaAcao, alerta4Horas, carregando: carregandoStatus, refetch: refetchStatus } = usePontoStatus(funcionarioId);

  // Nova verificação de permissão
  const podeVisualizarProprioPonto = isUsuario && (perfil as UsuarioProfile)?.permissoes?.visualizar_proprio_ponto;

  const getGeoLocation = useCallback((): Promise<GeoLocation> => {
    setLocationStatus('loading');
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        setLocationStatus('error');
        reject(new Error('Geolocalização não suportada pelo seu navegador.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocationStatus('success');
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (error) => {
          setLocationStatus('error');
          reject(new Error(`Erro ao obter localização: ${error.message}`));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }, []);
  
  // Efeito para tentar obter a localização assim que o componente carrega
  React.useEffect(() => {
      if (funcionarioId && locationStatus === 'idle') {
          getGeoLocation().then(setLocation).catch(error => {
              console.error("Erro inicial de geolocalização:", error);
              setLocation(null);
          });
      }
  }, [funcionarioId, locationStatus, getGeoLocation]);


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
    
    if (locationStatus !== 'success' || !location) {
        showError('Aguarde a obtenção da localização ou tente novamente.');
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
    if (!funcionarioId || !empresaId || !selfieFile || !location) {
      showError('Dados incompletos para registro.');
      return;
    }

    setLoading(true);
    try {
      // Não precisa chamar getGeoLocation novamente, usa o estado 'location'
      const geo = location;

      const selfieUrl = await uploadSelfie(selfieFile);
      
      // Constrói a URL do Google Maps
      const mapsUrl = `https://www.google.com/maps?q=${geo.latitude},${geo.longitude}`;

      const payload = {
          funcionario_id: funcionarioId,
          [ownerKey]: empresaId, // empresa_id ou admin_id
          horario_registro: new Date().toISOString(),
          selfie_url: selfieUrl,
          tipo: tipo,
          latitude: geo.latitude, // SALVANDO LATITUDE
          longitude: geo.longitude, // SALVANDO LONGITUDE
          maps_url: mapsUrl, // SALVANDO LINK DO MAPA
      };

      const { error } = await supabase
        .from(tabelaRegistros) // ROTEAMENTO AQUI
        .insert(payload);

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
  
  const renderLocationStatus = () => {
      if (locationStatus === 'loading') {
          return <span className="text-yellow-600 flex items-center"><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Buscando Localização...</span>;
      }
      if (locationStatus === 'success' && location) {
          const accuracy = location.accuracy;
          const isAccurate = accuracy && accuracy < 50; // Considera < 50m preciso
          
          return (
              <span className={cn("flex items-center", isAccurate ? "text-green-600" : "text-orange-600")}>
                  <CheckCircle2 className="w-4 h-4 mr-1" /> 
                  Localização Obtida. 
                  {accuracy && <span className="ml-1 text-xs"> (Precisão: {accuracy.toFixed(0)}m)</span>}
              </span>
          );
      }
      if (locationStatus === 'error') {
          return <span className="text-red-600 flex items-center"><XCircle className="w-4 h-4 mr-1" /> Erro ao obter localização.</span>;
      }
      return <span className="text-muted-foreground flex items-center"><MapPin className="w-4 h-4 mr-1" /> Aguardando...</span>;
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
  const isPontoDisabled = loading || carregandoStatus || !selfieFile || locationStatus !== 'success';

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
        
        {/* Status da Localização */}
        <div className="space-y-2">
            <h3 className="text-lg font-semibold flex items-center">
                <MapPin className="w-5 h-5 mr-2" /> 2. Localização
            </h3>
            <div className="p-3 border rounded-md">
                {renderLocationStatus()}
                {locationStatus === 'error' && (
                    <Button variant="link" size="sm" onClick={() => getGeoLocation().then(setLocation).catch(() => {})} disabled={loading} className="mt-1 p-0 h-auto">
                        Tentar Obter Localização Novamente
                    </Button>
                )}
            </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">3. Registrar Horário</h3>
          <p className="text-sm text-muted-foreground">
            A próxima ação esperada é: <span className={cn("font-bold", isEntrada ? "text-green-600" : "text-red-600")}>{proximaAcao}</span>.
          </p>
          
          <div className="flex flex-col space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0"> 
            <Button 
              onClick={() => handlePreRegister('Entrada')} 
              disabled={isPontoDisabled || isSaida}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {loading && pendingRegistroType === 'Entrada' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUpCircle className="mr-2 h-4 w-4" />}
              Bater Ponto (Entrada)
            </Button>
            <Button 
              onClick={() => handlePreRegister('Saida')} 
              disabled={isPontoDisabled || isEntrada}
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
            {ultimoRegistro.maps_url && (
              <a
                href={ultimoRegistro.maps_url}
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
              {location && (
                  <p className="mt-2 text-xs">Localização: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)} (Precisão: {location.accuracy?.toFixed(0)}m)</p>
              )}
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