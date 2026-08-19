import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Trash2,
  ArrowUpDown,
  Settings2,
  ArrowUp,
  ArrowDown,
  X,
  Folder,
  FolderPlus,
  GripVertical,
  Inbox,
  Users,
  Search,
  Download,
} from "lucide-react";

import {
  listContacts,
  createContact,
  updateContact,
  deleteContactById,
  listCrmFields,
  createCrmField,
  updateCrmField,
  deleteCrmField,
  getCrmLayout,
  saveCrmLayout,
  listCrmFolders,
  createCrmFolder,
  updateCrmFolder,
  deleteCrmFolder,
  type Contact,
  type ContactStatus,
  type ContactFlag,
  type CrmField,
  type CrmFieldType,
  type CrmFieldOption,
  type CrmFolder,
} from "@/lib/data";


const STATUS_LABEL: Record<ContactStatus, string> = {
  niet_gecontacteerd: "Niet gecontacteerd",
  gecontacteerd: "Gecontacteerd",
};

const FLAG_LABEL: Record<ContactFlag, string> = {
  geen: "Geen",
  blacklist: "Blacklist",
  later_contacteren: "Later contacteren",
};

const STATUS_CLASS: Record<ContactStatus, string> = {
  niet_gecontacteerd:
    "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-100",
  gecontacteerd:
    "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-100",
};

const FLAG_CLASS: Record<ContactFlag, string> = {
  geen: "bg-muted text-muted-foreground border-border",
  blacklist:
    "bg-red-100 text-red-900 border-red-300 dark:bg-red-900/40 dark:text-red-100",
  later_contacteren:
    "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-900/40 dark:text-sky-100",
};

/* ---------- Kleurenpalet voor eigen dropdown-opties ---------- */

