import {
  BookOpen,
  Building2,
  Compass,
  Construction,
  Dumbbell,
  FileText,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  Landmark,
  MapPinned,
  Package,
  Settings,
  ShieldCheck,
  Stethoscope,
  Sprout,
  Store,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const MUNICIPAL_PROFILES = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'PREFEITO', label: 'Prefeito' },
  { value: 'SECRETARIO', label: 'Secretário' },
  { value: 'ADMINISTRATIVO', label: 'Administrativo' },
] as const

export const MUNICIPAL_ICON_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'Landmark', label: 'Administração e finanças', icon: Landmark },
  { value: 'Sprout', label: 'Agricultura e meio ambiente', icon: Sprout },
  { value: 'HeartHandshake', label: 'Assistência social', icon: HeartHandshake },
  { value: 'Compass', label: 'Cultura e turismo', icon: Compass },
  { value: 'TrendingUp', label: 'Desenvolvimento econômico', icon: TrendingUp },
  { value: 'GraduationCap', label: 'Educação', icon: GraduationCap },
  { value: 'Dumbbell', label: 'Esporte e lazer', icon: Dumbbell },
  { value: 'Construction', label: 'Obras e urbanismo', icon: Construction },
  { value: 'HeartPulse', label: 'Saúde', icon: HeartPulse },
  { value: 'ShieldCheck', label: 'Segurança pública e trânsito', icon: ShieldCheck },
  { value: 'Stethoscope', label: 'Saúde e atendimento médico', icon: Stethoscope },
  { value: 'Building2', label: 'Prédio ou unidade pública', icon: Building2 },
  { value: 'BookOpen', label: 'Educação e conhecimento', icon: BookOpen },
  { value: 'FileText', label: 'Documentos e registros', icon: FileText },
  { value: 'MapPinned', label: 'Território e localização', icon: MapPinned },
  { value: 'Package', label: 'Materiais e compras', icon: Package },
  { value: 'Settings', label: 'Configurações', icon: Settings },
  { value: 'Store', label: 'Atendimento e serviços', icon: Store },
  { value: 'Truck', label: 'Frotas e transporte', icon: Truck },
  { value: 'Users', label: 'Pessoas e equipes', icon: Users },
]

const iconByName: Record<string, LucideIcon> = Object.fromEntries(
  MUNICIPAL_ICON_OPTIONS.map(({ value, icon }) => [value, icon]),
)

export function getMunicipalIcon(name: string): LucideIcon {
  return iconByName[name] || Building2
}

export type MunicipalSecretariat = {
  id: string
  name: string
  description: string
  icon_name: string
  sort_order: number
  is_active: boolean
}

export type MunicipalModule = {
  id: string
  label: string
  description: string
  icon_name: string
  is_ready: boolean
  status_label: string
  sort_order: number
}

export type MunicipalSecretariatModule = {
  secretariat_id: string
  module_id: string
  sort_order: number
}
