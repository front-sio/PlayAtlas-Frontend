import React from 'react';
import { Trophy, Target, Zap, Shield, Users, TrendingUp } from 'lucide-react';

interface IconProps {
  className?: string;
  size?: number;
}

export const TrophyIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <Trophy className={className} size={size} />
);

export const TargetIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <Target className={className} size={size} />
);

export const ZapIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <Zap className={className} size={size} />
);

export const ShieldIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <Shield className={className} size={size} />
);

export const UsersIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <Users className={className} size={size} />
);

export const TrendingUpIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <TrendingUp className={className} size={size} />
);