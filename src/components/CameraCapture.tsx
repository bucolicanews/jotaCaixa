import React, { useRef, useState, useEffect, useCallback } from 'react';
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
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    console.log("LOG: stopCamera chamado.");
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
    setIsStarting(false);
    setError(null);
  }, [stream]);

  // Efeito de limpeza: Garante que a câmera pare ao desmontar o componente
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    if (stream || isStarting) return;
    
    console.log("LOG: startCamera iniciado.");
    setIsStarting(true);
    setError(null);
    
    try {
      console.log("LOG: Solicitando acesso à mídia...");
      // Preferir a câmera frontal (user)
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      
      console.log("LOG: Acesso à mídia concedido.");
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          console.log("LOG: Metadados do vídeo carregados. Tentando play.");
          videoRef.current?.play();
          setIsCameraActive(true);
          setIsStarting(false);
          console.log("LOG: Câmera ativa.");
        };
      } else {
        console.log("LOG: videoRef não disponível. Parando stream.");
        mediaStream.getTracks().forEach(track => track.stop());
        setIsStarting(false);
      }
      setStream(mediaStream);
    } catch (err: any) {
      console.error("LOG: Erro ao acessar a câmera:", err);
      
      let errorMessage = "Câmera Desativada ou Permissão Negada.";
      if (err.name === 'NotAllowedError') {
        errorMessage = "Acesso à câmera negado. Por favor, permita o acesso nas configurações do seu navegador.";
      } else if (err.name === 'NotFoundError') {
        errorMessage = "Nenhuma câmera encontrada no dispositivo.";
      }
      
      setError(errorMessage);
      showError(errorMessage);
      setIsCameraActive(false);
      setIsStarting(false);
      console.log("LOG: Falha na inicialização da câmera. Estado de erro definido.");
    }
  }, [stream, isStarting]);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current || !isCameraActive) return;

    console.log("LOG: Capturando selfie...");
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas dimensions to match video stream
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `selfie-${Date.now()}.jpeg`, { type: 'image/jpeg' });
          onCapture(file);
          stopCamera(); // Para a câmera após a captura
          console.log("LOG: Selfie capturada e câmera parada.");
        } else {
          showError("Falha ao capturar imagem.");
        }
      }, 'image/jpeg', 0.9);
    }
  };

  const handleReset = () => {
    console.log("LOG: Resetando selfie.");
    onReset();
    // A câmera não é iniciada automaticamente, o usuário deve clicar no botão.
  };

  const handleButtonClick = () => {
    console.log(`LOG: Botão clicado. isCameraActive: ${isCameraActive}, isStarting: ${isStarting}`);
    if (isCameraActive) {
      handleCapture();
    } else {
      startCamera();
    }
  };

  const renderCameraView = () => {
    if (isStarting) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-white/50">
          <Loader2 className="w-6 h-6 animate-spin mb-2" />
          Iniciando Câmera...
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-white/50 p-4 text-center">
          {error}
          <Button onClick={startCamera} variant="secondary" className="mt-4">Tentar Novamente</Button>
        </div>
      );
    }
    if (!isCameraActive) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-white/50 p-4">
          Câmera Desativada. Clique em 'Tirar Selfie' para ativar.
        </div>
      );
    }
    return (
      <video 
        ref={videoRef} 
        className="w-full h-full object-cover" 
        autoPlay 
        playsInline 
        muted 
        style={{ transform: 'scaleX(-1)' }} // Espelha a imagem para selfies
      />
    );
  };

  return (
    <Card className="p-2">
      <CardContent className="p-0 space-y-3">
        {!capturedFile ? (
          <>
            <div className="relative w-full aspect-video bg-gray-900 rounded-md overflow-hidden">
              {isCameraActive ? renderCameraView() : (
                <div className="flex flex-col items-center justify-center h-full text-white/50 p-4">
                  {isStarting ? (
                    <Loader2 className="w-6 h-6 animate-spin mb-2" />
                  ) : (
                    error ? renderCameraView() : "Câmera Desativada. Clique em 'Tirar Selfie' para ativar."
                  )}
                </div>
              )}
            </div>
            <Button 
              onClick={handleButtonClick} 
              className="w-full" 
              disabled={isStarting || !!error}
            >
              {isStarting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isCameraActive ? (
                <>
                  <Camera className="w-4 h-4 mr-2" />
                  Capturar Selfie
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 mr-2" />
                  Tirar Selfie (Ativar Câmera)
                </>
              )}
            </Button>
          </>
        ) : (
          <div className="space-y-3">
            <div className="relative w-full aspect-video rounded-md overflow-hidden border-2 border-green-500">
              <img 
                src={URL.createObjectURL(capturedFile)} 
                alt="Selfie Capturada" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-green-600 flex items-center">
                <CheckCircle2 className="w-4 h-4 mr-1" /> Selfie Capturada
              </span>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Refazer
              </Button>
            </div>
          </div>
        )}
        {/* Hidden canvas for image processing */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </CardContent>
    </Card>
  );
};

export default CameraCapture;