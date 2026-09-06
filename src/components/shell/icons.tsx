import {
  Award,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  ChartPie,
  CheckSquare,
  Clock,
  Coins,
  FileChartColumn,
  Folder,
  FolderKanban,
  Gauge,
  House,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  CarFront,
  PackageOpen,
  Plug,
  Receipt,
  ScrollText,
  Settings,
  Shield,
  TrendingUp,
  User,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * One icon family for the whole product.
 *
 * Navigation carries an `iconKey` string rather than a component so the
 * navigation model stays serialisable and can later come from the server
 * unchanged.
 */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  award: Award,
  building: Building2,
  'calendar-check': CalendarCheck,
  'calendar-days': CalendarDays,
  'calendar-off': CalendarOff,
  'chart-pie': ChartPie,
  'check-square': CheckSquare,
  clock: Clock,
  coins: Coins,
  'file-chart-column': FileChartColumn,
  folder: Folder,
  'folder-kanban': FolderKanban,
  gauge: Gauge,
  house: House,
  inbox: Inbox,
  'package-open': PackageOpen,
  'car-front': CarFront,
  'layout-dashboard': LayoutDashboard,
  'message-square': MessageSquare,
  plug: Plug,
  receipt: Receipt,
  'scroll-text': ScrollText,
  settings: Settings,
  shield: Shield,
  'trending-up': TrendingUp,
  user: User,
  'user-cog': UserCog,
  users: Users,
};

export function NavIcon({
  iconKey,
  className,
}: {
  iconKey: string;
  className?: string;
}) {
  const Icon = ICONS[iconKey] ?? LayoutDashboard;
  return <Icon aria-hidden className={className} />;
}
