import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Star, MapPin, Clock, Scissors } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { salonImage } from "@/lib/images";
import { useUser } from "@/lib/auth";
import { fmtTime } from "@/lib/booking";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "دَوْرَك — احجز دورك عند الحلاق بدون انتظار" },
      { name: "description", content: "ابحث عن أقرب صالون حلاقة واحجز موعدك فوراً. لا انتظار بعد اليوم." },
      { property: "og:title", content: "دَوْرَك — احجز دورك عند الحلاق" },
      { property: "og:description", content: "ابحث عن أقرب صالون حلاقة واحجز موعدك فوراً." },
    ],
  }),
  component: Home,
});

function Home() {
  const [q, setQ] = useState("");
  const { data: salons = [], isLoading } = useQuery({
    queryKey: ["salons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("salons").select("*, services(price)").eq("is_active", true).order("rating", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const filtered = useMemo(
    () => salons.filter((s) => !q || `${s.name} ${s.city} ${s.address}`.includes(q.trim())),
    [salons, q],
  );

  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="pt-8 pb-6">
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-4xl font-black leading-tight md:text-6xl">
          دورك محفوظ.<br />
          <span className="text-gold">بدون انتظار.</span>
        </motion.h1>
        <p className="mt-3 text-muted-foreground">احجز عند أفضل الحلاقين في مدينتك خلال ثوانٍ.</p>
        <div className="relative mt-6">
          <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن صالون أو مدينة..." className="h-14 rounded-2xl bg-card pr-12 text-base" />
        </div>
      </section>

      <ActiveTicket />

      <h2 className="mb-4 mt-8 text-xl font-bold">الأعلى تقييماً</h2>
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">لا توجد نتائج.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {filtered.map((s, i) => {
            const minPrice = Math.min(...(s.services?.map((x) => Number(x.price)) ?? [0]));
            return (
              <motion.div key={s.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <Link to="/salon/$id" params={{ id: s.id }} className="group block overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/60">
                  <div className="relative h-44 overflow-hidden">
                    <img src={salonImage(s.image_key)} alt={s.name} width={1280} height={768} loading={i === 0 ? "eager" : "lazy"} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-fade" />
                    <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-background/80 px-2.5 py-1 text-xs font-bold backdrop-blur">
                      <Star className="h-3.5 w-3.5 fill-primary text-primary" /> {Number(s.rating).toFixed(1)}
                    </span>
                    <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-xs font-bold text-primary-foreground">
                      <Clock className="h-3.5 w-3.5" /> متاح اليوم
                    </span>
                  </div>
                  <div className="p-4">
                    <h3 className="text-lg font-bold">{s.name}</h3>
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" /> {s.city} · {s.address}
                    </p>
                    {isFinite(minPrice) && (
                      <p className="mt-2 flex items-center gap-1 text-sm text-accent-foreground">
                        <Scissors className="h-4 w-4" /> يبدأ من {minPrice} ₪
                      </p>
                    )}
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActiveTicket() {
  const { user } = useUser();
  const { data } = useQuery({
    queryKey: ["active-ticket", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("id, start_time, status, salons(name), barbers(name)")
        .eq("customer_id", user!.id)
        .in("status", ["pending", "confirmed"])
        .gte("end_time", new Date().toISOString())
        .order("start_time")
        .limit(1)
        .maybeSingle();
      return data;
    },
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!data) return null;
  const diff = Math.max(0, new Date(data.start_time).getTime() - now);
  const h = Math.floor(diff / 3.6e6), m = Math.floor((diff % 3.6e6) / 6e4), s = Math.floor((diff % 6e4) / 1000);
  return (
    <Link to="/ticket/$id" params={{ id: data.id }} className="block rounded-2xl bg-gold p-5 text-primary-foreground shadow-glow">
      <p className="text-sm font-bold opacity-80">حجزك القادم</p>
      <div className="mt-1 flex items-end justify-between">
        <div>
          <p className="text-xl font-black">{data.salons?.name}</p>
          <p className="text-sm">مع {data.barbers?.name} · {fmtTime(data.start_time)}</p>
        </div>
        <p className="font-display text-3xl font-black tabular-nums" dir="ltr">
          {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </p>
      </div>
    </Link>
  );
}
