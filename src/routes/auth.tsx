import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeRedirect } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — دَوْرَك" },
      { name: "description", content: "سجّل دخولك لتأكيد حجزك وإدارة مواعيدك." },
      { property: "og:title", content: "تسجيل الدخول — دَوْرَك" },
      { property: "og:description", content: "سجّل دخولك لتأكيد حجزك وإدارة مواعيدك." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const target = safeRedirect(redirect);
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: target, replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === "SIGNED_IN" && s) navigate({ to: target, replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate, target]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error("بيانات الدخول غير صحيحة");
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + target, data: { full_name: name } },
      });
      if (error) toast.error(error.message);
      else toast.success("تم إنشاء الحساب! تحقق من بريدك لتأكيده.");
    }
    setBusy(false);
  };

  const google = async () => {
    sessionStorage.setItem("dawrak_redirect", target);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error("تعذّر الدخول عبر Google");
  };

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-5">
      <h1 className="text-3xl font-black">{mode === "in" ? "أهلاً بعودتك" : "حساب جديد"}</h1>
      <p className="mt-1 text-muted-foreground">احجز دورك خلال ثوانٍ.</p>
      <Button variant="outline" className="mt-8 h-12 rounded-xl" onClick={google}>
        المتابعة باستخدام Google
      </Button>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />أو<div className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={submit} className="space-y-3">
        {mode === "up" && (
          <Input placeholder="الاسم الكامل" value={name} onChange={(e) => setName(e.target.value)} required className="h-12" />
        )}
        <Input type="email" dir="ltr" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-12" />
        <Input type="password" dir="ltr" placeholder="••••••••" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required className="h-12" />
        <Button type="submit" variant="gold" className="h-12 w-full rounded-xl" disabled={busy}>
          {mode === "in" ? "دخول" : "إنشاء حساب"}
        </Button>
      </form>
      <button className="mt-5 text-sm text-muted-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "ليس لديك حساب؟ " : "لديك حساب؟ "}
        <span className="text-primary">{mode === "in" ? "سجّل الآن" : "سجّل الدخول"}</span>
      </button>
    </div>
  );
}
