import { Brush, Droplets, Flower2, Footprints, Hand, Scissors, Sparkles, Waves, Wind, Zap, type LucideIcon } from 'lucide-react';

const icons: Record<string, LucideIcon> = {
  scissors: Scissors,
  brush: Brush,
  sparkles: Sparkles,
  droplets: Droplets,
  waves: Waves,
  flower: Flower2,
  hand: Hand,
  footprints: Footprints,
  zap: Zap,
  wind: Wind,
};

export const CATEGORY_ICON_OPTIONS = Object.keys(icons);

export function CategoryIcon({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  const Icon = icons[name] ?? Sparkles;
  return <Icon className={className} strokeWidth={1.5} />;
}
