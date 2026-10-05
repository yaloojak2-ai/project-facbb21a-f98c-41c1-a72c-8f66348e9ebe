import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtTime, statusLabel, CURRENCY } from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/bookings")({
  head: () => ({
    meta: [
      { title: "حجوزاتي — دَوْرَك" },
      { name: "description", content: "تابع مواعيدك القادمة والسابقة." },
      { property: "og:title", content: "حجوزاتي — دَوْرَك" },
      { property: "og:description", content: "تابع مواعيدك القادمة والسابقة." },
    ],
  }),
  component: Bookings,
});

export const statusClass: Record<string, string> = {
  confirmed: "bg-success/15 text-success",
  pending: "bg-primary/15 text-primary",
  completed: "bg-secondary text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive",
  no_show: "bg-destructive/15 text-destructive",
};

function Bookings() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({
    queryKey: ["my-bookings", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, start_time, status, total_price, salons(name), barbers(name)")
        .eq("customer_id", user.id)
        .order("start_time", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">حجوزاتي</h1>
        <Button variant="ghost" size="sm" onClick={signOut}><LogOut /> خروج</Button>
      </div>
      <div className="mt-6 space-y-3">
        {isLoading && <div className="h-24 animate-pulse rounded-2xl bg-card" />}
        {!isLoading && data.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <Calendar className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-muted-foreground">لا توجد حجوزات بعد</p>
            <Button asChild variant="gold" className="mt-4 rounded-xl"><Link to="/">احجز الآن</Link></Button>
          </div>
        )}
        {data.map((a) => (
          <Link key={a.id} to="/ticket/$id" params={{ id: a.id }} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 hover:border-primary/50">
            <div>
              <p className="font-bold">{a.salons?.name}</p>
              <p className="text-sm text-muted-foreground">{fmtDate(a.start_time)} · {fmtTime(a.start_time)} · {a.barbers?.name}</p>
            </div>
            <div className="text-left">
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", statusClass[a.status])}>{statusLabel[a.status]}</span>
              <p className="mt-1 text-sm text-primary">{Number(a.total_price)} {CURRENCY}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
