import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RotateCcw, CheckCircle2 } from 'lucide-react';
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

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
  }, [stream]);

  const startCamera = useCallback(async () => {
    if (stream) return;
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
      setStream(mediaStream);
      setIsCameraActive(true);
    } catch (err) {
      console.error("Erro ao acessar a câmera:", err);
      showError("Não foi possível acessar a câmera. Verifique as permissões.");
      setIsCameraActive(false);
    }
  }, [stream]);

  useEffect(() => {
    if (!capturedFile) {
      startCamera();
    } else {
      stopCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [capturedFile, startCamera, stopCamera]);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;

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
          stopCamera();
        } else {
          showError("Falha ao capturar imagem.");
        }
      }, 'image/jpeg', 0.9);
    }
  };

  const handleReset = () => {
    onReset();
    startCamera();
  };

  return (
    <Card className="p-2">
      <CardContent className="p-0 space-y-3">
        {!capturedFile ? (
          <>
            <div className="relative w-full aspect-video bg-gray-900 rounded-md overflow-hidden">
              {isCameraActive ? (
                <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
              ) : (
                <div className="flex items-center justify-center h-full text-white/50">
                  Câmera Desativada ou Aguardando Permissão
                </div>
              )}
            </div>
            <Button 
              onClick={handleCapture} 
              className="w-full" 
              disabled={!isCameraActive}
            >
              <Camera className="w-4 h-4 mr-2" />
              Tirar Selfie
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