import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Navigation, X, RefreshCw, Scissors } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtTime, statusLabel, CURRENCY } from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { statusClass } from "./bookings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ticket/$id")({
  head: () => ({
    meta: [
      { title: "تذكرة الحجز — دَوْرَك" },
      { name: "description", content: "تتبّع حالة حجزك لحظة بلحظة." },
      { property: "og:title", content: "تذكرة الحجز — دَوْرَك" },
      { property: "og:description", content: "تتبّع حالة حجزك لحظة بلحظة." },
    ],
  }),
  component: Ticket,
});

function Ticket() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const key = ["ticket", id];
  const { data: a, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, salons(id, name, address, city, latitude, longitude), barbers(name), appointment_services(price, services(name))")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`ticket-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "appointments", filter: `id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: key });
        toast.info("تم تحديث حالة حجزك");
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (isLoading) return <div className="mx-auto mt-8 h-96 max-w-md animate-pulse rounded-3xl bg-card" />;
  if (!a) return <p className="py-20 text-center text-muted-foreground">الحجز غير موجود.</p>;

  const active = a.status === "confirmed" || a.status === "pending";
  const diff = Math.max(0, new Date(a.start_time).getTime() - now);
  const h = Math.floor(diff / 3.6e6), m = Math.floor((diff % 3.6e6) / 6e4), s = Math.floor((diff % 6e4) / 1000);
  const s2 = a.salons;
  const maps = s2?.latitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${s2.latitude},${s2.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s2?.name} ${s2?.city}`)}`;

  const cancel = async () => {
    if (!confirm("هل تريد إلغاء الحجز؟")) return;
    const { error } = await supabase.from("appointments").update({ status: "cancelled" }).eq("id", id);
    if (error) return toast.error("تعذّر الإلغاء");
    toast.success("تم إلغاء الحجز");
    qc.invalidateQueries();
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="overflow-hidden rounded-3xl border border-border bg-card">
        <div className="bg-gold p-6 text-primary-foreground">
          <div className="flex items-center justify-between">
            <Scissors className="h-6 w-6" />
            <span className="rounded-full bg-background/20 px-3 py-1 text-xs font-bold">#{a.id.slice(0, 6).toUpperCase()}</span>
          </div>
          <h1 className="mt-4 text-2xl font-black">{s2?.name}</h1>
          <p className="text-sm opacity-80">{s2?.city} · {s2?.address}</p>
        </div>
        <div className="relative border-b border-dashed border-border">
          <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-background" />
          <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-background" />
        </div>
        <div className="space-y-5 p-6">
          <div className="flex items-center justify-between">
            <span className={cn("rounded-full px-3 py-1 text-sm font-bold", statusClass[a.status])}>{statusLabel[a.status]}</span>
            {active && diff > 0 && (
              <span className="font-display text-2xl font-black tabular-nums text-primary" dir="ltr">
                {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Info k="التاريخ" v={fmtDate(a.start_time)} />
            <Info k="الوقت" v={`${fmtTime(a.start_time)} – ${fmtTime(a.end_time)}`} />
            <Info k="الحلاق" v={a.barbers?.name ?? ""} />
            <Info k="الدفع" v="نقداً في الصالون" />
          </div>
          <div className="rounded-2xl bg-secondary p-4 text-sm">
            {a.appointment_services?.map((x, i) => (
              <div key={i} className="flex justify-between py-0.5"><span>{x.services?.name}</span><span>{Number(x.price)} {CURRENCY}</span></div>
            ))}
            <div className="mt-2 flex justify-between border-t border-border pt-2 font-black"><span>الإجمالي</span><span className="text-primary">{Number(a.total_price)} {CURRENCY}</span></div>
          </div>
          <Button asChild variant="gold" className="h-12 w-full rounded-xl">
            <a href={maps} target="_blank" rel="noreferrer"><Navigation /> الاتجاهات عبر Google Maps</a>
          </Button>
          {active && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11 rounded-xl" onClick={cancel}><X /> إلغاء</Button>
              <Button asChild variant="outline" className="h-11 rounded-xl">
                <Link to="/salon/$id" params={{ id: a.salon_id }} onClick={async () => { await supabase.from("appointments").update({ status: "cancelled" }).eq("id", id); toast("اختر موعداً جديداً"); }}>
                  <RefreshCw /> إعادة جدولة
                </Link>
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{k}</p>
      <p className="font-bold">{v}</p>
    </div>
  );
}
