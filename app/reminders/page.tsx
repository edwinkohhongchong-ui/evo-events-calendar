import type { ComponentProps } from "react";
import { headers } from "next/headers";
import { getAllChecklistTemplates, getAllLevels, getAllReminderTemplates, getOpenChecklistRows } from "@/lib/data";
import { readAllDigests } from "@/lib/telegramDigestStore";
import RemindersForm from "@/components/RemindersForm";
import ChecklistTemplatesSection from "@/components/ChecklistTemplatesSection";
import TelegramDigestPanel from "@/components/TelegramDigestPanel";
import RemindersTabs from "@/components/RemindersTabs";
import InstructionsPanel from "@/components/InstructionsPanel";

export const dynamic = "force-dynamic";

const DIGEST_INSTRUCTIONS = [
  "The bot posts digests to the Telegram group by itself. Click \"Add digest\" (or \"Create from the default\"), pick the days to send on, what to cover (rest of the month, this week, or the next days), which events and categories to list, and whether to add the planning check for events marked \"Big event.\" The preview shows the exact message as you change things.",
  "To change one message, click \"Edit the message\" inside a digest, change the wording and save: it is used once for the next send, then goes back to automatic. \"Skip the next send\" holds one back, and \"Send now\" posts it straight away.",
  "Sends happen around 7:30pm Singapore time on the chosen days (Vercel's free plan runs once a day, within the hour). Until you add a digest, the default Sunday message is sent. Setup steps are in ONBOARDING.md.",
];

const REMINDER_INSTRUCTIONS = [
  "Pick a saved template under \"Reminder template,\" or leave it on Freeform and write your own intro text.",
  "Tick which upcoming events to include, then type a Telegram handle and click \"Open in Telegram\" to send the drafted message yourself — nothing sends automatically.",
  "Edit the \"Message\" box directly any time; your own wording stays put until you click \"Reset to auto-generated.\"",
  "Click \"Add Template\" to save your current handle, intro, and lookahead range for reuse next time.",
  "Under \"Checklist Templates,\" click \"Add Checklist Template\" to write a reusable list. You can attach it to an event in the drafted message, or add it to an event from the event's details so it can be ticked off with due dates — it is separate from the monthly Checklist tab and never updates it.",
];

export default async function RemindersPage() {
  // Middleware already keeps Viewers off /reminders; this is a second guard so
  // checklist templates are never fetched or rendered for anyone but an Editor.
  const isEditor = (await headers()).get("x-evo-role") === "editor";
  const [templates, checklistTemplates, openChecklistRows, digests, levels] = await Promise.all([
    getAllReminderTemplates(),
    isEditor ? getAllChecklistTemplates() : Promise.resolve([]),
    isEditor ? getOpenChecklistRows() : Promise.resolve([]),
    isEditor ? readAllDigests().catch(() => null) : Promise.resolve(null),
    isEditor ? getAllLevels() : Promise.resolve([]),
  ]);

  const digestContent = (
    <>
      <InstructionsPanel lines={DIGEST_INSTRUCTIONS} label="How scheduled digests work" />
      <TelegramDigestPanel initial={digests} levels={levels} />
    </>
  );

  const remindersContent = (
    <div className="flex flex-col gap-6">
      <InstructionsPanel lines={REMINDER_INSTRUCTIONS} label="How reminders work" />
      <RemindersForm templates={templates} checklistTemplates={checklistTemplates} openChecklistRows={openChecklistRows} />
      {isEditor && (
        <div>
          <h3 className="text-title text-ink">Checklist templates</h3>
          <p className="mt-1 mb-3 text-body text-ink-2">Reusable checklists to drop into a draft above or attach to an event.</p>
          <ChecklistTemplatesSection templates={checklistTemplates} />
        </div>
      )}
    </div>
  );

  const tabs: ComponentProps<typeof RemindersTabs>["tabs"] = [];
  if (isEditor) {
    tabs.push({
      id: "digest",
      label: "Scheduled Digest",
      title: "Scheduled Digest",
      description: "Messages the bot posts to the Telegram group by itself, on the days you choose.",
      content: digestContent,
    });
  }
  tabs.push({
    id: "reminders",
    label: "Reminders",
    title: "Reminders",
    description: "Draft a message and open it in Telegram yourself. Nothing here sends automatically.",
    content: remindersContent,
  });

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-navy mb-4">Reminders</h1>
      <RemindersTabs tabs={tabs} />
    </main>
  );
}
