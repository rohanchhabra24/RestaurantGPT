import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog.jsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs.jsx";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";
import { Textarea } from "./ui/textarea.jsx";
import Icon from "./Icon.jsx";
import { emailjsConfigured, sendEmail } from "../lib/emailjs.js";

const INTERESTS = [
  "Seeing a live demo",
  "Pricing",
  "Connecting my POS/aggregator data",
  "Partnership",
  "Something else",
];

// 30-min slots 10:00 through 17:30 (last call starts at 5:30pm, runs to 6).
function buildTimeSlots() {
  const slots = [];
  for (let h = 10; h < 18; h++) {
    slots.push(`${h}:00`);
    slots.push(`${h}:30`);
  }
  return slots;
}
const TIME_SLOTS = buildTimeSlots();

function formatSlot(slot) {
  const [h, m] = slot.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

// Next 14 calendar days including today — a plain date-request picker, not
// a live-availability calendar (there's no backend booking system behind
// this yet), so every day/slot is always selectable and the copy says
// "pick a time that works for you," not "book," to match what actually
// happens: the team confirms by email, nothing is auto-scheduled.
function buildUpcomingDays(count = 14) {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatDay(date) {
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
    day: date.getDate(),
    month: date.toLocaleDateString(undefined, { month: "short" }),
  };
}

function FieldError({ children }) {
  if (!children) return null;
  return <div className="rounded-md bg-[color-mix(in_srgb,red_15%,transparent)] px-3 py-2 text-sm text-red-400">{children}</div>;
}

function SuccessNotice({ children }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent">
        <Icon name="check" size={18} className="text-accent-foreground" />
      </span>
      <p className="m-0 text-sm text-foreground">{children}</p>
    </div>
  );
}

function ContactForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [phone, setPhone] = useState("");
  const [interest, setInterest] = useState(INTERESTS[0]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!emailjsConfigured) {
      setError("Email delivery isn't set up yet — please check back soon.");
      return;
    }

    setSubmitting(true);
    try {
      await sendEmail({
        form_type: "Contact message",
        from_name: fullName,
        from_email: email,
        restaurant_name: restaurantName || "—",
        phone: phone || "—",
        interest,
        message,
      });
      setSent(true);
    } catch (err) {
      setError(err.message || "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) return <SuccessNotice>Thanks — we'll get back to you within 24 hours.</SuccessNotice>;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bd-name">Full name *</Label>
          <Input id="bd-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bd-email">Email *</Label>
          <Input id="bd-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bd-restaurant">Restaurant name</Label>
          <Input id="bd-restaurant" value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bd-phone">Phone</Label>
          <Input id="bd-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bd-interest">What are you interested in?</Label>
        <select
          id="bd-interest"
          value={interest}
          onChange={(e) => setInterest(e.target.value)}
          className="flex h-10 w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {INTERESTS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bd-message">Message *</Label>
        <Textarea id="bd-message" required value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>

      <FieldError>{error}</FieldError>

      <Button type="submit" disabled={submitting} className="mt-1">
        {submitting ? "Sending…" : "Send Message"}
      </Button>
    </form>
  );
}

function CallBookingForm() {
  const days = useMemo(() => buildUpcomingDays(), []);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  const dayLabel = selectedDay
    ? selectedDay.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const requestedDate = dayLabel;
    const requestedTime = selectedSlot ? formatSlot(selectedSlot) : null;

    if (!emailjsConfigured) {
      setError("Email delivery isn't set up yet — please check back soon.");
      return;
    }

    setSubmitting(true);
    try {
      await sendEmail({
        form_type: "Call request",
        from_name: fullName,
        from_email: email,
        requested_date: requestedDate,
        requested_time: requestedTime,
      });
      setSent(true);
    } catch (err) {
      setError(err.message || "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <SuccessNotice>
        Request sent for {dayLabel} at {selectedSlot && formatSlot(selectedSlot)}. We'll confirm by email shortly.
      </SuccessNotice>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label className="mb-2 block">Pick a day</Label>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {days.map((d) => {
            const { weekday, day, month } = formatDay(d);
            const active = selectedDay && d.getTime() === selectedDay.getTime();
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => setSelectedDay(d)}
                className={
                  "flex h-16 w-14 flex-none flex-col items-center justify-center gap-0.5 rounded-md border text-xs transition-colors " +
                  (active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface-raised text-foreground hover:border-[var(--color-neutral-500)]")
                }
              >
                <span className="opacity-70">{weekday}</span>
                <span className="text-base font-semibold">{day}</span>
                <span className="opacity-70">{month}</span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <div>
          <Label className="mb-2 block">Pick a time (10 AM – 6 PM)</Label>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {TIME_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setSelectedSlot(slot)}
                className={
                  "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors " +
                  (selectedSlot === slot
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface-raised text-foreground hover:border-[var(--color-neutral-500)]")
                }
              >
                {formatSlot(slot)}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedDay && selectedSlot && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bd-call-name">Full name *</Label>
            <Input id="bd-call-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bd-call-email">Email *</Label>
            <Input id="bd-call-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
      )}

      <FieldError>{error}</FieldError>

      <Button type="submit" disabled={!selectedDay || !selectedSlot || submitting}>
        {submitting ? "Sending…" : "Request this time"}
      </Button>
    </form>
  );
}

const TAB_COPY = {
  message: { title: "Send a message", description: "We'll respond within 24 hours." },
  call: { title: "Book a 30-min call", description: "Pick a time that works for you. We'll cover your use case, timeline, and next steps." },
};

export default function BookDemoDialog({ open, onOpenChange, defaultTab = "message" }) {
  const [tab, setTab] = useState(defaultTab);
  // defaultTab only seeds useState's initial value — this component stays
  // mounted across opens/closes (so form drafts aren't lost if you close
  // by accident), so without this, clicking "Book a demo" then later
  // "Book a call" would keep showing whichever tab was open the first time.
  useEffect(() => {
    if (open) setTab(defaultTab);
  }, [open, defaultTab]);
  const copy = TAB_COPY[tab];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="message">Send a message</TabsTrigger>
            <TabsTrigger value="call">Book a 30-min call</TabsTrigger>
          </TabsList>
          <TabsContent value="message">
            <ContactForm />
          </TabsContent>
          <TabsContent value="call">
            <CallBookingForm />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
