import { ContasFuturasDialog } from '@/components/ContasFuturasDialog'; // Corrigido para named import
import { useSessao } from '@/hooks/use-sessao';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useSupabase } from '@/hooks/use-supabase'; // Mantido, assumindo que o TS2307 é um erro de ambiente temporário
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Pagamento {
// ...