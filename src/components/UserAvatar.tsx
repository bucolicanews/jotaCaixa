import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { AnyProfile } from '@/types/usuario';

interface UserAvatarProps {
  profile: AnyProfile;
  className?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ profile, className }) => {
  const nome = profile?.nome || 'Usuário';
  const avatarUrl = profile && 'avatar_url' in profile ? profile.avatar_url : null;
  
  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <Avatar className={className}>
      <AvatarImage src={avatarUrl || undefined} alt={nome} />
      <AvatarFallback className="bg-primary text-primary-foreground">
        {nome ? getInitials(nome) : <User className="w-4 h-4" />}
      </AvatarFallback>
    </Avatar>
  );
};

export default UserAvatar;