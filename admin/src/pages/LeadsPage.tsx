import { useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useLeads } from "@/hooks/useLeads"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Pagination } from "@/components/shared/Pagination"

const PAGE_SIZE = 25

export function LeadsPage() {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState(1)

  const { data, isLoading } = useLeads({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("leads.title")}</h1>
        <p className="text-muted-foreground">{t("leads.subtitle")}</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : !data?.items.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("leads.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("leads.name")}</TableHead>
                  <TableHead>{t("leads.contact")}</TableHead>
                  <TableHead>{t("leads.email")}</TableHead>
                  <TableHead>{t("leads.phone")}</TableHead>
                  <TableHead>{t("leads.interest")}</TableHead>
                  <TableHead>{t("leads.extra")}</TableHead>
                  <TableHead>{t("leads.date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      {lead.name}
                      {lead.notes && (
                        <p className="mt-0.5 max-w-56 truncate text-xs text-muted-foreground">
                          {lead.notes}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/conversations/${lead.contact_id}`}
                        className="text-primary hover:underline"
                      >
                        {lead.contact_display_name ?? t("leads.viewConversation")}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {lead.email ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {lead.phone ?? "—"}
                    </TableCell>
                    <TableCell>{lead.interest ?? "—"}</TableCell>
                    <TableCell>
                      {Object.keys(lead.extra).length === 0 ? (
                        "—"
                      ) : (
                        <div className="flex max-w-64 flex-wrap gap-1">
                          {Object.entries(lead.extra).map(([key, value]) => (
                            <Badge key={key} variant="outline" className="text-xs">
                              {key}: {value}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(lead.created_at + "Z").toLocaleDateString(
                        i18n.language
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
