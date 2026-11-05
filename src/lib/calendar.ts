import type { ItineraryItem } from "./types";
export function itineraryCalendar(items: ItineraryItem[], title: string) {
  const esc = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Evan Fieldbook//Trip Planner//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${esc(title)}`,
  ];
  for (const i of items.filter((x) => x.status !== "removed")) {
    const day = i.date.replaceAll("-", "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${esc(i.id)}@fieldbook`,
      `DTSTAMP:${new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "")}`,
      i.time
        ? `DTSTART:${day}T${i.time.replace(":", "")}00`
        : `DTSTART;VALUE=DATE:${day}`,
      `SUMMARY:${esc(i.title)}`,
      `LOCATION:${esc(i.location ?? "")}`,
      `DESCRIPTION:${esc(i.notes ?? "")}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
export function downloadCalendar(items: ItineraryItem[], name: string) {
  const url = URL.createObjectURL(
    new Blob([itineraryCalendar(items, name)], {
      type: "text/calendar;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "trip-itinerary.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
