import salon1 from "@/assets/salon1.jpg";
import salon2 from "@/assets/salon2.jpg";
import salon3 from "@/assets/salon3.jpg";

const map: Record<string, string> = { salon1, salon2, salon3 };
export const salonImage = (key?: string | null) => map[key ?? ""] ?? salon1;
export const salonImageKeys = Object.keys(map);
