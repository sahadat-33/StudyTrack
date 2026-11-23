import { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Pause, Play, RotateCcw } from 'lucide-react';
import { toast } from '@workspace/hsc-command-center-ds/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@workspace/hsc-command-center-ds/components/ui/alert-dialog';
import { Button } from '@workspace/hsc-command-center-ds/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/hsc-command-center-ds/components/ui/card';
import { Label } from '@workspace/hsc-command-center-ds/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/hsc-command-center-ds/components/ui/select';
import type { StudyData, StudyTimer } from '../lib/model';

type StudyTimerProps = {
  data: StudyData;
  updateData: (updater: (current: StudyData) => StudyData) => Promise<StudyData>;
};

function clockLabel(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function runningSeconds(timer: StudyTimer, now: number) {
  const currentRun = timer.resumedAt
    ? Math.max(0, Math.floor((now - Date.parse(timer.resumedAt)) / 1000))
    : 0;
  return timer.elapsedSeconds + currentRun;
}

export function StudyTimerCard({ data, updateData }: StudyTimerProps) {
  const [now, setNow] = useState(Date.now());
  const [subjectChoice, setSubjectChoice] = useState(data.subjects[0]?.id ?? 'none');
  const [chapterChoice, setChapterChoice] = useState('none');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const timer = data.activeTimer;

  useEffect(() => {
    if (!timer || timer.isPaused) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timer?.isPaused, timer?.resumedAt]);

  useEffect(() => {
    if (subjectChoice !== 'none' && !data.subjects.some((subject) => subject.id === subjectChoice)) {
      setSubjectChoice(data.subjects[0]?.id ?? 'none');
      setChapterChoice('none');
    }
  }, [data.subjects, subjectChoice]);

  const chapters = useMemo(
    () => data.chapters.filter((chapter) => chapter.subjectId === subjectChoice),
    [data.chapters, subjectChoice],
  );
  useEffect(() => {
    if (chapterChoice !== 'none' && !chapters.some((chapter) => chapter.id === chapterChoice)) {
      setChapterChoice('none');
    }
  }, [chapterChoice, chapters]);
  const elapsed = timer ? runningSeconds(timer, now) : 0;
  const timerSubject = timer?.subjectId
    ? data.subjects.find((subject) => subject.id === timer.subjectId)?.name ?? 'Subject removed'
    : 'General study';
  const timerChapter = timer?.chapterId
    ? data.chapters.find((chapter) => chapter.id === timer.chapterId)?.title
    : null;

  const start = async () => {
    const timestamp = new Date().toISOString();
    const nextTimer: StudyTimer = {
      id: globalThis.crypto?.randomUUID?.() ?? `timer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      subjectId: subjectChoice === 'none' ? null : subjectChoice,
      chapterId: chapterChoice === 'none' ? null : chapterChoice,
      startedAt: timestamp,
      elapsedSeconds: 0,
      resumedAt: timestamp,
      isPaused: false,
    };
    try {
      await updateData((current) => ({ ...current, activeTimer: nextTimer }));
      setNow(Date.now());
    } catch (error) {
      toast({ title: 'Could not start timer', description: error instanceof Error ? error.message : 'Please try again.' });
    }
  };

  const pause = async () => {
    if (!timer?.resumedAt) return;
    const pausedAt = Date.now();
    const total = runningSeconds(timer, pausedAt);
    try {
      await updateData((current) => current.activeTimer?.id !== timer.id
        ? current
        : { ...current, activeTimer: { ...timer, elapsedSeconds: total, resumedAt: null, isPaused: true } });
    } catch (error) {
      toast({ title: 'Could not pause timer', description: error instanceof Error ? error.message : 'Please try again.' });
    }
  };

  const resume = async () => {
    if (!timer) return;
    const timestamp = new Date().toISOString();
    try {
      await updateData((current) => current.activeTimer?.id !== timer.id
        ? current
        : { ...current, activeTimer: { ...timer, resumedAt: timestamp, isPaused: false } });
      setNow(Date.now());
    } catch (error) {
      toast({ title: 'Could not resume timer', description: error instanceof Error ? error.message : 'Please try again.' });
    }
  };

  const finish = async () => {
    if (!timer || elapsed < 1) return;
    const session = {
      id: timer.id,
      subjectId: timer.subjectId,
      chapterId: timer.chapterId,
      startedAt: timer.startedAt,
      durationMinutes: Math.min(1440, Math.max(1, Math.round(elapsed / 60))),
      notes: 'Timed study session',
    };
    try {
      await updateData((current) => current.activeTimer?.id !== timer.id
        ? current
        : { ...current, activeTimer: null, sessions: [...current.sessions, session] });
      toast({ title: 'Study session saved', description: `${session.durationMinutes} minutes added to your study log.` });
    } catch (error) {
      toast({ title: 'Could not save session', description: error instanceof Error ? error.message : 'Please try again.' });
    }
  };

  const discard = async () => {
    if (!timer) return;
    try {
      await updateData((current) => current.activeTimer?.id !== timer.id
        ? current
        : { ...current, activeTimer: null });
      setConfirmDiscard(false);
      toast({ title: 'Timer discarded', description: 'No study session was added.' });
    } catch (error) {
      toast({ title: 'Could not discard timer', description: error instanceof Error ? error.message : 'Please try again.' });
    }
  };

  return <>
    <Card data-testid="card-study-timer">
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Clock3 className="size-5" /></span>
          <div><CardTitle>Study timer</CardTitle><CardDescription>Time is saved as a session when you finish. An active timer resumes safely after a reload.</CardDescription></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!timer ? <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="timer-subject">Subject (optional)</Label><Select value={subjectChoice} onValueChange={(value) => { setSubjectChoice(value); setChapterChoice('none'); }}><SelectTrigger id="timer-subject" data-testid="select-timer-subject"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">General study</SelectItem>{data.subjects.map((subject) => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="timer-chapter">Chapter (optional)</Label><Select value={chapterChoice} onValueChange={setChapterChoice} disabled={subjectChoice === 'none' || chapters.length === 0}><SelectTrigger id="timer-chapter" data-testid="select-timer-chapter"><SelectValue placeholder="Choose a chapter" /></SelectTrigger><SelectContent><SelectItem value="none">No chapter</SelectItem>{chapters.map((chapter) => <SelectItem key={chapter.id} value={chapter.id}>{chapter.title}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <Button onClick={() => void start()} data-testid="button-start-study-timer"><Play /> Start timer</Button>
        </> : <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
            <div><p className="font-medium">{timerSubject}{timerChapter ? ` · ${timerChapter}` : ''}</p><p className="text-xs text-muted-foreground">{timer.isPaused ? 'Paused · elapsed time is saved' : 'Timer is running'}</p></div>
            <p className="font-mono text-3xl font-semibold tabular-nums" role="timer" aria-live="off" data-testid="text-timer-elapsed">{clockLabel(elapsed)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {timer.isPaused
              ? <Button variant="outline" onClick={() => void resume()} data-testid="button-resume-study-timer"><Play /> Resume</Button>
              : <Button variant="outline" onClick={() => void pause()} data-testid="button-pause-study-timer"><Pause /> Pause</Button>}
            <Button onClick={() => void finish()} disabled={elapsed < 1} data-testid="button-finish-study-timer"><Check /> Finish & save</Button>
            <Button variant="ghost" onClick={() => setConfirmDiscard(true)} data-testid="button-discard-study-timer"><RotateCcw /> Discard</Button>
          </div>
        </>}
      </CardContent>
    </Card>
    <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard this timer?</AlertDialogTitle><AlertDialogDescription>The elapsed time will be removed and no study session will be saved.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep timer</AlertDialogCancel><AlertDialogAction onClick={() => void discard()}>Discard timer</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </>;
}
