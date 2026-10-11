// Raw GoHighLevel API v2 response shapes (only the fields we read).
// Endpoint docs: https://highlevel.stoplight.io/ (API v2, services.leadconnectorhq.com)

export type GhlCustomFieldDef = {
  id: string;
  name: string;
  fieldKey?: string;
  dataType?: string;
};

export type GhlContactCustomField = {
  id: string;
  value?: string | number | string[] | null;
};

export type GhlContact = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  dateAdded?: string;
  customFields?: GhlContactCustomField[];
};

export type GhlContactsPage = {
  contacts: GhlContact[];
  meta?: {
    total?: number;
    startAfterId?: string;
    startAfter?: number;
    nextPageUrl?: string | null;
  };
};

// GET /users/?locationId=... . Lead owners / setters / closers are GHL users;
// opportunities and appointments reference them by id (assignedTo /
// assignedUserId). We only read the id and a display name.
export type GhlUser = {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

export type GhlPipelineStage = {
  id: string;
  name: string;
  position?: number;
};

export type GhlPipeline = {
  id: string;
  name: string;
  stages: GhlPipelineStage[];
};

export type GhlOpportunity = {
  id: string;
  name?: string | null;
  monetaryValue?: number | null;
  pipelineId?: string;
  pipelineStageId?: string;
  status?: string; // open | won | lost | abandoned
  /** Opportunity-level Lead Source (the Typeform Zaps set this: TikTok /
   *  Instagram). Preferred over the contact's source when recognised. */
  source?: string | null;
  contactId?: string;
  assignedTo?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastStatusChangeAt?: string;
  lastStageChangeAt?: string;
  contact?: GhlContact | null;
};

export type GhlOpportunitiesPage = {
  opportunities: GhlOpportunity[];
  // startAfter/startAfterId: cursor for the next page (page-number pagination
  // is server-capped at 10,000 results, so fetchAllOpportunities uses these).
  meta?: { total?: number; startAfterId?: string; startAfter?: number; nextPageUrl?: string };
};

// --- Conversations / Inbox (Stage 1 read) ---------------------------------
// GET /conversations/search?locationId=... -> { conversations, total, traceId }.
// Verified against live DP data 2026-06-21. Channel signal lives in the message
// type enum (TYPE_SMS, TYPE_WHATSAPP, TYPE_INSTAGRAM, TYPE_EMAIL, TYPE_FACEBOOK,
// plus non-channel activity types like TYPE_PHONE / TYPE_NO_SHOW). lastMessageType
// is the most reliable per-thread hint; `type` is the conversation-level type.
// lastMessageDate arrives as epoch ms (number). Note: the search row does NOT
// carry lastMessageBody, so the thread preview is empty until messages load.
export type GhlConversation = {
  id: string;
  contactId?: string;
  locationId?: string;
  fullName?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  type?: string | null; // conversation type, e.g. TYPE_PHONE
  lastMessageBody?: string | null; // absent on the search row (verified)
  lastMessageType?: string | null; // e.g. TYPE_SMS, TYPE_INSTAGRAM
  lastMessageDate?: string | number | null; // epoch ms on live data; ISO tolerated
  unreadCount?: number;
};

export type GhlConversationsPage = {
  conversations: GhlConversation[];
  total?: number;
};

// GET /conversations/{id}/messages . GHL nests the array:
// { messages: { messages: GhlMessage[], lastMessageId, nextPage } }.
export type GhlMessage = {
  id: string;
  body?: string | null;
  direction?: "inbound" | "outbound" | string;
  type?: number | string; // numeric channel code
  messageType?: string | null; // e.g. TYPE_SMS (string form)
  dateAdded?: string | number | null;
  status?: string | null;
};

export type GhlMessagesPage = {
  messages?: {
    messages?: GhlMessage[];
    lastMessageId?: string;
    nextPage?: boolean;
  };
};

// --- Calendar (Stage 1 read) ----------------------------------------------
// GET /calendars/?locationId=... -> { calendars, traceId }; events come from
// GET /calendars/events?locationId=...&calendarId=...&startTime=...&endTime=...
// Verified 2026-06-21: the events endpoint REQUIRES one of calendarId/userId/
// groupId (a bare locationId query 422s), so the client fans out per calendar.
// startTime/endTime on returned events may be ISO or epoch ms (parser tolerates
// both); the live DP location currently has no booked events (empty state).
export type GhlCalendar = {
  id: string;
  name?: string | null;
  calendarType?: string | null;
  isActive?: boolean;
};

export type GhlCalendarEvent = {
  id: string;
  title?: string | null;
  calendarId?: string | null;
  locationId?: string | null;
  contactId?: string | null;
  startTime?: string | number | null;
  endTime?: string | number | null;
  appointmentStatus?: string | null; // confirmed, cancelled, showed, noshow, ...
  address?: string | null; // often holds "Zoom" / a phone number
  assignedUserId?: string | null;
};
