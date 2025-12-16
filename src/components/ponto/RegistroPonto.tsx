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
import { Input } from '@/components/ui/input';

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
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [manualAccuracy, setManualAccuracy] = useState('');
  
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
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    });
  }, []);

  const requestGeoLocation = useCallback(() => {
    getGeoLocation()
      .then((position) => setLocation(position))
      .catch((error) => {
        console.error('Erro ao obter localização:', error);
        setLocation(null);
      });
  }, [getGeoLocation]);
  
  // Efeito para tentar obter a localização assim que o componente carrega
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
    requestGeoLocation();
  }, [requestGeoLocation]);

  const handleResetSelfie = useCallback(() => {
    setSelfieFile(null);
    setLocation(null);
    setLocationStatus('idle');
    setManualLat('');
    setManualLng('');
    setManualAccuracy('');
  }, []);

  const handleManualLocationApply = useCallback(() => {
    const lat = parseFloat(manualLat.replace(',', '.'));
    const lng = parseFloat(manualLng.replace(',', '.'));
    const accuracyValue = manualAccuracy ? parseFloat(manualAccuracy.replace(',', '.')) : undefined;

    if (!isFinite(lat) || !isFinite(lng)) {
      showError('Informe latitude e longitude válidas (ex.: -23.5555 e -46.6392).');
      return;
    }

    const manualGeo: GeoLocation = {
      latitude: lat,
      longitude: lng,
      accuracy: accuracyValue,
    };

    setLocation(manualGeo);
    setLocationStatus('success');
    showSuccess('Localização definida manualmente.');
  }, [manualLat, manualLng, manualAccuracy]);

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
      // Não precisa chamar getGeoLocation novamente, usa o estado 'location'
      const geo = location;

      const selfieUrl = await uploadSelfie(selfieFile);
      
      // Constrói a URL do Google Maps (quando disponível)
      const mapsUrl = geo ? `https://www.google.com/maps?q=${geo.latitude},${geo.longitude}` : null;

      const payload = {
          funcionario_id: funcionarioId,
          [ownerKey]: empresaId, // empresa_id ou admin_id
          horario_registro: new Date().toISOString(),
          selfie_url: selfieUrl,
          tipo: tipo,
          latitude: geo?.latitude ?? null,
          longitude: geo?.longitude ?? null,
          maps_url: geo ? mapsUrl : null,
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
  const isPontoDisabled = loading || carregandoStatus || !selfieFile;

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
            <div className="p-3 border rounded-md space-y-2">
                {renderLocationStatus()}
                <p className="text-xs text-muted-foreground">
                    A localização só é capturada após tocar no botão abaixo, logo após a selfie. Caso o navegador bloqueie, permita o acesso ou use a opção manual.
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="link"
                        size="sm"
                        onClick={requestGeoLocation}
                        disabled={loading || locationStatus === 'loading'}
                        className="mt-1 p-0 h-auto"
                    >
                        {locationStatus === 'error'
                            ? 'Tentar Obter Localização Novamente'
                            : locationStatus === 'success'
                                ? 'Atualizar Localização'
                                : 'Obter Localização'}
                    </Button>
                    {locationStatus === 'loading' && (
                        <span className="text-muted-foreground text-xs">Pedindo permissão...</span>
                    )}
                </div>
                {(!location || locationStatus === 'error') && (
                  <div className="mt-3 space-y-2 rounded-md border border-dashed border-muted-foreground/40 bg-muted/20 p-3">
                    <p className="text-xs font-semibold">
                      Alternativa manual via Google Maps
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Abra o Google Maps, toque no local exato e copie as coordenadas exibidas (ex.: -23.5555, -46.6392). Cole abaixo para continuar.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        placeholder="Latitude (ex: -23.5555)"
                        value={manualLat}
                        onChange={(e) => setManualLat(e.target.value)}
                        inputMode="decimal"
                      />
                      <Input
                        placeholder="Longitude (ex: -46.6392)"
                        value={manualLng}
                        onChange={(e) => setManualLng(e.target.value)}
                        inputMode="decimal"
                      />
                      <Input
                        placeholder="Precisão (metros, opcional)"
                        value={manualAccuracy}
                        onChange={(e) => setManualAccuracy(e.target.value)}
                        inputMode="decimal"
                        className="sm:col-span-2"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleManualLocationApply}
                        disabled={!manualLat || !manualLng}
                      >
                        Usar coordenadas
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href="https://www.google.com/maps" target="_blank" rel="noreferrer">
                          Abrir Google Maps
                        </a>
                      </Button>
                    </div>
                  </div>
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
              {!location && (
                <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Localização não registrada. O gestor verá esse lançamento sem coordenadas.
                </p>
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
