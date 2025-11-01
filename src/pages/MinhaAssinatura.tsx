// ... (cerca da linha 17)
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { useStripeConfig } from '@/hooks/use-stripe-config';
import { ContasFuturasDialog } from '@/components/ContasFuturasDialog'; // Importando o novo componente como named export

interface Pagamento {
// ...