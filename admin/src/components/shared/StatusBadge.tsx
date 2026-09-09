import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface StatusBadgeProps {
  isActive: boolean
  activeLabel?: string
  inactiveLabel?: string
  className?: string
}

export function StatusBadge({
  isActive,
  activeLabel,
  inactiveLabel,
  className,
}: StatusBadgeProps) {
  const { t } = useTranslation()

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-normal",
        isActive
          ? "border-success/30 bg-success/10 text-success"
          : "border-muted-foreground/30 bg-muted text-muted-foreground",
        className
      )}
    >
      {isActive ? activeLabel ?? t("common.active") : inactiveLabel ?? t("common.inactive")}
    </Badge>
  )
}
