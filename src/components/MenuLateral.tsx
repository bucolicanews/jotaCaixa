import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, DollarSign, ArrowUpCircle, ArrowDownCircle, Banknote, FileText, Upload, Settings, BookOpen, Users, Building2, Clock, Contact, CalendarCheck, User, FileSignature, Tag, FileTextIcon, Package, History, FileDown, MessageSquare, Scale, Loader2, TrendingUp } from 'lucide-react';
import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile, AdminProfile, AdminUsuarioProfile } from '@/types/usuario';
import { isPast, parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTicketNotifications } from '@/hooks/use-ticket-notifications';
import { supabase } from '@/integrations/supabase/client'; // Importando supabase

interface ItemMenu {
  nome: string;
// ... restante do arquivo