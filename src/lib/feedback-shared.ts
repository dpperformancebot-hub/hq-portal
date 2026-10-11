// R3-3: client-safe feedback constants/types (the actions file is "use
// server" and may only export async functions).

export const FEEDBACK_CATEGORIES = ["Feedback", "Issue", "Idea"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export type FeedbackRow = {
  id: string;
  coachName: string;
  category: FeedbackCategory;
  subject: string;
  details: string;
  createdAt: string;
};
