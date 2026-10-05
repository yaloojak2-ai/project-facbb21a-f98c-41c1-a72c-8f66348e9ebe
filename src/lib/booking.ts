export type Busy = { barber_id: string; start_time: string; end_time: string };
export type Hours = { barber_id: string; day_of_week: number; start_time: string; end_time: string; is_off: boolean };

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function dayBounds(date: Date) {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

/** NewStart < ExistingEnd && NewEnd > ExistingStart */
export const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && aE > bS;

/**
 * Returns slots (Date) where at least one candidate barber is free for `duration` minutes,
 * with the first free barber id for each slot.
 */
export function computeSlots(opts: {
  date: Date;
  duration: number;
  barberIds: string[];
  busy: Busy[];
  hours: Hours[];
  salonOpen: string;
  salonClose: string;
  step?: number;
}) {
  const { date, duration, barberIds, busy, hours, salonOpen, salonClose, step = 15 } = opts;
  const dow = date.getDay();
  const { from } = dayBounds(date);
  const now = Date.now();
  const result: { time: Date; barberId: string }[] = [];
  if (!duration || barberIds.length === 0) return result;

  for (let m = 0; m + duration <= 24 * 60; m += step) {
    const s = from.getTime() + m * 60000;
    const e = s + duration * 60000;
    if (s < now + 5 * 60000) continue;
    const free = barberIds.find((bid) => {
      const wh = hours.find((h) => h.barber_id === bid && h.day_of_week === dow);
      if (wh?.is_off) return false;
      const open = toMin(wh?.start_time ?? salonOpen);
      const close = toMin(wh?.end_time ?? salonClose);
      if (m < open || m + duration > close) return false;
      return !busy.some(
        (b) => b.barber_id === bid && overlaps(s, e, new Date(b.start_time).getTime(), new Date(b.end_time).getTime()),
      );
    });
    if (free) result.push({ time: new Date(s), barberId: free });
  }
  return result;
}

export const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" });
export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });

export const statusLabel: Record<string, string> = {
  pending: "قيد الانتظار",
  confirmed: "مؤكد",
  completed: "مكتمل",
  cancelled: "ملغي",
  no_show: "لم يحضر",
};

export const CURRENCY = "₪";
