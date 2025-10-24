import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RotateCcw, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { showError } from '@/utils/toast';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onReset: () => void;
  capturedFile: File | null;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onReset, capturedFile }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  console.log("LOG: CameraCapture renderizou. Câmera ligada:", isCameraOn, "Carregando:", isLoading);

  const stopCamera = useCallback(() => {
    if (stream) {
      console.log("LOG: Parando todos os tracks da câmera.");
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsCameraOn(false);
    }
  }, [stream]);

  useEffect(() => {
    // Efeito de limpeza para garantir que a câmera pare ao desmontar.
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const handleStartCamera = async () => {
    console.log("LOG: handleStartCamera foi chamado.");
    if (isCameraOn || isLoading) {
      console.log("LOG: Câmera já está ligada ou carregando. Retornando.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      console.log("LOG: Solicitando permissão e stream de mídia...");
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      console.log("LOG: Permissão concedida. Stream obtido.");

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          console.log("LOG: Metadados carregados. Reproduzindo vídeo.");
          videoRef.current?.play();
          setIsLoading(false);
          setIsCameraOn(true);
        };
      }
      setStream(mediaStream);
    } catch (err: any) {
      console.error("LOG: ERRO ao iniciar a câmera:", err);
      let message = "Não foi possível acessar a câmera. Verifique as permissões do navegador.";
      if (err.name === 'NotAllowedError') {
        message = "Acesso à câmera foi negado.";
      } else if (err.name === 'NotFoundError') {
        message = "Nenhuma câmera foi encontrada.";
      }
      setErrorMessage(message);
      showError(message);
      setIsLoading(false);
    }
  };

  const handleCapture = () => {
    console.log("LOG: handleCapture foi chamado.");
    if (!videoRef.current || !canvasRef.current || !isCameraOn) {
      console.log("LOG: Captura abortada. Refs ou câmera não estão prontos.");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (context) {
      // Espelha a imagem horizontalmente para que a selfie não fique invertida
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `selfie-${Date.now()}.jpeg`, { type: 'image/jpeg' });
          onCapture(file);
          stopCamera();
          console.log("LOG: Selfie capturada com sucesso.");
        } else {
          showError("Falha ao criar o arquivo de imagem.");
        }
      }, 'image/jpeg', 0.9);
    }
  };

  const handleReset = () => {
    console.log("LOG: handleReset foi chamado.");
    onReset();
    stopCamera(); // Garante que a câmera pare
    setErrorMessage(null);
  };

  // Renderiza a imagem capturada se ela existir
  if (capturedFile) {
    return (
      <div className="space-y-3">
        <div className="relative w-full aspect-video rounded-md overflow-hidden border-2 border-green-500">
          <img src={URL.createObjectURL(capturedFile)} alt="Selfie Capturada" className="w-full h-full object-cover" />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-green-600 flex items-center"><CheckCircle2 className="w-4 h-4 mr-1" /> Selfie Capturada</span>
          <Button variant="outline" size="sm" onClick={handleReset}><RotateCcw className="w-4 h-4 mr-2" />Refazer</Button>
        </div>
      </div>
    );
  }

  // Renderiza a interface da câmera se não houver imagem
  return (
    <Card className="p-2">
      <CardContent className="p-0 space-y-3">
        <div className="relative w-full aspect-video bg-gray-900 rounded-md overflow-hidden">
          <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted style={{ display: isCameraOn ? 'block' : 'none' }} />
          {!isCameraOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 p-4 text-center">
              {isLoading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin mb-2" />
                  <span>Iniciando Câmera...</span>
                </>
              ) : errorMessage ? (
                <>
                  <span>{errorMessage}</span>
                  <Button onClick={handleStartCamera} variant="secondary" className="mt-4">Tentar Novamente</Button>
                </>
              ) : (
                <span>Clique em "Ativar Câmera"</span>
              )}
            </div>
          )}
        </div>
        
        {isCameraOn ? (
          <Button onClick={handleCapture} className="w-full" disabled={isLoading}>
            <Camera className="w-4 h-4 mr-2" />
            Capturar Selfie
          </Button>
        ) : (
          <Button onClick={handleStartCamera} className="w-full" disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
            Ativar Câmera
          </Button>
        )}
        
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </CardContent>
    </Card>
  );
};

export default CameraCapture;