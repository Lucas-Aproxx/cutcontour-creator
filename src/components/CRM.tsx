import { useEffect, useMemo, useState } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, ArrowUpDown } from "lucide-react";

type ContactStatus = "niet_gecontacteerd" | "gecontacteerd";
type ContactFlag = "geen" | "blacklist" | "later_contacteren";

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: ContactStatus;
  flag: ContactFlag;
  followUpDate: string; // yyyy-mm-dd
  note: string;
}

const STORAGE_KEY = "crm.contacts.v1";

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

// Sorting order per status when sorting by "status"
const STATUS_SORT_ORDER: string[] = [
  "niet_gecontacteerd",
  "later_contacteren",
  "gecontacteerd",
  "blacklist",
];

function contactSortKey(c: Contact): string {
  // Blacklist and later_contacteren override the plain status for grouping.
  if (c.flag === "blacklist") return "blacklist";
  if (c.flag === "later_contacteren") return "later_contacteren";
  return c.status;
}

function loadContacts(): Contact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveContacts(c: Contact[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

type SortKey = "name" | "status" | "followUpDate";
type SortDir = "asc" | "desc";

export function CRM() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // New contact form
  const [nName, setNName] = useState("");
  const [nPhone, setNPhone] = useState("");
  const [nEmail, setNEmail] = useState("");

  useEffect(() => {
    setContacts(loadContacts());
  }, []);

  const update = (next: Contact[]) => {
    setContacts(next);
    saveContacts(next);
  };

  const addContact = () => {
    if (!nName.trim()) {
      toast.error("Naam is verplicht");
      return;
    }
    const c: Contact = {
      id: crypto.randomUUID(),
      name: nName.trim(),
      phone: nPhone.trim(),
      email: nEmail.trim(),
      status: "niet_gecontacteerd",
      flag: "geen",
      followUpDate: "",
      note: "",
    };
    update([c, ...contacts]);
    setNName("");
    setNPhone("");
    setNEmail("");
    toast.success("Contact toegevoegd");
  };

  const patch = (id: string, p: Partial<Contact>) => {
    update(contacts.map((c) => (c.id === id ? { ...c, ...p } : c)));
  };

  const remove = (id: string) => {
    update(contacts.filter((c) => c.id !== id));
    setDeleteId(null);
    toast.success("Contact verwijderd");
  };

  const sorted = useMemo(() => {
    const arr = [...contacts];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = a.name.localeCompare(b.name, "nl", { sensitivity: "base" });
      } else if (sortKey === "followUpDate") {
        const av = a.followUpDate || "";
        const bv = b.followUpDate || "";
        if (!av && !bv) cmp = 0;
        else if (!av) cmp = 1;
        else if (!bv) cmp = -1;
        else cmp = av.localeCompare(bv);
      } else {
        // status
        const ai = STATUS_SORT_ORDER.indexOf(contactSortKey(a));
        const bi = STATUS_SORT_ORDER.indexOf(contactSortKey(b));
        cmp = ai - bi;
        if (cmp === 0) cmp = a.name.localeCompare(b.name, "nl");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [contacts, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const deleteTarget = contacts.find((c) => c.id === deleteId) || null;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-3">Nieuw contact</h2>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
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
          <div className="flex items-end">
            <Button onClick={addContact} className="w-full md:w-auto">
              <Plus className="w-4 h-4 mr-1" />
              Toevoegen
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">Contacten ({contacts.length})</h2>
          <div className="flex items-center gap-2 text-sm">
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
          </div>
        </div>

        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nog geen contacten. Voeg er hierboven één toe.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[160px]">Naam</TableHead>
                  <TableHead className="min-w-[140px]">Telefoon</TableHead>
                  <TableHead className="min-w-[180px]">Email</TableHead>
                  <TableHead className="min-w-[190px]">Status</TableHead>
                  <TableHead className="min-w-[180px]">Markering</TableHead>
                  <TableHead className="min-w-[160px]">Terugcontact</TableHead>
                  <TableHead className="min-w-[220px]">Notitie</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Input
                        value={c.name}
                        onChange={(e) => patch(c.id, { name: e.target.value })}
                        maxLength={100}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={c.phone}
                        onChange={(e) => patch(c.id, { phone: e.target.value })}
                        maxLength={30}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="email"
                        value={c.email}
                        onChange={(e) => patch(c.id, { email: e.target.value })}
                        maxLength={255}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={c.status}
                        onValueChange={(v) =>
                          patch(c.id, { status: v as ContactStatus })
                        }
                      >
                        <SelectTrigger
                          className={`border ${STATUS_CLASS[c.status]}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_LABEL) as ContactStatus[]).map(
                            (k) => (
                              <SelectItem key={k} value={k}>
                                <span
                                  className={`inline-block px-2 py-0.5 rounded border text-xs ${STATUS_CLASS[k]}`}
                                >
                                  {STATUS_LABEL[k]}
                                </span>
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={c.flag}
                        onValueChange={(v) =>
                          patch(c.id, { flag: v as ContactFlag })
                        }
                      >
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
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        value={c.followUpDate}
                        onChange={(e) =>
                          patch(c.id, { followUpDate: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Textarea
                        value={c.note}
                        onChange={(e) => patch(c.id, { note: e.target.value })}
                        rows={2}
                        maxLength={1000}
                        className="min-h-[40px]"
                      />
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
    </div>
  );
}
