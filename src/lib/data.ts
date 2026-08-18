import { supabase } from "@/integrations/supabase/client";

export type ShapeType = "rect" | "ellipse";

export interface PresetShape {
  type: ShapeType;
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
}

export interface Preset {
  id: string;
  name: string;
  shapes: PresetShape[];
}

export type ContactStatus = "niet_gecontacteerd" | "gecontacteerd";
export type ContactFlag = "geen" | "blacklist" | "later_contacteren";

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: ContactStatus;
  flag: ContactFlag;
  followUpDate: string;
  note: string;
  custom: Record<string, string>;
}

export type CrmFieldType = "dropdown" | "text" | "longtext";

export interface CrmFieldOption {
  id: string;
  label: string;
  color: string;
}

export interface CrmField {
  id: string;
  name: string;
  type: CrmFieldType;
  options: CrmFieldOption[];
  position: number;
}

function normOptions(raw: unknown): CrmFieldOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o: any, i: number) => ({
    id: String(o?.id ?? `opt-${i}`),
    label: String(o?.label ?? ""),
    color: String(o?.color ?? "slate"),
  }));
}

function normCustom(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = v == null ? "" : String(v);
  }
  return out;
}


function normShapes(raw: unknown): PresetShape[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s: any) => ({
    type: s?.type === "ellipse" ? "ellipse" : "rect",
    xMm: Number(s?.xMm) || 0,
    yMm: Number(s?.yMm) || 0,
    wMm: Number(s?.wMm) || 0,
    hMm: Number(s?.hMm) || 0,
  }));
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Niet ingelogd");
  return id;
}

/* ---------------- Presets ---------------- */

export async function listPresets(): Promise<Preset[]> {
  const { data, error } = await supabase
    .from("presets")
    .select("id, name, shapes")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    shapes: normShapes(r.shapes),
  }));
}

export async function createPresets(
  items: { name: string; shapes: PresetShape[] }[],
): Promise<Preset[]> {
  if (items.length === 0) return [];
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("presets")
    .insert(items.map((p) => ({ user_id: userId, name: p.name, shapes: p.shapes as unknown as any })))
    .select("id, name, shapes");
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, shapes: normShapes(r.shapes) }));
}

export async function deletePresetById(id: string): Promise<void> {
  const { error } = await supabase.from("presets").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- Contacts ---------------- */

export async function listContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, name, phone, email, status, flag, follow_up_date, note, custom")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    status: (r.status as ContactStatus) ?? "niet_gecontacteerd",
    flag: (r.flag as ContactFlag) ?? "geen",
    followUpDate: r.follow_up_date ?? "",
    note: r.note ?? "",
    custom: normCustom(r.custom),
  }));
}

export async function createContact(input: {
  name: string;
  phone: string;
  email: string;
}): Promise<Contact> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("contacts")
    .insert({ user_id: userId, ...input })
    .select("id, name, phone, email, status, flag, follow_up_date, note, custom")
    .single();
  if (error) throw error;
  const r = data as any;
  return {
    id: r.id,
    name: r.name ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    status: (r.status as ContactStatus) ?? "niet_gecontacteerd",
    flag: (r.flag as ContactFlag) ?? "geen",
    followUpDate: r.follow_up_date ?? "",
    note: r.note ?? "",
    custom: normCustom(r.custom),
  };
}

export async function updateContact(id: string, patch: Partial<Contact>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.flag !== undefined) row.flag = patch.flag;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.custom !== undefined) row.custom = patch.custom;
  if (patch.followUpDate !== undefined) row.follow_up_date = patch.followUpDate || null;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from("contacts").update(row as any).eq("id", id);
  if (error) throw error;
}

/* ---------------- Custom CRM fields ---------------- */

export async function listCrmFields(): Promise<CrmField[]> {
  const { data, error } = await (supabase as any)
    .from("crm_fields")
    .select("id, name, type, options, position")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name ?? "",
    type: (["dropdown", "text", "longtext"].includes(r.type) ? r.type : "text") as CrmFieldType,
    options: normOptions(r.options),
    position: Number(r.position) || 0,
  }));
}

