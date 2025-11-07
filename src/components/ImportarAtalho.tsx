import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, LucideIcon, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ImportarAtalhoProps {
  title: string;
  description: string;
  icon: LucideIcon;
  destinationPath: string;
  buttonText: string;
}

const ImportarAtalho: React.FC<ImportarAtalhoProps> = ({ title, description, icon: Icon, destinationPath, buttonText }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);

  const handleNavigate = () => {
    setLoading(true);
    // Simula um pequeno delay para feedback visual
    setTimeout(() => {
        navigate(destinationPath);
    }, 300);
  };

  return (
    <Card className="w-full hover:shadow-lg transition-shadow">
      <CardHeader>
        <CardTitle className="text-xl flex items-center">
            <Icon className="w-5 h-5 mr-2 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground h-10">
          {description}
        </p>
        
        <Button 
          onClick={handleNavigate} 
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="mr-2 h-4 w-4" />
          )}
          {buttonText}
        </Button>
      </CardContent>
    </Card>
  );
};

export default ImportarAtalho;