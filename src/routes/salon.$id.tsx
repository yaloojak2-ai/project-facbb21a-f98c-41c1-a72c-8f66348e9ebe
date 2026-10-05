import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { toast } from "sonner";
import { Star, MapPin, Clock, Check, Navigation, Banknote, CreditCard, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { salonImage } from "@/lib/images";
import { useUser } from "@/lib/auth";
import { computeSlots, dayBounds, fmtDate, fmtTime, CURRENCY } from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/salon/$id")({
  validateSearch: z.object({ book: z.boolean().optional() }),
  head: () => ({
    meta: [
      { title: "احجز في الصالون — دَوْرَك" },
      { name: "description", content: "اختر الحلاق والخدمات والوقت المناسب واحجز دورك فوراً." },
      { property: "og:title", content: "احجز في الصالون — دَوْرَك" },
      { property: "og:description", content: "اختر الحلاق والخدمات والوقت المناسب واحجز دورك فوراً." },
    ],
  }),
  component: SalonPage,
});

function SalonPage() {
  const { id } = Route.useParams();
  const { user } = useUser();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: salon, isLoading } = useQuery({
    queryKey: ["salon", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salons")
        .select("*, barbers(*), services(*)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const barbers = useMemo(() => (salon?.barbers ?? []).filter((b) => b.is_available), [salon]);
  const services = salon?.services ?? [];
  const [barberId, setBarberId] = useState<string>("any");
  const [selected, setSelected] = useState<string[]>([]);
  const [dayOffset, setDayOffset] = useState(0);
  const [slot, setSlot] = useState<{ time: Date; barberId: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [payment, setPayment] = useState<"cash" | "online">("cash");
  const [saving, setSaving] = useState(false);

  const chosen = services.filter((s) => selected.includes(s.id));
  const duration = chosen.reduce((a, s) => a + s.duration_minutes, 0);
  const total = chosen.reduce((a, s) => a + Number(s.price), 0);

  const date = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d;
  }, [dayOffset]);

  const { data: avail } = useQuery({
    queryKey: ["avail", id, dayOffset],
    enabled: !!salon,
    queryFn: async () => {
      const { from, to } = dayBounds(date);
      const ids = (salon?.barbers ?? []).map((b) => b.id);
      const [busy, hours] = await Promise.all([
        supabase.rpc("get_busy_slots", { _salon: id, _from: from.toISOString(), _to: to.toISOString() }),
        supabase.from("working_hours").select("*").in("barber_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      ]);
      return { busy: busy.data ?? [], hours: hours.data ?? [] };
    },
  });

  const slots = useMemo(() => {
    if (!salon || !avail) return [];
    return computeSlots({
      date,
      duration,
      barberIds: barberId === "any" ? barbers.map((b) => b.id) : [barberId],
      busy: avail.busy,
      hours: avail.hours,
      salonOpen: salon.open_time,
      salonClose: salon.close_time,
    });
  }, [salon, avail, date, duration, barberId, barbers]);

  if (isLoading) return <div className="mx-auto mt-6 h-72 max-w-4xl animate-pulse rounded-2xl bg-card" />;
  if (!salon) return <p className="py-20 text-center text-muted-foreground">الصالون غير موجود.</p>;

  const toggle = (sid: string) => {
    setSlot(null);
    setSelected((s) => (s.includes(sid) ? s.filter((x) => x !== sid) : [...s, sid]));
  };

  const confirm = async () => {
    if (!slot) return;
    if (!user) {
      navigate({ to: "/auth", search: { redirect: `/salon/${id}` } });
      return;
    }
    setSaving(true);
    const end = new Date(slot.time.getTime() + duration * 60000);
    const { data, error } = await supabase
      .from("appointments")
      .insert({
        customer_id: user.id,
        barber_id: slot.barberId,
        salon_id: id,
        start_time: slot.time.toISOString(),
        end_time: end.toISOString(),
        total_price: total,
        status: "confirmed",
        booking_source: "app",
        payment_method: "cash",
      })
      .select("id")
      .single();
    if (error || !data) {
      setSaving(false);
      toast.error(error?.message.includes("SLOT_TAKEN") ? "هذا الوقت حُجز للتو، اختر وقتاً آخر" : "تعذّر الحجز");
      qc.invalidateQueries({ queryKey: ["avail", id] });
      setSlot(null);
      return;
    }
    await supabase.from("appointment_services").insert(chosen.map((s) => ({ appointment_id: data.id, service_id: s.id, price: s.price })));
    setSaving(false);
    toast.success("تم تأكيد حجزك! 🎉");
    qc.invalidateQueries();
    navigate({ to: "/ticket/$id", params: { id: data.id } });
  };

  const mapsUrl = salon.latitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${salon.latitude},${salon.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${salon.name} ${salon.city}`)}`;

  return (
    <div className="mx-auto max-w-4xl pb-28">
      <div className="relative h-64 md:mt-4 md:h-80 md:overflow-hidden md:rounded-3xl">
        <img src={salonImage(salon.image_key)} alt={salon.name} width={1280} height={768} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-fade" />
        <Link to="/" className="absolute right-4 top-4 rounded-full bg-background/70 p-2 backdrop-blur">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div className="absolute bottom-4 right-4 left-4">
          <h1 className="text-3xl font-black">{salon.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Star className="h-4 w-4 fill-primary text-primary" />{Number(salon.rating).toFixed(1)}</span>
            <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{salon.city} · {salon.address}</span>
            <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{salon.open_time.slice(0, 5)} – {salon.close_time.slice(0, 5)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-8 px-4 pt-6">
        {salon.description && <p className="text-muted-foreground">{salon.description}</p>}
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-primary">
          <Navigation className="h-4 w-4" /> الاتجاهات على الخريطة
        </a>

        <Section title="اختر الحلاق">
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {[{ id: "any", name: "أي حلاق متاح", title: "أسرع موعد" }, ...barbers].map((b) => (
              <button
                key={b.id}
                onClick={() => { setBarberId(b.id); setSlot(null); }}
                className={cn(
                  "min-w-[130px] shrink-0 rounded-2xl border p-3 text-right transition",
                  barberId === b.id ? "border-primary bg-accent" : "border-border bg-card",
                )}
              >
                <div className={cn("mb-2 flex h-10 w-10 items-center justify-center rounded-full font-bold", barberId === b.id ? "bg-gold text-primary-foreground" : "bg-secondary")}>
                  {b.name.slice(0, 1)}
                </div>
                <p className="font-bold">{b.name}</p>
                <p className="text-xs text-muted-foreground">{b.title}</p>
              </button>
            ))}
          </div>
        </Section>

        <Section title="الخدمات">
          <div className="space-y-2">
            {services.map((s) => {
              const on = selected.includes(s.id);
              return (
                <button key={s.id} onClick={() => toggle(s.id)} className={cn("flex w-full items-center justify-between rounded-2xl border p-4 transition", on ? "border-primary bg-accent" : "border-border bg-card")}>
                  <div className="flex items-center gap-3">
                    <span className={cn("flex h-6 w-6 items-center justify-center rounded-md border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                      {on && <Check className="h-4 w-4" />}
                    </span>
                    <div className="text-right">
                      <p className="font-bold">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.duration_minutes} دقيقة</p>
                    </div>
                  </div>
                  <span className="font-bold text-primary">{Number(s.price)} {CURRENCY}</span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="اختر الوقت">
          <div className="mb-4 flex gap-2">
            {["اليوم", "غداً", "بعد غد"].map((l, i) => (
              <button key={l} onClick={() => { setDayOffset(i); setSlot(null); }} className={cn("rounded-full border px-4 py-2 text-sm", dayOffset === i ? "border-primary bg-gold font-bold text-primary-foreground" : "border-border bg-card")}>
                {l}
              </button>
            ))}
          </div>
          {duration === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">اختر خدمة أولاً لعرض الأوقات المتاحة</p>
          ) : slots.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">لا توجد أوقات متاحة في هذا اليوم</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 md:grid-cols-6">
              {slots.map((s) => {
                const on = slot?.time.getTime() === s.time.getTime();
                return (
                  <button key={s.time.toISOString()} onClick={() => setSlot(s)} className={cn("rounded-xl border py-2.5 text-sm tabular-nums transition", on ? "border-primary bg-gold font-bold text-primary-foreground" : "border-border bg-card hover:border-primary/50")}>
                    {fmtTime(s.time)}
                  </button>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      <AnimatePresence>
        {duration > 0 && (
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background/95 p-4 backdrop-blur md:bottom-0">
            <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
              <div>
                <p className="font-bold">{chosen.map((c) => c.name).join(" + ")}</p>
                <p className="text-sm text-muted-foreground">{duration} دقيقة · <span className="text-primary">{total} {CURRENCY}</span></p>
              </div>
              <Button variant="gold" className="h-12 rounded-xl px-6" disabled={!slot} onClick={() => setOpen(true)}>
                {slot ? "متابعة" : "اختر وقتاً"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle className="text-right">تأكيد الحجز</DialogTitle></DialogHeader>
          {slot && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-2xl bg-secondary p-4 text-sm">
                <Row k="الصالون" v={salon.name} />
                <Row k="الحلاق" v={salon.barbers?.find((b) => b.id === slot.barberId)?.name ?? ""} />
                <Row k="الموعد" v={`${fmtDate(slot.time)} · ${fmtTime(slot.time)}`} />
                <Row k="الخدمات" v={chosen.map((c) => c.name).join(" + ")} />
                <div className="border-t border-border pt-2"><Row k="الإجمالي" v={`${total} ${CURRENCY}`} strong /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setPayment("cash")} className={cn("flex flex-col items-center gap-1 rounded-xl border p-3 text-sm", payment === "cash" ? "border-primary bg-accent" : "border-border")}>
                  <Banknote className="h-5 w-5" /> نقداً في الصالون
                </button>
                <button disabled className="flex flex-col items-center gap-1 rounded-xl border border-border p-3 text-sm opacity-50">
                  <CreditCard className="h-5 w-5" /> دفع إلكتروني <span className="text-[10px]">قريباً</span>
                </button>
              </div>
              {!user && <p className="text-center text-xs text-muted-foreground">سنطلب منك تسجيل الدخول لتأكيد الحجز.</p>}
              <Button variant="gold" className="h-12 w-full rounded-xl" onClick={confirm} disabled={saving}>
                {user ? (saving ? "جارٍ الحجز..." : "تأكيد الحجز") : "سجّل الدخول للتأكيد"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}
function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn("text-left", strong && "text-lg font-black text-primary")}>{v}</span>
    </div>
  );
}
