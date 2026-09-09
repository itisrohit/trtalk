import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react"
import {
  useCreateFaqEntry,
  useDeleteFaqEntry,
  useFaqEntries,
  useFaqSearchPreview,
  useReembedAll,
  useUpdateFaqEntry,
} from "@/hooks/useFaq"
import type { FaqEntry } from "@/types/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { StatusBadge } from "@/components/shared/StatusBadge"

interface EntryFormState {
  question: string
  answer: string
  tags: string
}

const EMPTY_FORM: EntryFormState = { question: "", answer: "", tags: "" }

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function EntryDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: FaqEntry | null
}) {
  const { t } = useTranslation()
  const createEntry = useCreateFaqEntry()
  const updateEntry = useUpdateFaqEntry()

  const [form, setForm] = useState<EntryFormState>(EMPTY_FORM)
  const [touched, setTouched] = useState(false)

  // Sync form when the dialog (re)opens for a different entry
  const [lastKey, setLastKey] = useState<string | null>(null)
  const key = open ? editing?.id ?? "new" : null
  if (key !== lastKey) {
    setLastKey(key)
    if (key !== null) {
      setForm(
        editing
          ? {
              question: editing.question,
              answer: editing.answer,
              tags: editing.tags.join(", "),
            }
          : EMPTY_FORM
      )
      setTouched(false)
    }
  }

  const questionMissing = form.question.trim() === ""
  const answerMissing = form.answer.trim() === ""
  const isPending = createEntry.isPending || updateEntry.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (questionMissing || answerMissing) return

    const payload = {
      question: form.question.trim(),
      answer: form.answer.trim(),
      tags: parseTags(form.tags),
    }
    try {
      if (editing) {
        await updateEntry.mutateAsync({ id: editing.id, ...payload })
      } else {
        await createEntry.mutateAsync(payload)
      }
      toast.success(t("faq.saved"))
      onOpenChange(false)
    } catch {
      toast.error(t("faq.saveError"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? t("faq.editEntry") : t("faq.newEntry")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="faq-question">{t("faq.question")}</Label>
            <Input
              id="faq-question"
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
              autoFocus
            />
            {touched && questionMissing && (
              <p className="text-xs text-destructive">
                {t("faq.validation.questionRequired")}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="faq-answer">{t("faq.answer")}</Label>
            <Textarea
              id="faq-answer"
              value={form.answer}
              onChange={(e) => setForm({ ...form, answer: e.target.value })}
              className="min-h-[120px]"
            />
            {touched && answerMissing && (
              <p className="text-xs text-destructive">
                {t("faq.validation.answerRequired")}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="faq-tags">{t("faq.tags")}</Label>
            <Input
              id="faq-tags"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder={t("faq.tagsHint")}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SearchPreview() {
  const { t } = useTranslation()
  const [input, setInput] = useState("")
  const [query, setQuery] = useState("")
  const { data: hits, isFetching } = useFaqSearchPreview(query)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("faq.preview.title")}</CardTitle>
        <CardDescription>{t("faq.preview.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setQuery(input)
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("faq.preview.placeholder")}
          />
          <Button type="submit" disabled={isFetching || input.trim() === ""}>
            <Search className="mr-2 h-4 w-4" />
            {t("faq.preview.run")}
          </Button>
        </form>

        {query && hits && hits.length === 0 && !isFetching && (
          <p className="text-sm text-muted-foreground">{t("faq.preview.noResults")}</p>
        )}
        {hits && hits.length > 0 && (
          <ul className="space-y-3">
            {hits.map((hit) => (
              <li key={hit.entry.id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{hit.entry.question}</p>
                  <Badge variant="outline" className="shrink-0 font-mono text-xs">
                    {(hit.similarity * 100).toFixed(1)}% {t("faq.preview.similarity")}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{hit.entry.answer}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function FaqPage() {
  const { t, i18n } = useTranslation()
  const { data: entries, isLoading } = useFaqEntries()
  const deleteEntry = useDeleteFaqEntry()
  const reembedAll = useReembedAll()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<FaqEntry | null>(null)
  const [deleting, setDeleting] = useState<FaqEntry | null>(null)

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (entry: FaqEntry) => {
    setEditing(entry)
    setDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteEntry.mutateAsync(deleting.id)
      toast.success(t("faq.deleted"))
    } catch {
      toast.error(t("common.error"))
    } finally {
      setDeleting(null)
    }
  }

  const handleReembed = async () => {
    try {
      const { reembedded } = await reembedAll.mutateAsync()
      toast.success(t("faq.reembedDone", { count: reembedded }))
    } catch {
      toast.error(t("faq.reembedError"))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("faq.title")}</h1>
          <p className="text-muted-foreground">{t("faq.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleReembed}
            disabled={reembedAll.isPending || !entries?.length}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${reembedAll.isPending ? "animate-spin" : ""}`}
            />
            {t("faq.reembedAll")}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t("faq.newEntry")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : !entries?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("faq.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("faq.question")}</TableHead>
                  <TableHead>{t("faq.tags")}</TableHead>
                  <TableHead>{t("faq.updatedAt")}</TableHead>
                  <TableHead className="w-28 text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{entry.question}</span>
                        <StatusBadge
                          isActive={entry.has_embedding}
                          activeLabel={t("faq.embedded")}
                          inactiveLabel={t("faq.notEmbedded")}
                        />
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {entry.answer}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {entry.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(entry.updated_at + "Z").toLocaleDateString(i18n.language)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(entry)}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">{t("common.edit")}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setDeleting(entry)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">{t("common.delete")}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SearchPreview />

      <EntryDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("faq.deleteTitle")}
        description={t("faq.deleteConfirm", { question: deleting?.question ?? "" })}
        confirmLabel={t("common.delete")}
        onConfirm={handleDelete}
        isLoading={deleteEntry.isPending}
        variant="destructive"
      />
    </div>
  )
}
