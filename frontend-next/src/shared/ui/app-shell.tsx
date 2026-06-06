import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
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
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'

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

type AppShellProps = {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { clearSession, session } = useAuth()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

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
      void navigate({ to: '/login', replace: true })
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
            <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-primary/95 to-primary text-primary-foreground shadow-sm">
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

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const isActive = pathname.startsWith(item.match)
                  const Icon = item.icon
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.label}
                      >
                        <Link to={item.to}>
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
                      isActive={pathname.startsWith('/dashboard')}
                      tooltip="数据看板"
                    >
                      <Link to="/dashboard">
                        <LayoutDashboard />
                        <span>数据看板</span>
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
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith('/fields')}
                      tooltip="字段词典"
                    >
                      <Link to="/fields">
                        <ClipboardList />
                        <span>字段词典</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith('/vocabularies')}
                      tooltip="受控词表"
                    >
                      <Link to="/vocabularies">
                        <Tag />
                        <span>受控词表</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith('/recipes')}
                      tooltip="Recipe"
                    >
                      <Link to="/recipes">
                        <BookOpen />
                        <span>Recipe</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

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
          <Separator orientation="vertical" className="h-4" />
          <nav className="flex items-center gap-1 text-sm font-medium text-foreground">
            {(() => {
              if (pathname.startsWith('/experiments')) return '实验记录'
              if (pathname.startsWith('/setup-library')) return 'Setup 库'
              if (pathname.startsWith('/dashboard')) return '数据看板'
              if (pathname.startsWith('/fields')) return '字段词典'
              if (pathname.startsWith('/vocabularies')) return '受控词表'
              if (pathname.startsWith('/recipes')) return 'Recipe'
              return ''
            })()}
          </nav>
        </header>
        <main className="flex-1 overflow-auto bg-background p-6">
          <div className="mx-auto w-full max-w-[1440px]">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
