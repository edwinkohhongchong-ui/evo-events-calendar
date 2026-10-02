import PrintCalendarCard from "@/components/PrintCalendarCard";
import InstructionsPanel from "@/components/InstructionsPanel";

const INSTRUCTIONS = [
  "Pick a year and tap the months to print, or use the quick buttons.",
  "Click \"Open print preview\", then print from there (one month per page).",
];

export default function PrintCalendarPage() {
  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-display text-navy mb-4">Print Calendar</h1>
      <InstructionsPanel lines={INSTRUCTIONS} />
      <PrintCalendarCard />
    </main>
  );
}
