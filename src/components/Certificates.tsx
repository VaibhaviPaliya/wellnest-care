import { useEffect, useState } from "react";
import { Award, FileUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { certificateDocument, deleteCertificate, listCertificates, readDocument, reviewCertificate, uploadCertificate, type Certificate } from "@/lib/partnerApi";

const STATUS = { pending: "Awaiting WellNest check", approved: "Verified — shown on your profile", rejected: "Not accepted" } as const;

/** Coach / therapist dashboard: upload certificates; WellNest checks them before a "Certified" badge appears. */
export function MyCertificates() {
  const { cloud, refresh } = useStore();
  const [list, setList] = useState<Certificate[]>([]);
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [file, setFile] = useState<{ name: string; data: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => { if (cloud) void listCertificates().then(setList).catch(() => setList([])); };
  useEffect(load, [cloud]);
  if (!cloud) return null;
  const pick = async (input: HTMLInputElement) => {
    const f = input.files?.[0]; if (!f) return;
    try { setFile({ name: f.name, data: await readDocument(f) }); } catch (e) { input.value = ""; toast.error(e instanceof Error ? e.message : "Couldn't read the file."); }
  };
  const send = async () => {
    if (!file) return;
    setBusy(true);
    try { await uploadCertificate(name, issuer, file.data); toast.success("Uploaded. WellNest will check it shortly."); setName(""); setIssuer(""); setFile(null); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed."); }
    finally { setBusy(false); }
  };
  const remove = async (c: Certificate) => {
    try { await deleteCertificate(c.id); toast.success("Certificate removed."); load(); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove."); }
  };
  return (
    <section className="surface mt-6 p-5">
      <h2 className="text-lg font-bold">Certificates</h2>
      <p className="text-sm text-muted-foreground">Upload certificates such as yoga instructor, physiotherapy, massage therapy or CPR. Only WellNest’s team sees the file; approved ones show as a <strong>Certified</strong> badge on your profile.</p>
      <ul className="mt-3 divide-y">
        {list.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div><p className="flex items-center gap-2 font-bold"><Award className="h-4 w-4 text-primary" />{c.name} <span className="font-normal text-muted-foreground">· {c.issuer}</span></p>
              <p className={`text-sm font-semibold ${c.status === "approved" ? "text-success" : c.status === "rejected" ? "text-destructive" : "text-amber-700"}`}>{STATUS[c.status]}{c.note ? ` — ${c.note}` : ""}</p></div>
            <Button variant="care" size="care" className="btn btn-outline" aria-label={`Remove ${c.name}`} onClick={() => void remove(c)}><Trash2 className="h-4 w-4" /></Button>
          </li>
        ))}
        {!list.length && <li className="py-3 text-muted-foreground">No certificates yet.</li>}
      </ul>
      <div className="mt-3 grid gap-3 border-t pt-4 sm:grid-cols-2">
        <label className="font-bold">Certificate name<input className="field mt-1" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Yoga Instructor Course (200 hrs)" /></label>
        <label className="font-bold">Issued by<input className="field mt-1" maxLength={120} value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="e.g. Ministry of AYUSH / YCB" /></label>
        <label className="btn btn-outline cursor-pointer justify-center sm:col-span-2"><FileUp className="h-4 w-4" />{file ? file.name : "Choose file (JPG, PNG or PDF, up to 1 MB)"}
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => void pick(e.target)} /></label>
        <div className="sm:col-span-2 sm:text-right"><Button variant="care" size="care" className="btn btn-primary" disabled={!file || name.trim().length < 2 || issuer.trim().length < 2 || busy} onClick={() => void send()}>{busy ? "Uploading…" : "Submit for checking"}</Button></div>
      </div>
    </section>
  );
}

/** Admin: certificates waiting for a check — open the file, then approve or reject with a note. */
export function CertificateQueue() {
  const { db, cloud, refresh } = useStore();
  const [list, setList] = useState<Certificate[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [doc, setDoc] = useState<{ name: string; data: string } | null>(null);
  const load = () => { if (cloud) void listCertificates().then(setList).catch(() => setList([])); };
  useEffect(load, [cloud]);
  if (!cloud) return null;
  const pending = list.filter((c) => c.status === "pending");
  const who = (id: string) => [...db.coaches, ...((db as unknown as { therapists?: { id: string; name: string }[] }).therapists ?? [])].find((p) => p.id === id)?.name ?? "Unknown partner";
  const open = async (c: Certificate) => {
    try { const d = await certificateDocument(c.id); if (d) setDoc({ name: c.name, data: d }); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't open."); }
  };
  const act = async (c: Certificate, approve: boolean) => {
    try { await reviewCertificate(c.id, approve, notes[c.id] ?? ""); toast.success(approve ? "Approved — the badge is live." : "Sent back with your note."); load(); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update."); }
  };
  return (
    <section className="surface p-5">
      <h2 className="text-lg font-bold">Certificates to check · {pending.length}</h2>
      <p className="text-muted-foreground">Open each file, confirm the name matches the coach and the issuer is genuine, then approve.</p>
      <ul className="mt-3 divide-y">
        {pending.map((c) => (
          <li key={c.id} className="space-y-2 py-3">
            <p className="font-bold">{c.name} <span className="font-normal text-muted-foreground">· {c.issuer} · {who(c.partner_id)} · {new Date(c.uploaded_at).toLocaleDateString("en-IN")}</span></p>
            <div className="flex flex-wrap items-end gap-2">
              <Button variant="care" size="care" className="btn btn-outline" onClick={() => void open(c)}>View certificate</Button>
              <label className="min-w-0 flex-1 basis-56 text-sm font-semibold">Note (needed to reject)<input className="field mt-1" value={notes[c.id] ?? ""} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} /></label>
              <Button variant="care" size="care" className="btn btn-outline" onClick={() => void act(c, false)}>Reject</Button>
              <Button variant="care" size="care" className="btn btn-primary" onClick={() => void act(c, true)}>Approve</Button>
            </div>
          </li>
        ))}
        {!pending.length && <li className="py-3 text-muted-foreground">Nothing waiting.</li>}
      </ul>
      <Dialog open={!!doc} onOpenChange={(v) => { if (!v) setDoc(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>{doc?.name}</DialogTitle>
          <DialogDescription>Visible to administrators only.</DialogDescription>
          {doc && (doc.data.startsWith("data:application/pdf")
            ? <object data={doc.data} type="application/pdf" className="h-[70vh] w-full rounded border" aria-label="Certificate PDF">PDF preview isn’t supported in this browser.</object>
            : <img src={doc.data} alt={doc.name} className="max-h-[70vh] w-full rounded border object-contain" />)}
        </DialogContent>
      </Dialog>
    </section>
  );
}
