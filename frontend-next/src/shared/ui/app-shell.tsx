import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  FlaskConical,
  Settings,
  LogOut,
  LayoutDashboard,
  ClipboardList,
  Tag,
  BookOpen,
} from 'lucide-react'

import { logout } from '@/features/auth/api'
import { useAuth } from '@/features/auth/use-auth'
import { useSessionRefresh } from '@/features/auth/use-session-refresh'
import { API_UNAUTHORIZED_EVENT } from '@/shared/api/client'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
} from '@/components/ui/sidebar'
import { ThemeToggle } from '@/shared/ui/theme-toggle'

const roleLabels: Record<string, string> = {
  admin: '管理员',
  member: '成员',
  viewer: '只读',
}

const navItems = [
  {
    to: '/experiments' as const,
    label: '实验记录',
    icon: FlaskConical,
    match: '/experiments',
  },
  {
    to: '/setup-library' as const,
    label: 'Setup 库',
    icon: Settings,
    match: '/setup-library',
  },
]

const adminDashboardItem = {
  to: '/dashboard' as const,
  label: '数据看板',
  icon: LayoutDashboard,
  match: '/dashboard',
}

const adminConfigItems = [
  { to: '/fields' as const, label: '字段词典', icon: ClipboardList, match: '/fields' },
  { to: '/vocabularies' as const, label: '受控词表', icon: Tag, match: '/vocabularies' },
  { to: '/recipes' as const, label: 'Recipe', icon: BookOpen, match: '/recipes' },
]

// Single source of truth for the header page title — keep in sync with the
// sidebar by deriving from the same nav config instead of a parallel switch.
const navLabelLookup: { match: string; label: string }[] = [
  ...navItems,
  adminDashboardItem,
  ...adminConfigItems,
]

function getPageTitle(pathname: string) {
  return navLabelLookup.find((item) => pathname.startsWith(item.match))?.label ?? ''
}

// Nav body lives inside SidebarProvider so it can close the mobile drawer when a
// link is tapped (default shadcn sidebar leaves the overlay open on selection).
function SidebarBody({
  isAdmin,
  pathname,
}: {
  isAdmin: boolean
  pathname: string
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.match)}
                    tooltip={item.label}
                  >
                    <Link to={item.to} onClick={closeOnMobile}>
                      <Icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
            {isAdmin && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith(adminDashboardItem.match)}
                  tooltip={adminDashboardItem.label}
                >
                  <Link to={adminDashboardItem.to} onClick={closeOnMobile}>
                    <adminDashboardItem.icon />
                    <span>{adminDashboardItem.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {isAdmin && (
        <SidebarGroup>
          <SidebarGroupLabel>管理配置</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminConfigItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.match)}
                    tooltip={item.label}
                  >
                    <Link to={item.to} onClick={closeOnMobile}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
    </SidebarContent>
  )
}

type AppShellProps = {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { clearSession, session } = useAuth()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const locationHref = useRouterState({ select: (s) => s.location.href })
  // Keep the latest href in a ref so the 401 handler (registered once) can read
  // it without re-subscribing the listener on every navigation.
  const locationHrefRef = useRef(locationHref)
  locationHrefRef.current = locationHref

  // Keep the session alive while the app is in use (sliding refresh).
  useSessionRefresh()

  const currentRole = session.currentUser?.role
  const isAdmin = currentRole === 'admin'
  const roleLabel = currentRole ? (roleLabels[currentRole] ?? '') : '未登录'
  const userInitial =
    session.currentUser?.name?.trim()?.[0]?.toUpperCase() ?? '?'

  // Handle 401 globally — fires when any API call returns 401 with a token
  useEffect(() => {
    const handleUnauthorized = () => {
      queryClient.clear()
      clearSession()
      toast.error('登录会话已过期，请重新登录')
      const current = locationHrefRef.current
      void navigate({
        to: '/login',
        replace: true,
        search: current && !current.startsWith('/login') ? { redirect: current } : {},
      })
    }

    window.addEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized)
    return () => {
      window.removeEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized)
    }
  }, [clearSession, navigate, queryClient])

  const handleLogout = async () => {
    try {
      await logout(session.accessToken)
    } catch {
      // Local logout is still the source of truth in bearer-token flow.
    } finally {
      queryClient.clear()
      clearSession()
      await navigate({ to: '/login', replace: true })
    }
  }

  return (
    <SidebarProvider>
      {/* Sidebar */}
      <Sidebar className="border-r border-sidebar-border bg-sidebar">
        <SidebarHeader className="px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-[38px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/95 to-primary text-primary-foreground shadow-sm">
              <FlaskConical className="size-5" />
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-wide text-sidebar-foreground">
                CVD Lab
              </span>
              <span className="text-[11px] text-muted-foreground">
                实验数据采集系统
              </span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarBody isAdmin={isAdmin} pathname={pathname} />

        <SidebarFooter className="px-2 py-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent"
                  >
                    <Avatar className="size-7 shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                        {userInitial}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col text-left leading-tight">
                      <span className="truncate text-sm font-semibold">
                        {session.currentUser?.name ?? '未登录'}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {roleLabel}
                      </span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="start"
                  className="w-56"
                >
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold">
                        {session.currentUser?.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {session.currentUser?.email}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      void handleLogout()
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 size-4" />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* Main content area using SidebarInset */}
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-[60px] shrink-0 items-center gap-2 border-b border-border bg-card/72 px-4 backdrop-blur-md">
          <SidebarTrigger className="-ml-1" />
          <div className="h-4 w-px bg-border shrink-0" />
          <nav className="flex items-center gap-1 text-sm font-medium text-foreground">
            {getPageTitle(pathname)}
          </nav>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        {/* SidebarInset already renders the <main> landmark; this is just the
            content padding wrapper. */}
        <div className="flex-1 bg-background p-6">
          <div className="mx-auto w-full max-w-[1440px]">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
