import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم — دَوْرَك" },
      { name: "description", content: "إدارة الصالون والمواعيد والخدمات." },
      { property: "og:title", content: "لوحة التحكم — دَوْرَك" },
      { property: "og:description", content: "إدارة الصالون والمواعيد والخدمات." },
    ],
  }),
  component: () => (
    <div className="mx-auto max-w-2xl px-4 pt-10 text-center">
      <h1 className="text-2xl font-black">لوحة التحكم</h1>
      <p className="mt-2 text-muted-foreground">قريباً: الجدول اليومي، الحجز السريع، الخدمات والحلاقين، والإحصائيات.</p>
    </div>
  ),
});
