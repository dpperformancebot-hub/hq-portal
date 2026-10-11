"use client";

// Quizzes (M6, coach toolset): coach training quizzes from the prototype's
// question banks (intro -> runner -> result; pass mark 100% per the content).
// Attempt history persists per-browser via localStorage; per-coach attempt
// records move to Supabase with auth (flagged).

import { useEffect, useState } from "react";
import { Button, Card, PageHeader, Panel } from "@/components/ui";
import { QUIZZES, type Quiz } from "@/lib/coach-content/quizzes";
import { getUserStateAction, setUserStateAction } from "@/lib/user-state-actions";

const RESULTS_KEY = "tjd-quiz-best";

type BestScores = Record<string, number>; // quizId -> best pct

function loadBest(): BestScores {
  try {
    return JSON.parse(localStorage.getItem(RESULTS_KEY) ?? "{}") as BestScores;
  } catch {
    return {};
  }
}

// Runner with the original portal's retry flow (2026-07-02): pass mark is
// 100%; a failed round can be retried on ONLY the missed questions, with an
// attempt counter, until the quiz is clean. Answers accumulate across rounds,
// so the final pass means every question has been answered correctly.
function Runner({ quiz, onExit }: { quiz: Quiz; onExit: (scorePct: number | null) => void }) {
  const total = quiz.questions.length;
  const [round, setRound] = useState<number[]>(() => quiz.questions.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [attempt, setAttempt] = useState(1);

  const done = pos >= round.length;
  const isRetryRound = round.length < total;

  if (done) {
    const missed = round.filter((qi) => answers[qi] !== quiz.questions[qi].correct);
    const overallCorrect = quiz.questions.filter((question, i) => answers[i] === question.correct).length;
    const pct = Math.round((overallCorrect / total) * 100);
    const passed = missed.length === 0;
    return (
      <Card className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Result</div>
          <div className="text-xs tabular-nums text-fg-muted">
            attempt {attempt}
            {isRetryRound ? " (missed only)" : ""}
          </div>
        </div>
        <div className="font-display text-3xl tabular-nums tracking-display text-fg">
          {overallCorrect}/{total} ({pct}%)
        </div>
        <p className={`text-sm ${passed ? "text-positive" : "text-warn"}`}>
          {passed
            ? attempt === 1
              ? "Passed first go. Nice work."
              : `Clean after ${attempt} attempts. Passed.`
            : `Pass mark is 100%. ${missed.length} to fix: retry just those below.`}
        </p>
        {!passed ? (
          <ul className="space-y-2 text-sm text-fg-dim">
            {missed.map((qi) => (
              <li key={quiz.questions[qi].q}>
                <span className="text-fg">{quiz.questions[qi].q}</span>
                <br />
                Correct: {quiz.questions[qi].options[quiz.questions[qi].correct]}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex items-center gap-2">
          {!passed ? (
            <Button
              onClick={() => {
                setRound(missed);
                setPos(0);
                setAttempt((a) => a + 1);
              }}
            >
              Retry missed ({missed.length})
            </Button>
          ) : null}
          <Button variant={passed ? "primary" : "ghost"} onClick={() => onExit(pct)}>
            Back to quizzes
          </Button>
        </div>
      </Card>
    );
  }

  const qi = round[pos];
  const q = quiz.questions[qi];
  return (
    <Card className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
          {quiz.title}
          {isRetryRound ? " · retrying missed" : ""}
        </div>
        <div className="text-xs tabular-nums text-fg-muted">
          {pos + 1} / {round.length} · attempt {attempt}
        </div>
      </div>
      <p className="text-sm font-medium text-fg">{q.q}</p>
      <div className="space-y-2">
        {q.options.map((opt, i) => (
          <button
            key={opt}
            onClick={() => {
              setAnswers((a) => ({ ...a, [qi]: i }));
              setPos((n) => n + 1);
            }}
            className="block w-full rounded-control border border-border-soft bg-surface-2 px-3 py-2 text-left text-sm text-fg hover:border-accent"
          >
            {opt}
          </button>
        ))}
      </div>
      <button onClick={() => onExit(null)} className="text-xs text-fg-muted hover:text-fg">
        Exit without finishing
      </button>
    </Card>
  );
}

export function QuizzesView() {
  const [active, setActive] = useState<Quiz | null>(null);
  const [best, setBest] = useState<BestScores>({});

  // Best scores follow the LOGIN (user_state, 2026-07-02), merged with the
  // localStorage fallback so nothing recorded pre-migration is lost.
  useEffect(() => {
    setBest(loadBest());
    void getUserStateAction("quiz-best").then((v) => {
      if (v && typeof v === "object") {
        setBest((local) => {
          const merged: BestScores = { ...(v as BestScores) };
          for (const [id, score] of Object.entries(local)) merged[id] = Math.max(merged[id] ?? 0, score);
          return merged;
        });
      }
    });
  }, []);

  if (active) {
    return (
      <div className="mx-auto max-w-2xl">
        <Runner
          quiz={active}
          onExit={(pct) => {
            if (pct !== null) {
              const next = { ...best, [active.id]: Math.max(best[active.id] ?? 0, pct) };
              try {
                localStorage.setItem(RESULTS_KEY, JSON.stringify(next));
              } catch {
                // ignore
              }
              setBest(next);
              // Follow the login (best-effort; localStorage stays the fallback).
              void setUserStateAction("quiz-best", next);
            }
            setActive(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Coach tools"
        title="Quizzes"
        subtitle="Training and CPD. Pass mark is 100%: re-run until it is clean."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {QUIZZES.map((quiz) => (
          <Panel
            key={quiz.id}
            title={quiz.title}
            action={
              best[quiz.id] !== undefined ? (
                <span className={`text-xs tabular-nums ${best[quiz.id] === 100 ? "text-positive" : "text-fg-dim"}`}>
                  best {best[quiz.id]}%
                </span>
              ) : undefined
            }
          >
            <p className="text-sm text-fg-dim">{quiz.description}</p>
            <ul className="mt-2 space-y-1 text-xs text-fg-muted">
              {quiz.expect.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <div className="mt-4">
              <Button onClick={() => setActive(quiz)}>Start quiz</Button>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
