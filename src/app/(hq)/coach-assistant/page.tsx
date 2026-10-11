import { CoachAssistantView } from "@/components/screens/coach-tools/coach-assistant-view";

// Coach-only route. The assistant backend (/api/assistant) is live once
// ANTHROPIC_API_KEY is set; until then the view keeps its honest gate.
export default function CoachAssistantPage() {
  return <CoachAssistantView configured={Boolean(process.env.ANTHROPIC_API_KEY)} />;
}
