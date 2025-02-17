import ICAL from "ical.js";
import { zonedTimeToUtc, toZonedTime } from "date-fns-tz";
import { v4 as uuidv4 } from "uuid";
import { CalendarEvent, EventStatus, AttendeeStatus } from "@/types/calendar";

export async function parseICalFeed(
  feedId: string,
  url: string
): Promise<CalendarEvent[]> {
  try {
    const response = await fetch("/api/calendar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.error || `Failed to fetch calendar feed: ${response.statusText}`
      );
    }

    const { data: icalData } = await response.json();
    const jcalData = ICAL.parse(icalData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents("vevent");

    return vevents.map((vevent) => parseEvent(feedId, vevent));
  } catch (error) {
    console.error("Error parsing iCal feed:", error);
    throw error;
  }
}

function parseEvent(feedId: string, vevent: ICAL.Component): CalendarEvent {
  const event = new ICAL.Event(vevent);
  const timezone = event.startDate?.timezone || "UTC";

  const startDate = event.startDate
    ? toZonedTime(event.startDate.toJSDate(), timezone)
    : new Date();

  const endDate = event.endDate
    ? toZonedTime(event.endDate.toJSDate(), timezone)
    : new Date(startDate.getTime() + 3600000); // Default 1 hour duration

  const attendees = vevent.getAllProperties("attendee").map((attendee) => ({
    name: attendee.getParameter("cn"),
    email: attendee.getFirstValue(),
    status: parseAttendeeStatus(attendee.getParameter("partstat")),
  }));

  const organizer = vevent.getFirstProperty("organizer");
  const organizerInfo = organizer
    ? {
        name: organizer.getParameter("cn"),
        email: organizer.getFirstValue(),
      }
    : undefined;

  return {
    id: uuidv4(), // Generate a unique ID for the event
    feedId,
    uid: event.uid,
    title: event.summary || "Untitled Event",
    description: event.description,
    start: startDate,
    end: endDate,
    location: event.location,
    isRecurring: !!event.recurrenceId,
    recurrenceRule: event.recurrenceRule?.toString(),
    allDay: event.startDate?.isDate || false, // isDate true means it's an all-day event
    status: parseEventStatus(vevent.getFirstPropertyValue("status")),
    created: event.created?.toJSDate(),
    lastModified: event.lastModified?.toJSDate(),
    sequence: event.sequence,
    organizer: organizerInfo,
    attendees,
  };
}

function parseEventStatus(status?: string): EventStatus | undefined {
  if (!status) return undefined;

  switch (status.toUpperCase()) {
    case "CONFIRMED":
      return EventStatus.CONFIRMED;
    case "TENTATIVE":
      return EventStatus.TENTATIVE;
    case "CANCELLED":
      return EventStatus.CANCELLED;
    default:
      return undefined;
  }
}

function parseAttendeeStatus(status?: string): AttendeeStatus | undefined {
  if (!status) return undefined;

  switch (status.toUpperCase()) {
    case "ACCEPTED":
      return AttendeeStatus.ACCEPTED;
    case "TENTATIVE":
      return AttendeeStatus.TENTATIVE;
    case "DECLINED":
      return AttendeeStatus.DECLINED;
    case "NEEDS-ACTION":
      return AttendeeStatus.NEEDS_ACTION;
    default:
      return undefined;
  }
}
