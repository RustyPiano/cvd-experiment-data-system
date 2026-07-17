import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  FlaskConical,
  FlaskRound,
  LogOut,
  TestTube2,
} from 'lucide-react'

import {
  ENTITY_KINDS,
  entityConfigs,
  entityRoutes,
} from '@/features/entity-library/config'
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

const navItems = [
  {
    to: '/samples' as const,
    labelKey: 'samples.list.title' as const,
    icon: TestTube2,
    match: '/samples',
  },
]

const experimentsNavItem = {
  to: '/experiments' as const,
  labelKey: 'experimentsV2.nav' as const,
  icon: FlaskRound,
  match: '/experiments',
}

// 一等实体库（v2）导航项 —— 由 field-metadata 实体配置派生（单一源），文案走 i18n（D12）。
const entityLibraryNavItems = ENTITY_KINDS.map((kind) => ({
  to: entityRoutes[kind].list,
  labelKey: `entityLibrary.nav.${entityConfigs[kind].i18nKey}` as const,
  icon: entityConfigs[kind].icon,
  match: entityRoutes[kind].list,
}))

// Single source of truth for the header page title — keep in sync with the
// sidebar by deriving from the same nav config instead of a parallel switch.
function getEntityNavLabel(pathname: string, t: TFunction): string | null {
  if (pathname.startsWith(experimentsNavItem.match)) {
    return t(experimentsNavItem.labelKey)
  }
  const item = entityLibraryNavItems.find((entry) =>
    pathname.startsWith(entry.match),
  )
  return item ? t(item.labelKey) : null
}

function getPageTitle(pathname: string, t: TFunction) {
  const item = navItems.find((entry) => pathname.startsWith(entry.match))
  return item ? t(item.labelKey) : ''
}

// Nav body lives inside SidebarProvider so it can close the mobile drawer when a
// link is tapped (default shadcn sidebar leaves the overlay open on selection).
function SidebarBody({ pathname }: { pathname: string }) {
  const { isMobile, setOpenMobile } = useSidebar()
  const { t } = useTranslation()
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
                    tooltip={t(item.labelKey)}
                  >
                    <Link to={item.to} onClick={closeOnMobile}>
                      <Icon />
                      <span>{t(item.labelKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith(experimentsNavItem.match)}
                tooltip={t(experimentsNavItem.labelKey)}
              >
                <Link to={experimentsNavItem.to} onClick={closeOnMobile}>
                  <experimentsNavItem.icon />
                  <span>{t(experimentsNavItem.labelKey)}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>{t('entityLibrary.nav.group')}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {entityLibraryNavItems.map((item) => {
              const Icon = item.icon
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.match)}
                    tooltip={t(item.labelKey)}
                  >
                    <Link to={item.to} onClick={closeOnMobile}>
                      <Icon />
                      <span>{t(item.labelKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

    </SidebarContent>
  )
}

type AppShellProps = {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
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
  const roleLabel = currentRole
    ? t(`appShell.roles.${currentRole}`)
    : t('appShell.signedOut')
  const userInitial =
    session.currentUser?.name?.trim()?.[0]?.toUpperCase() ?? '?'

  // Handle 401 globally — fires when any API call returns 401 with a token
  useEffect(() => {
    const handleUnauthorized = () => {
      queryClient.clear()
      clearSession()
      toast.error(t('errors.details.sessionExpired'))
      const current = locationHrefRef.current
      void navigate({
        to: '/login',
        replace: true,
        search:
          current && !current.startsWith('/login') ? { redirect: current } : {},
      })
    }

    window.addEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized)
    return () => {
      window.removeEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized)
    }
  }, [clearSession, navigate, queryClient, t])

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
                {t('auth.brand.subtitle')}
              </span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarBody pathname={pathname} />

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
                        {session.currentUser?.name ?? t('appShell.signedOut')}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {roleLabel}
                      </span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
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
                    {t('appShell.logout')}
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
            {getEntityNavLabel(pathname, t) ?? getPageTitle(pathname, t)}
          </nav>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        {/* SidebarInset already renders the <main> landmark; this is just the
            content padding wrapper. */}
        <div className="flex-1 bg-background p-6">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
