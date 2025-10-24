import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MapPin, Clock, CheckCircle2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

type RegistroTipo = 'Entrada' | 'Saida';

interface GeoLocation {
  latitude: number;
  longitude: number;
}

const RegistroPonto: React.FC = () => {
  const { usuario, perfil, role } = useSessao();
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [lastRegistro, setLastRegistro] = useState<{ tipo: RegistroTipo, horario: string } | null>(null);

  const isUsuario = role === 'Usuario' && perfil && 'cliente_id' in perfil;
  const empresaId = isUsuario ? perfil.cliente_id : null;
  const funcionarioId = usuario?.id;

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

  const handleSelfieChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelfieFile(event.target.files[0]);
    } else {
      setSelfieFile(null);
    }
  };

  const uploadSelfie = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${funcionarioId}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
    const filePath = `${funcionarioId}/${fileName}`;

    const { error } = await supabase.storage
      .from('ponto-selfies') // Assumindo que o bucket 'ponto-selfies' existe
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new Error('Falha ao fazer upload da selfie: ' + error.message);
    }

    // Retorna o caminho completo para o arquivo
    const { data: publicUrlData } = supabase.storage.from('ponto-selfies').getPublicUrl(filePath);
    return publicUrlData.publicUrl;
  };

  const registrarPonto = async (tipo: RegistroTipo) => {
    if (!funcionarioId || !empresaId) {
      showError('Dados de usuário ou empresa ausentes.');
      return;
    }
    if (!selfieFile) {
      showError('Por favor, capture ou selecione uma selfie.');
      return;
    }

    setLoading(true);
    try {
      // 1. Obter Geolocalização
      const geo = await getGeoLocation();
      setLocation(geo);

      // 2. Upload da Selfie
      const selfieUrl = await uploadSelfie(selfieFile);

      // 3. Registrar no Banco de Dados
      const { error } = await supabase
        .from('registros_ponto') // Assumindo que a tabela 'registros_ponto' existe
        .insert({
          funcionario_id: funcionarioId,
          empresa_id: empresaId,
          horario_registro: new Date().toISOString(),
          selfie_url: selfieUrl,
          tipo: tipo,
          latitude: geo.latitude,
          longitude: geo.longitude,
        });

      if (error) {
        throw new Error('Erro ao registrar ponto: ' + error.message);
      }

      showSuccess(`Ponto de ${tipo} registrado com sucesso!`);
      setLastRegistro({ tipo, horario: new Date().toLocaleTimeString() });
      setSelfieFile(null);

    } catch (error: any) {
      console.error('Erro no registro de ponto:', error);
      showError(error.message || 'Falha ao registrar o ponto.');
    } finally {
      setLoading(false);
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

  return (
    <Card className="w-full max-w-xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Clock className="w-6 h-6 mr-2" />
          Registro de Ponto Eletrônico
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">1. Captura de Selfie (Simulação)</h3>
          <p className="text-sm text-muted-foreground">
            Para fins de segurança e comprovação, é necessário registrar uma foto no momento do ponto.
          </p>
          <Input 
            id="selfie-file" 
            type="file" 
            accept="image/*" 
            onChange={handleSelfieChange} 
            className="flex-1"
            disabled={loading}
          />
          {selfieFile && (
            <div className="flex items-center space-x-2 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              <span>Selfie selecionada: {selfieFile.name}</span>
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">2. Registrar Horário</h3>
          <p className="text-sm text-muted-foreground">
            Seu horário atual e localização serão registrados.
          </p>
          <div className="flex space-x-4">
            <Button 
              onClick={() => registrarPonto('Entrada')} 
              disabled={loading || !selfieFile}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUpCircle className="mr-2 h-4 w-4" />}
              Bater Ponto (Entrada)
            </Button>
            <Button 
              onClick={() => registrarPonto('Saida')} 
              disabled={loading || !selfieFile}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowDownCircle className="mr-2 h-4 w-4" />}
              Bater Ponto (Saída)
            </Button>
          </div>
        </div>

        {lastRegistro && (
          <div className="mt-6 p-4 border rounded-lg bg-secondary/50">
            <p className="font-medium">Último Registro:</p>
            <p className={lastRegistro.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600'}>
              {lastRegistro.tipo} às {lastRegistro.horario}
            </p>
            {location && (
              <p className="text-xs text-muted-foreground flex items-center mt-1">
                <MapPin className="w-3 h-3 mr-1" />
                Localização: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RegistroPonto;