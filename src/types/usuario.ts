import { User } from '@supabase/supabase-js';

export type UserRole = 'Admin' | 'Cliente' | 'Usuario' | null;

export interface AdminProfile {
  id: string;
  nome: string;
  email: string;
  avatar_url?: string | null;
}

export interface ClienteProfile {
  id: string;
  nome: string;
  email: string;
  avatar_url?: string | null;
  limite_usuarios: number;
  aprovado: boolean;
  permissoes: Record<string, boolean>;
  tipo_cliente?: 'PF' | 'PJ' | 'PF_Avulso' | 'PJ_Avulso' | null; // NOVOS TIPOS
  plano_id?: string | null; // NOVO CAMPO
  data_fim_acesso?: string | null; // NOVO CAMPO: Data e hora do fim do acesso
  admin_id?: string | null; // ADICIONADO PARA CORRIGIR O ERRO
  // Novos campos para Contrato
  documento?: string | null;
  endereco_completo?: string | null;
  criado_em: string; // ADICIONADO
  
  // Campos cadastrais adicionados para tags de contrato (Erro 8)
  cpf?: string | null;
  rg?: string | null;
  nome_mae?: string | null;
  nome_pai?: string | null;
  telefone?: string | null;
  cep?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
}

export interface UsuarioProfile {
  id: string;
  nome: string;
  email: string;
  avatar_url?: string | null;
  cliente_id: string | null;
  permissoes: Record<string, boolean>; // Ex: { "contas_pagar": true, "relatorios": false }
  
  // Novos campos de Folga
  dias_folga_fixos?: string[] | null; // Ex: ['Saturday', 'Sunday']
  folga_domingo_obrigatoria?: boolean | null;
  
  // Novos campos de Salário/Jornada
  salario?: number | null;
  horas_semanais?: number | null;
  horas_mensais?: number | null;
  
  // Novos campos cadastrais
  cpf?: string | null;
  rg?: string | null;
  nome_mae?: string | null;
  nome_pai?: string | null;
  telefone?: string | null;
  cep?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  
  // Campos de admissão
  data_inicio_contrato?: string | null;
  data_fim_contrato?: string | null;
  data_inicio_aviso?: string | null;
  tipo_aviso?: string | null;
  rg_url?: string | null;
  cpf_url?: string | null;
  titulo_eleitor_url?: string | null;
  reservista_url?: string | null;
  ctps_url?: string | null;
  certidao_nascimento_url?: string | null;
  certidao_casamento_url?: string | null;
  comprovante_residencia_url?: string | null;
  comprovante_escolaridade_url?: string | null;
  exame_admissional_url?: string | null;
  foto_3x4_url?: string | null;
  cnh_url?: string | null;
  cartao_pis_url?: string | null;
  ja_admitido_anteriormente?: boolean | null;
  certidoes_filhos_urls?: any;
}

export type AnyProfile = AdminProfile | ClienteProfile | UsuarioProfile | null;

export interface DadosSessao {
  usuario: User | null;
  perfil: AnyProfile;
  role: UserRole;
  carregando: boolean;
}