const COLORS: { key: string; label: string; cls: string; dot: string }[] = [
  { key: "slate", label: "Grijs", cls: "bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600", dot: "bg-slate-400" },
  { key: "red", label: "Rood", cls: "bg-red-100 text-red-900 border-red-300 dark:bg-red-900/40 dark:text-red-100 dark:border-red-700", dot: "bg-red-500" },
  { key: "orange", label: "Oranje", cls: "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-900/40 dark:text-orange-100 dark:border-orange-700", dot: "bg-orange-500" },
  { key: "amber", label: "Geel", cls: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-700", dot: "bg-amber-500" },
  { key: "emerald", label: "Groen", cls: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-700", dot: "bg-emerald-500" },
  { key: "sky", label: "Blauw", cls: "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-900/40 dark:text-sky-100 dark:border-sky-700", dot: "bg-sky-500" },
  { key: "violet", label: "Paars", cls: "bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-900/40 dark:text-violet-100 dark:border-violet-700", dot: "bg-violet-500" },
  { key: "pink", label: "Roze", cls: "bg-pink-100 text-pink-900 border-pink-300 dark:bg-pink-900/40 dark:text-pink-100 dark:border-pink-700", dot: "bg-pink-500" },
];

function colorClass(key: string): string {
  return (COLORS.find((c) => c.key === key) ?? COLORS[0]).cls;
}

const FIELD_TYPE_LABEL: Record<CrmFieldType, string> = {
  dropdown: "Dropdown",
  text: "Klein tekstvak",
  longtext: "Groot tekstvak",
};

const STATUS_SORT_ORDER: string[] = [
  "niet_gecontacteerd",
  "later_contacteren",
  "gecontacteerd",
  "blacklist",
];

function contactSortKey(c: Contact): string {
  if (c.flag === "blacklist") return "blacklist";
  if (c.flag === "later_contacteren") return "later_contacteren";
  return c.status;
}

type SortKey = "name" | "status" | "followUpDate" | "folder" | `custom:${string}`;
type SortDir = "asc" | "desc";

interface DraftOption {
  id: string;
  label: string;
  color: string;
}

function newOptionId(): string {
  return `opt-${Math.random().toString(36).slice(2, 9)}`;
}

interface BuiltinCol {
  key: string;
  label: string;
  width: string;
}

const BUILTIN_COLS: BuiltinCol[] = [
  { key: "b:name", label: "Naam", width: "min-w-[180px]" },
  { key: "b:phone", label: "Telefoon", width: "min-w-[150px]" },
  { key: "b:email", label: "Email", width: "min-w-[220px]" },
  { key: "b:status", label: "Status", width: "min-w-[190px]" },
  { key: "b:flag", label: "Markering", width: "min-w-[180px]" },
  { key: "b:followUpDate", label: "Terugcontact", width: "min-w-[160px]" },
  { key: "b:note", label: "Notitie", width: "min-w-[260px] w-[24%]" },
];

/** Tekstvak dat automatisch meegroeit met de inhoud. */
function AutoTextarea({
  value,
  onChange,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(resize, [value]);

  useEffect(() => {
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <Textarea
      ref={ref}
      value={value}
      rows={1}
      maxLength={maxLength}
      onChange={(e) => {
        onChange(e.target.value);
        resize();
      }}
      className="w-full min-h-[40px] resize-none overflow-hidden break-words leading-snug"
    />
  );
}



export function CRM() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [fields, setFields] = useState<CrmField[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteFieldId, setDeleteFieldId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // New contact form
  const [nName, setNName] = useState("");
  const [nPhone, setNPhone] = useState("");
  const [nEmail, setNEmail] = useState("");

  // Field dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [fName, setFName] = useState("");
  const [fType, setFType] = useState<CrmFieldType>("dropdown");
  const [fOptions, setFOptions] = useState<DraftOption[]>([
    { id: newOptionId(), label: "", color: "sky" },
  ]);
  const [manageOpen, setManageOpen] = useState(false);
  const [insertIndex, setInsertIndex] = useState(-1);
  const [columns, setColumns] = useState<string[]>([]);

  // Mappen
  const [folders, setFolders] = useState<CrmFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>("all"); // all | none | <id>
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState("sky");
  const [manageFoldersOpen, setManageFoldersOpen] = useState(false);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    listContacts()
      .then(setContacts)
      .catch((err) => toast.error("Contacten laden mislukt: " + (err as Error).message));
    listCrmFields()
      .then(setFields)
      .catch((err) => toast.error("Velden laden mislukt: " + (err as Error).message));
    getCrmLayout()
      .then(setColumns)
      .catch(() => {});
    listCrmFolders()
      .then(setFolders)
      .catch((err) => toast.error("Mappen laden mislukt: " + (err as Error).message));
  }, []);

  const addContact = async () => {
    if (!nName.trim()) {
      toast.error("Naam is verplicht");
      return;
    }
    try {
      const c = await createContact({
        name: nName.trim(),
        phone: nPhone.trim(),
        email: nEmail.trim(),
        folderId: activeFolder !== "all" && activeFolder !== "none" ? activeFolder : "",
      });
      setContacts((prev) => [c, ...prev]);
      setNName("");
      setNPhone("");
      setNEmail("");
      toast.success("Contact toegevoegd");
    } catch (err) {
      toast.error("Opslaan mislukt: " + (err as Error).message);
    }
  };

  /* ---------- Mappen ---------- */

  const saveNewFolder = async () => {
    const name = folderName.trim();
    if (!name) {
      toast.error("Geef de map een naam");
      return;
    }
    try {
      const created = await createCrmFolder({
        name,
        color: folderColor,
        position: folders.length,
      });
      setFolders((prev) => [...prev, created]);
      setFolderOpen(false);
      setFolderName("");
      setFolderColor("sky");
      toast.success("Map toegevoegd");
    } catch (err) {
      toast.error("Map opslaan mislukt: " + (err as Error).message);
    }
  };

  const folderTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const patchFolder = (id: string, p: Partial<Pick<CrmFolder, "name" | "color" | "position">>) => {
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, ...p } : f)));
    const existing = folderTimers.current[id];
    if (existing) clearTimeout(existing);
    folderTimers.current[id] = setTimeout(() => {
      updateCrmFolder(id, p).catch((err) =>
        toast.error("Map opslaan mislukt: " + (err as Error).message),
      );
    }, 500);
  };

  const moveFolder = (id: string, dir: -1 | 1) => {
    const idx = folders.findIndex((f) => f.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= folders.length) return;
    const next = [...folders];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    setFolders(next);
    next.forEach((f, i) => {
      if (f.position !== i) void updateCrmFolder(f.id, { position: i });
    });
  };

  const removeFolder = async (id: string) => {
    try {
      await deleteCrmFolder(id);
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setContacts((prev) => prev.map((c) => (c.folderId === id ? { ...c, folderId: "" } : c)));
      if (activeFolder === id) setActiveFolder("all");
      setDeleteFolderId(null);
      toast.success("Map verwijderd (contacten blijven bestaan)");
    } catch (err) {
      toast.error("Verwijderen mislukt: " + (err as Error).message);
    }
  };

  const dropOnFolder = (target: string) => {
    setDragOver(null);
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;
    const folderId = target === "none" ? "" : target;
    const c = contacts.find((x) => x.id === id);
    if (!c || c.folderId === folderId) return;
    setContacts((prev) => prev.map((x) => (x.id === id ? { ...x, folderId } : x)));
    updateContact(id, { folderId })
      .then(() =>
        toast.success(
          folderId
            ? `Verplaatst naar “${folders.find((f) => f.id === folderId)?.name ?? "map"}”`
            : "Uit map gehaald",
        ),
      )
      .catch((err) => toast.error("Verplaatsen mislukt: " + (err as Error).message));
  };


  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, Partial<Contact>>>({});

  const flushContact = (id: string) => {
    const p = pending.current[id];
    if (!p || Object.keys(p).length === 0) return;
    delete pending.current[id];
    const t = timers.current[id];
    if (t) {
      clearTimeout(t);
      delete timers.current[id];
    }
    updateContact(id, p).catch((err) =>
      toast.error("Opslaan mislukt: " + (err as Error).message),
    );
  };

  const patch = (id: string, p: Partial<Contact>) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...p } : c)));
    // Merge zodat gelijktijdige wijzigingen aan meerdere velden niet verloren gaan.
    pending.current[id] = { ...(pending.current[id] ?? {}), ...p };
    const existing = timers.current[id];
    if (existing) clearTimeout(existing);
    timers.current[id] = setTimeout(() => flushContact(id), 500);
  };

  // Nog niet opgeslagen wijzigingen wegschrijven bij verlaten van de pagina.
  useEffect(() => {
    const flushAll = () => Object.keys(pending.current).forEach((id) => flushContact(id));
    window.addEventListener("beforeunload", flushAll);
    window.addEventListener("pagehide", flushAll);
    return () => {
      window.removeEventListener("beforeunload", flushAll);
      window.removeEventListener("pagehide", flushAll);
      flushAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchCustom = (c: Contact, fieldId: string, value: string) => {
    const latest = pending.current[c.id]?.custom ?? c.custom;
    patch(c.id, { custom: { ...latest, [fieldId]: value } });
  };


  const remove = async (id: string) => {
    try {
      await deleteContactById(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      setDeleteId(null);
      toast.success("Contact verwijderd");
    } catch (err) {
      toast.error("Verwijderen mislukt: " + (err as Error).message);
    }
  };

  /* ---------- Field management ---------- */

  const resetFieldForm = () => {
    setFName("");
    setFType("dropdown");
    setFOptions([{ id: newOptionId(), label: "", color: "sky" }]);
  };

  const saveNewField = async () => {
    const name = fName.trim();
    if (!name) {
      toast.error("Geef het veld een naam");
      return;
    }
    const options: CrmFieldOption[] =
      fType === "dropdown"
        ? fOptions
            .filter((o) => o.label.trim())
            .map((o) => ({ id: o.id, label: o.label.trim(), color: o.color }))
        : [];
    if (fType === "dropdown" && options.length === 0) {
      toast.error("Voeg minstens één optie toe");
      return;
    }
    try {
      const created = await createCrmField({
        name,
        type: fType,
        options,
        position: fields.length,
      });
      const key = `f:${created.id}`;
      const base = orderedCols.filter((k) => k !== key);
      const at = insertIndex < 0 || insertIndex > base.length ? base.length : insertIndex;
      const nextCols = [...base.slice(0, at), key, ...base.slice(at)];
      setFields((prev) => [...prev, created]);
      void persistColumns(nextCols);
      setAddOpen(false);
      resetFieldForm();
      toast.success("Veld toegevoegd");
    } catch (err) {
      toast.error("Veld opslaan mislukt: " + (err as Error).message);
    }
  };

  const fieldTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const fieldPending = useRef<
    Record<string, Partial<Pick<CrmField, "name" | "options" | "position" | "type">>>
  >({});
  const [fieldSaving, setFieldSaving] = useState(0);
  const [fieldSavedAt, setFieldSavedAt] = useState<number | null>(null);

  const flushField = (id: string): Promise<void> => {
    const p = fieldPending.current[id];
    if (!p || Object.keys(p).length === 0) return Promise.resolve();
    delete fieldPending.current[id];
    const t = fieldTimers.current[id];
    if (t) {
      clearTimeout(t);
      delete fieldTimers.current[id];
    }
    setFieldSaving((n) => n + 1);
    return updateCrmField(id, p)
      .then(() => {
        setFieldSavedAt(Date.now());
      })
      .catch((err) => {
        // Bewaar de wijziging zodat een volgende poging ze opnieuw wegschrijft.
        fieldPending.current[id] = { ...p, ...(fieldPending.current[id] ?? {}) };
        toast.error("Veld opslaan mislukt: " + (err as Error).message);
      })
      .finally(() => setFieldSaving((n) => Math.max(0, n - 1)));
  };

  const flushAllFields = () =>
    Promise.all(Object.keys(fieldPending.current).map((id) => flushField(id)));

  useEffect(() => {
    const flushAll = () => {
      void flushAllFields();
    };
    window.addEventListener("beforeunload", flushAll);
    window.addEventListener("pagehide", flushAll);
    return () => {
      window.removeEventListener("beforeunload", flushAll);
      window.removeEventListener("pagehide", flushAll);
      flushAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchField = (
    id: string,
    p: Partial<Pick<CrmField, "name" | "options" | "position" | "type">>,
  ) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...p } : f)));
    fieldPending.current[id] = { ...(fieldPending.current[id] ?? {}), ...p };
    const existing = fieldTimers.current[id];
    if (existing) clearTimeout(existing);
    fieldTimers.current[id] = setTimeout(() => void flushField(id), 500);
  };



  /* ---------- Cel-renderers ---------- */

  const builtinCell = (c: Contact, key: string) => {
    switch (key) {
      case "b:name":
        return (
          <Input
            value={c.name}
            onChange={(e) => patch(c.id, { name: e.target.value })}
            maxLength={100}
          />
        );
      case "b:phone":
        return (
          <Input
            value={c.phone}
            onChange={(e) => patch(c.id, { phone: e.target.value })}
            maxLength={30}
          />
        );
      case "b:email":
        return (
          <Input
            type="email"
            value={c.email}
            onChange={(e) => patch(c.id, { email: e.target.value })}
            maxLength={255}
          />
        );
      case "b:status":
        return (
          <Select
            value={c.status}
            onValueChange={(v) => patch(c.id, { status: v as ContactStatus })}
          >
            <SelectTrigger className={`border ${STATUS_CLASS[c.status]}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABEL) as ContactStatus[]).map((k) => (
                <SelectItem key={k} value={k}>
                  <span
                    className={`inline-block px-2 py-0.5 rounded border text-xs ${STATUS_CLASS[k]}`}
                  >
                    {STATUS_LABEL[k]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "b:flag":
        return (
          <Select value={c.flag} onValueChange={(v) => patch(c.id, { flag: v as ContactFlag })}>
            <SelectTrigger className={`border ${FLAG_CLASS[c.flag]}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FLAG_LABEL) as ContactFlag[]).map((k) => (
                <SelectItem key={k} value={k}>
                  <span
                    className={`inline-block px-2 py-0.5 rounded border text-xs ${FLAG_CLASS[k]}`}
                  >
                    {FLAG_LABEL[k]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "b:followUpDate":
        return (
          <Input
            type="date"
            value={c.followUpDate}
            onChange={(e) => patch(c.id, { followUpDate: e.target.value })}
          />
        );
      default:
        return (
          <AutoTextarea
            value={c.note}
            onChange={(v) => patch(c.id, { note: v })}
            maxLength={1000}
          />
        );

    }
  };

  const customCell = (c: Contact, f: CrmField) => {
    const val = c.custom[f.id] ?? "";
    if (f.type === "dropdown") {
      const active = f.options.find((o) => o.id === val);
      return (
        <Select
          value={val || "__leeg"}
          onValueChange={(v) => patchCustom(c, f.id, v === "__leeg" ? "" : v)}
        >
          <SelectTrigger
            className={`border ${
              active ? colorClass(active.color) : "bg-muted text-muted-foreground"
            }`}
          >
            <SelectValue placeholder="Kies…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__leeg">
              <span className="text-xs text-muted-foreground">Leeg</span>
            </SelectItem>
            {f.options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                <span
                  className={`inline-block px-2 py-0.5 rounded border text-xs ${colorClass(o.color)}`}
                >
                  {o.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (f.type === "longtext") {
      return (
        <AutoTextarea
          value={val}
          onChange={(v) => patchCustom(c, f.id, v)}
          maxLength={5000}
        />

      );
    }
    return (
      <Input
        value={val}
        onChange={(e) => patchCustom(c, f.id, e.target.value)}
        maxLength={255}
      />
    );
  };


  const orderedCols = useMemo(() => {
    const all = [...BUILTIN_COLS.map((b) => b.key), ...fields.map((f) => `f:${f.id}`)];
    const kept = columns.filter((k) => all.includes(k));
    const missing = all.filter((k) => !kept.includes(k));
    return [...kept, ...missing];
  }, [columns, fields]);

  const persistColumns = async (next: string[]) => {
    setColumns(next);
    try {
      await saveCrmLayout(next);
    } catch (err) {
      toast.error("Volgorde opslaan mislukt: " + (err as Error).message);
    }
  };

  const moveColumn = (key: string, dir: -1 | 1) => {
    const idx = orderedCols.indexOf(key);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= orderedCols.length) return;
    const next = [...orderedCols];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    void persistColumns(next);
  };

  const colLabel = (key: string): string => {
    const b = BUILTIN_COLS.find((x) => x.key === key);
    if (b) return b.label;
    const f = fields.find((x) => `f:${x.id}` === key);
    return f?.name || "Veld";
  };

  const removeField = async (id: string) => {
    try {
      await deleteCrmField(id);
      setFields((prev) => prev.filter((f) => f.id !== id));
      setDeleteFieldId(null);
      if (sortKey === `custom:${id}`) setSortKey("status");
      toast.success("Veld verwijderd");
    } catch (err) {
      toast.error("Verwijderen mislukt: " + (err as Error).message);
    }
  };

  const addOptionTo = (field: CrmField) => {
    const current = fieldPending.current[field.id]?.options ?? field.options;
    patchField(field.id, {
      options: [...current, { id: newOptionId(), label: "Nieuwe optie", color: "slate" }],
    });
  };

  /* ---------- Sorting ---------- */

  const visible = useMemo(() => {
    const base =
      activeFolder === "all"
        ? contacts
        : activeFolder === "none"
          ? contacts.filter((c) => !c.folderId)
          : contacts.filter((c) => c.folderId === activeFolder);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    const terms = q.split(/\s+/);
    return base.filter((c) => {
      const customText = fields
        .map((f) => {
          const v = c.custom[f.id] ?? "";
          if (!v) return "";
          if (f.type === "dropdown") return f.options.find((o) => o.id === v)?.label ?? "";
          return v;
        })
        .join(" ");
      const hay = [
        c.name,
        c.phone,
        c.email,
        c.note,
        c.followUpDate,
        STATUS_LABEL[c.status] ?? "",
        FLAG_LABEL[c.flag] ?? "",
        folders.find((f) => f.id === c.folderId)?.name ?? "",
        customText,
      ]
        .join(" ")
        .toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [contacts, activeFolder, query, fields, folders]);


  const sorted = useMemo(() => {
    const arr = [...visible];

    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name, "nl", { sensitivity: "base" });
      } else if (sortKey === "folder") {
        const idx = (c: Contact) => {
          const i = folders.findIndex((f) => f.id === c.folderId);
          return i < 0 ? Number.MAX_SAFE_INTEGER : i;
        };
        cmp = idx(a) - idx(b);
        if (cmp === 0) cmp = a.name.localeCompare(b.name, "nl");
      } else if (sortKey === "followUpDate") {

        const av = a.followUpDate || "";
        const bv = b.followUpDate || "";
        if (!av && !bv) cmp = 0;
        else if (!av) cmp = 1;
        else if (!bv) cmp = -1;
        else cmp = av.localeCompare(bv);
      } else if (sortKey.startsWith("custom:")) {
        const fid = sortKey.slice(7);
        const field = fields.find((f) => f.id === fid);
        const av = a.custom[fid] ?? "";
        const bv = b.custom[fid] ?? "";
        if (field?.type === "dropdown") {
          const order = field.options.map((o) => o.id);
          const ai = av ? order.indexOf(av) : Number.MAX_SAFE_INTEGER;
          const bi = bv ? order.indexOf(bv) : Number.MAX_SAFE_INTEGER;
          cmp = (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
        } else {
          if (!av && !bv) cmp = 0;
          else if (!av) cmp = 1;
          else if (!bv) cmp = -1;
          else cmp = av.localeCompare(bv, "nl", { sensitivity: "base" });
        }
        if (cmp === 0) cmp = a.name.localeCompare(b.name, "nl");
      } else {
        const ai = STATUS_SORT_ORDER.indexOf(contactSortKey(a));
        const bi = STATUS_SORT_ORDER.indexOf(contactSortKey(b));
        cmp = ai - bi;
        if (cmp === 0) cmp = a.name.localeCompare(b.name, "nl");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [visible, fields, folders, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const deleteTarget = contacts.find((c) => c.id === deleteId) || null;
  const deleteFieldTarget = fields.find((f) => f.id === deleteFieldId) || null;
  const deleteFolderTarget = folders.find((f) => f.id === deleteFolderId) || null;

  const countFor = (key: string) =>
    key === "all"
      ? contacts.length
      : key === "none"
        ? contacts.filter((c) => !c.folderId).length
        : contacts.filter((c) => c.folderId === key).length;

  const dropZone = (key: string, label: string, icon: ReactNode, cls: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setActiveFolder(key)}
      onDragOver={(e) => {
        if (key === "all") return;
        e.preventDefault();
        setDragOver(key);
      }}
      onDragLeave={() => setDragOver((p) => (p === key ? null : p))}
      onDrop={(e) => {
        if (key === "all") return;
        e.preventDefault();
        dropOnFolder(key);
      }}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${cls} ${
        activeFolder === key ? "ring-2 ring-primary" : ""
      } ${dragOver === key ? "scale-[1.03] ring-2 ring-primary border-dashed" : ""}`}
    >
      {icon}
      <span className="font-medium">{label}</span>
      <span className="text-xs opacity-70">{countFor(key)}</span>
    </button>
  );


  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-3">Nieuw contact</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
          <div>
            <Label htmlFor="crm-name">Naam</Label>
            <Input
              id="crm-name"
              value={nName}
              onChange={(e) => setNName(e.target.value)}
              placeholder="Voor- en achternaam"
              maxLength={100}
            />
          </div>
          <div>
            <Label htmlFor="crm-phone">Telefoonnummer</Label>
            <Input
              id="crm-phone"
              value={nPhone}
              onChange={(e) => setNPhone(e.target.value)}
              placeholder="+32 ..."
              maxLength={30}
            />
          </div>
          <div>
            <Label htmlFor="crm-email">Email</Label>
            <Input
              id="crm-email"
              type="email"
              value={nEmail}
              onChange={(e) => setNEmail(e.target.value)}
              placeholder="naam@voorbeeld.com"
              maxLength={255}
            />
          </div>
          <div className="flex items-end sm:col-span-2 xl:col-span-1">
            <Button onClick={addContact} className="w-full md:w-auto">
              <Plus className="w-4 h-4 mr-1" />
              Toevoegen
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">Mappen</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setFolderOpen(true)}>
              <FolderPlus className="w-4 h-4 mr-1" />
              Map toevoegen
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setManageFoldersOpen(true)}
              disabled={folders.length === 0}
            >
              <Settings2 className="w-4 h-4 mr-1" />
              Mappen beheren
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {dropZone("all", "Alle contacten", <Users className="w-4 h-4" />, "bg-muted")}
          {dropZone("none", "Zonder map", <Inbox className="w-4 h-4" />, "bg-muted")}
          {folders.map((f) =>
            dropZone(f.id, f.name || "Map", <Folder className="w-4 h-4" />, colorClass(f.color)),
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Sleep een contact met het greepje links in de tabel naar een map.
        </p>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">
            {activeFolder === "all"
              ? "Alle contacten"
              : activeFolder === "none"
                ? "Zonder map"
                : folders.find((f) => f.id === activeFolder)?.name || "Map"}{" "}
            ({sorted.length})
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Veld toevoegen
            </Button>
            <Button size="sm" variant="outline" onClick={() => setManageOpen(true)}>
              <Settings2 className="w-4 h-4 mr-1" />
              Kolommen beheren
            </Button>
            <span className="text-xs text-muted-foreground min-w-[110px]">
              {fieldSaving > 0
                ? "Velden opslaan…"
                : fieldSavedAt
                  ? "Velden opgeslagen"
                  : ""}
            </span>
          </div>
        </div>


        <div className="flex items-center gap-2 text-sm flex-wrap mb-3">
          <span className="text-muted-foreground">Sorteer:</span>
          <Button
            size="sm"
            variant={sortKey === "status" ? "default" : "outline"}
            onClick={() => toggleSort("status")}
          >
            Status <ArrowUpDown className="w-3 h-3 ml-1" />
          </Button>
          <Button
            size="sm"
            variant={sortKey === "name" ? "default" : "outline"}
            onClick={() => toggleSort("name")}
          >
            Naam <ArrowUpDown className="w-3 h-3 ml-1" />
          </Button>
          <Button
            size="sm"
            variant={sortKey === "followUpDate" ? "default" : "outline"}
            onClick={() => toggleSort("followUpDate")}
          >
            Terugcontact <ArrowUpDown className="w-3 h-3 ml-1" />
          </Button>
          <Button
            size="sm"
            variant={sortKey === "folder" ? "default" : "outline"}
            onClick={() => toggleSort("folder")}
          >
            Map <ArrowUpDown className="w-3 h-3 ml-1" />
          </Button>

          {fields.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={sortKey === `custom:${f.id}` ? "default" : "outline"}
              onClick={() => toggleSort(`custom:${f.id}`)}
            >
              {f.name || "Veld"} <ArrowUpDown className="w-3 h-3 ml-1" />
            </Button>
          ))}
        </div>

        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nog geen contacten. Voeg er hierboven één toe.
          </p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <Table className="w-full table-auto">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[36px]"></TableHead>
                  {orderedCols.map((key) => {
                    const b = BUILTIN_COLS.find((x) => x.key === key);
                    if (b)
                      return (
                        <TableHead key={key} className={b.width}>
                          {b.label}
                        </TableHead>
                      );
                    const f = fields.find((x) => `f:${x.id}` === key);
                    if (!f) return null;
                    return (
                      <TableHead
                        key={key}
                        className={f.type === "longtext" ? "min-w-[260px] w-[20%]" : "min-w-[170px]"}
                      >
                        {f.name || "Veld"}
                      </TableHead>
                    );
                  })}
                  <TableHead className="min-w-[150px]">Map</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((c) => (
                  <TableRow
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggingId(c.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", c.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOver(null);
                    }}
                    className={draggingId === c.id ? "opacity-50" : undefined}
                  >
                    <TableCell className="cursor-grab active:cursor-grabbing text-muted-foreground">
                      <GripVertical className="w-4 h-4" />
                    </TableCell>
                    {orderedCols.map((key) => {
                      if (key.startsWith("b:"))
                        return (
                          <TableCell key={key} className="align-top">
                            {builtinCell(c, key)}
                          </TableCell>
                        );
                      const f = fields.find((x) => `f:${x.id}` === key);
                      if (!f) return null;
                      return (
                        <TableCell key={key} className="align-top">
                          {customCell(c, f)}
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      <Select
                        value={c.folderId || "__geen"}
                        onValueChange={(v) => patch(c.id, { folderId: v === "__geen" ? "" : v })}
                      >
                        <SelectTrigger
                          className={`border ${
                            c.folderId
                              ? colorClass(folders.find((f) => f.id === c.folderId)?.color ?? "slate")
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <SelectValue placeholder="Geen map" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__geen">
                            <span className="text-xs text-muted-foreground">Geen map</span>
                          </SelectItem>
                          {folders.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              <span
                                className={`inline-block px-2 py-0.5 rounded border text-xs ${colorClass(f.color)}`}
                              >
                                {f.name || "Map"}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteId(c.id)}
                        aria-label="Verwijder contact"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Nieuw veld */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) resetFieldForm();
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nieuw veld toevoegen</DialogTitle>
            <DialogDescription>
              Kies een naam en een type. Het veld verschijnt als extra kolom bij
              elk contact.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="fld-name">Naam</Label>
              <Input
                id="fld-name"
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder="bv. Bron, Bedrijf, Verslag"
                maxLength={60}
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={fType} onValueChange={(v) => setFType(v as CrmFieldType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIELD_TYPE_LABEL) as CrmFieldType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {FIELD_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {fType === "dropdown" && (
              <div className="space-y-2">
                <Label>Opties</Label>
                {fOptions.map((o, i) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <Input
                      value={o.label}
                      onChange={(e) =>
                        setFOptions((prev) =>
                          prev.map((p, pi) =>
                            pi === i ? { ...p, label: e.target.value } : p,
                          ),
                        )
                      }
                      placeholder={`Optie ${i + 1}`}
                      maxLength={60}
                    />
                    <Select
                      value={o.color}
                      onValueChange={(v) =>
                        setFOptions((prev) =>
                          prev.map((p, pi) => (pi === i ? { ...p, color: v } : p)),
                        )
                      }
                    >
                      <SelectTrigger className={`w-full sm:w-[130px] shrink-0 border ${colorClass(o.color)}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLORS.map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            <span className="flex items-center gap-2">
                              <span className={`w-3 h-3 rounded-full ${c.dot}`} />
                              {c.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Optie verwijderen"
                      onClick={() =>
                        setFOptions((prev) => prev.filter((_, pi) => pi !== i))
                      }
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setFOptions((prev) => [
                      ...prev,
                      { id: newOptionId(), label: "", color: "slate" },
                    ])
                  }
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Optie toevoegen
                </Button>
              </div>
            )}

            <div>
              <Label>Plaats in de tabel</Label>
              <Select
                value={String(insertIndex)}
                onValueChange={(v) => setInsertIndex(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-1">Helemaal achteraan</SelectItem>
                  <SelectItem value="0">Helemaal vooraan</SelectItem>
                  {orderedCols.map((k, i) => (
                    <SelectItem key={k} value={String(i + 1)}>
                      Na “{colLabel(k)}”
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={saveNewField}>Veld opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kolommen beheren */}
      <Dialog
        open={manageOpen}
        onOpenChange={(o) => {
          setManageOpen(o);
          if (!o) void flushAllFields();
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Kolommen beheren</DialogTitle>
            <DialogDescription>
              Zet elke kolom — ook de standaardkolommen — met de pijltjes op de plaats
              die je wil. Eigen velden kan je hier ook hernoemen en aanpassen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {orderedCols.map((key, idx) => {
              const builtin = BUILTIN_COLS.find((x) => x.key === key);
              const f = builtin ? null : fields.find((x) => `f:${x.id}` === key) ?? null;
              if (!builtin && !f) return null;
              return (
                <div key={key} className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6 text-right">
                      {idx + 1}
                    </span>
                    {builtin ? (
                      <span className="flex-1 text-sm font-medium">{builtin.label}</span>
                    ) : (
                      <Input
                        value={f!.name}
                        onChange={(e) => patchField(f!.id, { name: e.target.value })}
                        maxLength={60}
                      />
                    )}
                    {builtin ? (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        Standaard
                      </span>
                    ) : (
                      <Select
                        value={f!.type}
                        onValueChange={(v) => patchField(f!.id, { type: v as CrmFieldType })}
                      >
                        <SelectTrigger className="w-full sm:w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(FIELD_TYPE_LABEL) as CrmFieldType[]).map((t) => (
                            <SelectItem key={t} value={t}>
                              {FIELD_TYPE_LABEL[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Naar links"
                      disabled={idx === 0}
                      onClick={() => moveColumn(key, -1)}
                    >
                      <ArrowUp className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Naar rechts"
                      disabled={idx === orderedCols.length - 1}
                      onClick={() => moveColumn(key, 1)}
                    >
                      <ArrowDown className="w-4 h-4" />
                    </Button>
                    {f && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Veld verwijderen"
                        onClick={() => setDeleteFieldId(f.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>

                  {f && f.type === "dropdown" && (
                    <div className="space-y-2">
                      {f.options.map((o, oi) => (
                        <div key={o.id} className="flex items-center gap-2">
                          <Input
                            value={o.label}
                            onChange={(e) =>
                              patchField(f.id, {
                                options: f.options.map((p, pi) =>
                                  pi === oi ? { ...p, label: e.target.value } : p,
                                ),
                              })
                            }
                            maxLength={60}
                          />
                          <Select
                            value={o.color}
                            onValueChange={(v) =>
                              patchField(f.id, {
                                options: f.options.map((p, pi) =>
                                  pi === oi ? { ...p, color: v } : p,
                                ),
                              })
                            }
                          >
                            <SelectTrigger className={`w-full sm:w-[130px] shrink-0 border ${colorClass(o.color)}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {COLORS.map((c) => (
                                <SelectItem key={c.key} value={c.key}>
                                  <span className="flex items-center gap-2">
                                    <span className={`w-3 h-3 rounded-full ${c.dot}`} />
                                    {c.label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Optie verwijderen"
                            onClick={() =>
                              patchField(f.id, {
                                options: f.options.filter((_, pi) => pi !== oi),
                              })
                            }
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      <Button size="sm" variant="outline" onClick={() => addOptionTo(f)}>
                        <Plus className="w-4 h-4 mr-1" />
                        Optie toevoegen
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter className="items-center gap-2 sm:justify-between">
            <span className="text-xs text-muted-foreground">
              {fieldSaving > 0 ? "Opslaan…" : fieldSavedAt ? "Alles opgeslagen" : ""}
            </span>
            <Button
              onClick={async () => {
                await flushAllFields();
                toast.success("Veldinstellingen opgeslagen");
                setManageOpen(false);
              }}
            >
              Opslaan en sluiten
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contact verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.name}" wordt definitief verwijderd.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && remove(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteFieldId}
        onOpenChange={(o) => !o && setDeleteFieldId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Veld verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFieldTarget
                ? `De kolom "${deleteFieldTarget.name}" verdwijnt uit je CRM. Ingevulde waarden worden niet meer weergegeven.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteFieldId && removeField(deleteFieldId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Nieuwe map */}
      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nieuwe map</DialogTitle>
            <DialogDescription>
              Geef de map een naam en kleur, bv. “Bellen vandaag” of “Later contacteren”.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="fol-name">Naam</Label>
              <Input
                id="fol-name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="bv. Bellen vandaag"
                maxLength={60}
              />
            </div>
            <div>
              <Label>Kleur</Label>
              <Select value={folderColor} onValueChange={setFolderColor}>
                <SelectTrigger className={`border ${colorClass(folderColor)}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLORS.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      <span className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${c.dot}`} />
                        {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={saveNewFolder}>Map opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mappen beheren */}
      <Dialog open={manageFoldersOpen} onOpenChange={setManageFoldersOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mappen beheren</DialogTitle>
            <DialogDescription>
              Hernoem mappen, geef ze een andere kleur of zet ze in een andere volgorde.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {folders.map((f, idx) => (
              <div key={f.id} className="flex items-center gap-2 rounded-lg border p-2">
                <span className="text-xs text-muted-foreground w-6 text-right">{idx + 1}</span>
                <Input
                  value={f.name}
                  onChange={(e) => patchFolder(f.id, { name: e.target.value })}
                  maxLength={60}
                />
                <Select value={f.color} onValueChange={(v) => patchFolder(f.id, { color: v })}>
                  <SelectTrigger className={`w-full sm:w-[130px] shrink-0 border ${colorClass(f.color)}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLORS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        <span className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${c.dot}`} />
                          {c.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Naar boven"
                  disabled={idx === 0}
                  onClick={() => moveFolder(f.id, -1)}
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Naar onder"
                  disabled={idx === folders.length - 1}
                  onClick={() => moveFolder(f.id, 1)}
                >
                  <ArrowDown className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Map verwijderen"
                  onClick={() => setDeleteFolderId(f.id)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setManageFoldersOpen(false)}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteFolderId} onOpenChange={(o) => !o && setDeleteFolderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Map verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFolderTarget
                ? `De map "${deleteFolderTarget.name}" wordt verwijderd. De contacten blijven bestaan en komen bij “Zonder map”.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteFolderId && removeFolder(deleteFolderId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

  );
}
