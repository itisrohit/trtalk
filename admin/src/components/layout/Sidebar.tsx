import { Link, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  BookOpen,
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  UserPlus,
  Wrench,
  Smartphone,
} from "lucide-react"
import { useContacts } from "@/hooks/useContacts"
import { cn } from "@/lib/utils"

const navigation = [
  { key: "nav.dashboard", href: "/", icon: LayoutDashboard },
  { key: "nav.prompt", href: "/prompt", icon: Sparkles },
  { key: "nav.faq", href: "/faq", icon: BookOpen },
  { key: "nav.tools", href: "/tools", icon: Wrench },
  { key: "nav.conversations", href: "/conversations", icon: MessageSquare },
  { key: "nav.leads", href: "/leads", icon: UserPlus },
  { key: "nav.whatsapp", href: "/whatsapp", icon: Smartphone },
]

export function Sidebar() {
  const { t } = useTranslation()
  const location = useLocation()
  // Waiting-for-human badge on the conversations entry (polls, ADR-004)
  const { data: humanCount } = useContacts({ mode: "human", limit: 1 }, { poll: true })

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center border-b border-sidebar-border px-3">
        {/* The lockup SVG carries the same charcoal canvas as --sidebar: seamless */}
        <img src="/trtalk-logo.svg" alt="TrTalk" className="h-9" />
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navigation.map((item) => {
          const isActive =
            item.href === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.href)

          return (
            <Link
              key={item.key}
              to={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {t(item.key)}
              {item.href === "/conversations" && (humanCount?.total ?? 0) > 0 && (
                <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
                  {humanCount?.total}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