export async function createCrmField(input: {
  name: string;
  type: CrmFieldType;
  options: CrmFieldOption[];
  position: number;
}): Promise<CrmField> {
  const userId = await requireUserId();
  const { data, error } = await (supabase as any)
    .from("crm_fields")
    .insert({
      user_id: userId,
      name: input.name,
      type: input.type,
      options: input.options,
      position: input.position,
    })
    .select("id, name, type, options, position")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name ?? "",
    type: data.type as CrmFieldType,
    options: normOptions(data.options),
    position: Number(data.position) || 0,
  };
}

export async function updateCrmField(
  id: string,
  patch: Partial<Pick<CrmField, "name" | "options" | "position">>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.options !== undefined) row.options = patch.options;
  if (patch.position !== undefined) row.position = patch.position;
  if (Object.keys(row).length === 0) return;
  const { error } = await (supabase as any).from("crm_fields").update(row).eq("id", id);
  if (error) throw error;
}

export async function deleteCrmField(id: string): Promise<void> {
  const { error } = await (supabase as any).from("crm_fields").delete().eq("id", id);
  if (error) throw error;
}


export async function deleteContactById(id: string): Promise<void> {
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- Preset exports ---------------- */

function escapeCsv(value: string): string {
  if (/[;\n"]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function exportPresetsToJson(presets: Preset[]): string {
  const data = presets.map((p) => ({
    id: p.id,
    name: p.name,
    shapes: p.shapes.map((s) => ({
      type: s.type,
      xMm: Number((s.xMm + s.wMm / 2).toFixed(2)),
      yMm: Number((s.yMm + s.hMm / 2).toFixed(2)),
      lMm: Number(s.wMm.toFixed(2)),
      bMm: Number(s.hMm.toFixed(2)),
    })),
  }));
  return JSON.stringify(data, null, 2);
}

export function exportPresetsToCsv(presets: Preset[]): string {
  const lines = ["Preset;Volgnummer;Vorm;X (mm);Y (mm);L (mm);B (mm)"];
  presets.forEach((p) => {
    p.shapes.forEach((s, i) => {
      const x = (s.xMm + s.wMm / 2).toFixed(2).replace(".", ",");
      const y = (s.yMm + s.hMm / 2).toFixed(2).replace(".", ",");
      const l = s.wMm.toFixed(2).replace(".", ",");
      const b = s.hMm.toFixed(2).replace(".", ",");
      lines.push(
        `${escapeCsv(p.name)};${i + 1};${s.type === "ellipse" ? "Ellips" : "Rechthoek"};${x};${y};${l};${b}`,
      );
    });
  });
  return "\uFEFF" + lines.join("\n");
}

/* ---------------- One-time migration from browser storage ---------------- */

const PRESET_KEYS = ["cutcontour.presets.v2", "cutcontour.presets.v1", "cutcontour.presets"];
const CRM_KEY = "crm.contacts.v1";

export async function migrateLocalData(): Promise<{ presets: number; contacts: number }> {
  const result = { presets: 0, contacts: 0 };
  if (typeof window === "undefined") return result;
  const userId = await requireUserId();
  const flag = `migrated.supabase.${userId}`;
  if (localStorage.getItem(flag)) return result;

  try {
    for (const key of PRESET_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) continue;
      const items = parsed.map((p: any) => ({
        name: String(p?.name ?? "Preset"),
        shapes: normShapes(
          Array.isArray(p?.shapes)
            ? p.shapes
            : [{ type: p?.type, xMm: p?.xMm, yMm: p?.yMm, wMm: p?.wMm, hMm: p?.hMm }],
        ),
      }));
      const created = await createPresets(items);
      result.presets += created.length;
      break;
    }
  } catch (err) {
    console.error("Preset-migratie mislukt", err);
  }

  try {
    const raw = localStorage.getItem(CRM_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const rows = parsed.map((c: any) => ({
          user_id: userId,
          name: String(c?.name ?? ""),
          phone: String(c?.phone ?? ""),
          email: String(c?.email ?? ""),
          status: c?.status === "gecontacteerd" ? "gecontacteerd" : "niet_gecontacteerd",
          flag:
            c?.flag === "blacklist" || c?.flag === "later_contacteren" ? c.flag : "geen",
          follow_up_date: c?.followUpDate ? String(c.followUpDate) : null,
          note: String(c?.note ?? ""),
        }));
        const { error } = await supabase.from("contacts").insert(rows);
        if (error) throw error;
        result.contacts += rows.length;
      }
    }
  } catch (err) {
    console.error("CRM-migratie mislukt", err);
  }

  localStorage.setItem(flag, new Date().toISOString());
  return result;
}
