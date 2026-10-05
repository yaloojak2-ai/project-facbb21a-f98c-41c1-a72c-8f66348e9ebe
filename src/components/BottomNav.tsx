import { Link } from "@tanstack/react-router";
import { Home, Ticket, LayoutDashboard, User } from "lucide-react";
import { useUser } from "@/lib/auth";

export function BottomNav() {
  const { user } = useUser();
  const items = [
    { to: "/", label: "الرئيسية", icon: Home },
    { to: "/bookings", label: "حجوزاتي", icon: Ticket },
    { to: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  ] as const;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-lg md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground"
            activeProps={{ className: "text-primary" }}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
        <Link
          to={user ? "/bookings" : "/auth"}
          className="flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground"
        >
          <User className="h-5 w-5" />
          {user ? "حسابي" : "دخول"}
        </Link>
      </div>
    </nav>
  );
}

export function TopBar() {
  const { user } = useUser();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="font-display text-2xl font-black text-gold">
          دَوْرَك
        </Link>
        <div className="hidden items-center gap-6 text-sm md:flex">
          <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: "text-primary" }}>الرئيسية</Link>
          <Link to="/bookings" activeProps={{ className: "text-primary" }}>حجوزاتي</Link>
          <Link to="/dashboard" activeProps={{ className: "text-primary" }}>لوحة التحكم</Link>
        </div>
        {user ? (
          <span className="max-w-[40%] truncate text-xs text-muted-foreground">{user.email}</span>
        ) : (
          <Link to="/auth" className="rounded-full bg-gold px-4 py-1.5 text-sm font-bold text-primary-foreground">
            دخول
          </Link>
        )}
      </div>
    </header>
  );
}
