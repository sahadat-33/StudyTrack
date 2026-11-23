import { type FormEvent, type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { Activity, ArrowDownToLine, Bell, BookOpen, CalendarDays, ChartNoAxesCombined, Check, ChevronRight, CircleHelp, Clock3, FileText, GraduationCap, House, MoreHorizontal, Pencil, Plus, RotateCcw, Settings2, ShieldCheck, Trash2, Trophy, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { StudyTimerCard } from '@/components/study-timer';
import NotFound from '@/pages/not-found';
import { Button } from '@workspace/hsc-command-center-ds/components/ui/button';
import { Badge } from '@workspace/hsc-command-center-ds/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/hsc-command-center-ds/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@workspace/hsc-command-center-ds/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@workspace/hsc-command-center-ds/components/ui/alert-dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@workspace/hsc-command-center-ds/components/ui/empty';
import { Input } from '@workspace/hsc-command-center-ds/components/ui/input';
import { Label } from '@workspace/hsc-command-center-ds/components/ui/label';
import { Progress } from '@workspace/hsc-command-center-ds/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/hsc-command-center-ds/components/ui/select';
import { Textarea } from '@workspace/hsc-command-center-ds/components/ui/textarea';
import { Toaster } from '@workspace/hsc-command-center-ds/components/ui/toaster';
import { TooltipProvider } from '@workspace/hsc-command-center-ds/components/ui/tooltip';
import { toast } from '@workspace/hsc-command-center-ds/hooks/use-toast';
import { cn } from '@workspace/hsc-command-center-ds/lib/utils';
import { downloadBackup, parseBackupJson } from './lib/backup';
import { resetStudyData, getStudyData, replaceStudyData, updateStudyData } from './lib/study-store';
import { revisionOffsets } from './lib/model';
import type { RevisionItem, StudyData, StudyTimer } from './lib/model';
import { GENERAL_PAPER, SYLLABUS_TEMPLATE, parseSyllabusFile, type ImportResult } from './lib/syllabus-import';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type EntityKind = 'subjects' | 'papers' | 'chapters' | 'tasks' | 'sessions' | 'practices' | 'revisions' | 'exams' | 'results';
type EntityRecord = { id: string; [key: string]: unknown };
type FieldType = 'text' | 'date' | 'time' | 'number' | 'textarea' | 'select';
type Field = { key: string; label: string; type?: FieldType; options?: { value: string; label: string }[]; required?: boolean; min?: number; max?: number; step?: string; hint?: string };
type EditorState = { kind: EntityKind; record?: EntityRecord } | null;

type StoreContextValue = { data: StudyData | null; loading: boolean; error: string; save: (kind: EntityKind, record: EntityRecord) => Promise<void>; remove: (kind: EntityKind, id: string) => Promise<void>; reload: () => Promise<void>; update: (updater: (current: StudyData) => StudyData) => Promise<StudyData> };
const StoreContext = createContext<StoreContextValue | null>(null);
function useStudy() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('Study store is unavailable.');
  return context;
}

const dhakaDateParts = (date: Date) => Object.fromEntries(
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).map(({ type, value }) => [type, value]),
) as Record<string, string>;
const todayISO = () => {
  const parts = dhakaDateParts(new Date());
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const todayLabel = () => new Intl.DateTimeFormat(undefined, {
  timeZone: 'Asia/Dhaka',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
}).format(new Date());
const dateInDhaka = (value: string) => {
  const parts = dhakaDateParts(new Date(value));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const currentStudyStreak = (sessions: StudyData['sessions']) => {
  const studiedDates = new Set(sessions.map((session) => dateInDhaka(session.startedAt)));
  const today = todayISO();
  let cursor = studiedDates.has(today) ? today : addDhakaDays(today, -1);
  let streak = 0;
  while (studiedDates.has(cursor)) {
    streak += 1;
    cursor = addDhakaDays(cursor, -1);
  }
  return streak;
};
const countableChapters = (data: StudyData) => {
  const archivedSubjects = new Set(data.subjects.filter((subject) => subject.isArchived).map((subject) => subject.id));
  return data.chapters.filter((chapter) =>
    !chapter.isOptional &&
    !chapter.isExcluded &&
    !chapter.isArchived &&
    !archivedSubjects.has(chapter.subjectId),
  );
};
const routerBase = (() => {
  const configuredBase = import.meta.env.BASE_URL;
  if (configuredBase.startsWith('/')) return configuredBase.replace(/\/$/, '');
  const firstSegment = window.location.pathname.split('/').filter(Boolean)[0];
  return firstSegment ? `/${firstSegment}` : '';
})();
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `record-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const titleCase = (value: string) => value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
const minutesLabel = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
const priorityRank = { high: 0, normal: 1, low: 2 } as const;
const examTypeLabels = {
  pretest: 'Pre-test',
  test: 'Test',
  coaching: 'Coaching exam',
  weekly: 'Weekly test',
  chapter: 'Chapter test',
  model: 'Model test',
  custom: 'Custom exam',
} as const;
const countdownDays = (date: string) => Math.round(
  (Date.parse(`${date.slice(0, 10)}T00:00:00+06:00`) -
    Date.parse(`${todayISO()}T00:00:00+06:00`)) /
    86_400_000,
);
const formatTimer = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, '0')).join(':');
};
const addDhakaDays = (date: string, days: number) => {
  const next = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};
const nextRevisionInterval = (current: number, result: 'hard' | 'okay' | 'easy') => {
  if (current > 30) {
    if (result === 'hard') return Math.max(1, Math.floor(current / 2));
    if (result === 'easy') return Math.min(365, Math.round(current * 1.5));
    return current;
  }
  const intervals = [1, 3, 7, 14, 30];
  let index = 0;
  intervals.forEach((interval, position) => {
    if (interval <= current) index = position;
  });
  if (result === 'hard') index = Math.max(0, index - 1);
  if (result === 'easy') index = Math.min(intervals.length - 1, index + 1);
  return intervals[index];
};
const prettyDate = (value: string) => {
  const date = new Date(value.length === 10 ? `${value}T12:00:00+06:00` : value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString(undefined, { timeZone: 'Asia/Dhaka', weekday: 'short', month: 'short', day: 'numeric' });
};

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: House },
  { href: '/planner', label: 'Study', icon: CalendarDays },
  { href: '/analytics', label: 'Progress', icon: ChartNoAxesCombined },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];
const MORE_ITEMS = [
  { href: '/reminders', label: 'Reminders', detail: 'Due tasks, reviews, and upcoming exams', icon: Bell },
  { href: '/exams', label: 'Exams', detail: 'Dates you enter, clearly marked', icon: CalendarDays },
  { href: '/revision', label: 'Revision', detail: 'Your own review schedule', icon: RotateCcw },
  { href: '/results', label: 'Results', detail: 'Scores recorded by you', icon: Trophy },
  { href: '/settings', label: 'Settings & backup', detail: 'Privacy, reset, and data portability', icon: Settings2 },
];

function App() {
  const [data, setData] = useState<StudyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = async () => {
    setLoading(true);
    try {
      setData(await getStudyData());
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open your local study data.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void reload(); }, []);
  useEffect(() => {
    const root = document.documentElement;
    const dark = data?.settings.theme === 'dark' || (data?.settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', dark);
  }, [data?.settings.theme]);

  const update = async (updater: (current: StudyData) => StudyData) => {
    const next = await updateStudyData(updater);
    setData(next);
    return next;
  };
  const save = async (kind: EntityKind, record: EntityRecord) => {
    await update((current) => {
      const existing = current[kind] as EntityRecord[];
      const found = existing.some((item) => item.id === record.id);
      return { ...current, [kind]: found ? existing.map((item) => item.id === record.id ? record : item) : [...existing, record] } as StudyData;
    });
  };
  const remove = async (kind: EntityKind, id: string) => {
    await update((current) => {
      const removed = (current[kind] as EntityRecord[]).find((item) => item.id === id);
      const nextData = { ...current, [kind]: (current[kind] as EntityRecord[]).filter((item) => item.id !== id) } as StudyData;
      if (kind === 'subjects' && removed) {
        const paperIds = new Set(current.papers.filter((item) => item.subjectId === id).map((item) => item.id));
        const chapterIds = new Set(current.chapters.filter((item) => item.subjectId === id).map((item) => item.id));
        nextData.papers = current.papers.filter((item) => item.subjectId !== id);
        nextData.chapters = current.chapters.filter((item) => item.subjectId !== id);
        nextData.tasks = current.tasks.filter((item) => item.subjectId !== id);
        nextData.sessions = current.sessions.filter((item) => item.subjectId !== id);
        nextData.practices = current.practices.filter((item) => item.subjectId !== id);
        nextData.revisions = current.revisions.filter((item) => item.subjectId !== id);
        const removedExamIds = new Set(current.exams.filter((item) => item.subjectId === id).map((item) => item.id));
        nextData.exams = current.exams.filter((item) => item.subjectId !== id);
        nextData.results = current.results.filter((item) => item.subjectId !== id).map((item) => removedExamIds.has(item.examId ?? '') ? { ...item, examId: null } : item);
        nextData.chapters = nextData.chapters.map((item) => paperIds.has(item.paperId ?? '') ? { ...item, paperId: null } : item);
        nextData.tasks = nextData.tasks.map((item) => chapterIds.has(item.chapterId ?? '') ? { ...item, chapterId: null } : item);
        if (current.activeTimer?.subjectId === id) nextData.activeTimer = null;
      }
      if (kind === 'papers') nextData.chapters = current.chapters.map((item) => item.paperId === id ? { ...item, paperId: null } : item);
      if (kind === 'chapters') {
        nextData.tasks = current.tasks.map((item) => item.chapterId === id ? { ...item, chapterId: null } : item);
        nextData.sessions = current.sessions.map((item) => item.chapterId === id ? { ...item, chapterId: null } : item);
        nextData.practices = current.practices.map((item) => item.chapterId === id ? { ...item, chapterId: null } : item);
        nextData.revisions = current.revisions.map((item) => item.chapterId === id ? { ...item, chapterId: null } : item);
        if (current.activeTimer?.chapterId === id) nextData.activeTimer = { ...current.activeTimer, chapterId: null };
      }
      if (kind === 'exams') nextData.results = current.results.map((item) => item.examId === id ? { ...item, examId: null } : item);
      return nextData;
    });
  };
  const context: StoreContextValue = { data, loading, error, save, remove, reload, update };

  return (
    <TooltipProvider>
      <StoreContext.Provider value={context}>
        <WouterRouter base={routerBase}>
          <Router />
        </WouterRouter>
        <GlobalOverlays />
      </StoreContext.Provider>
      <Toaster />
    </TooltipProvider>
  );
}

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <AppShell>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/syllabus" component={SyllabusPage} />
          <Route path="/planner" component={PlannerPage} />
          <Route path="/analytics" component={AnalyticsPage} />
          <Route path="/more" component={MorePage} />
          <Route path="/reminders" component={RemindersPage} />
          <Route path="/exams" component={ExamsPage} />
          <Route path="/revision" component={RevisionPage} />
          <Route path="/results" component={ResultsPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </AppShell>
    </ErrorBoundary>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const updateStatus = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);
  const active = NAV_ITEMS.find((item) => item.href === location)?.label ?? 'More';
  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <aside className="hidden w-64 shrink-0 border-r bg-card md:flex md:flex-col">
        <Link href="/" className="flex items-center gap-3 border-b px-6 py-5 text-foreground no-underline" data-testid="link-brand-home">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"><GraduationCap className="size-5" /></span>
          <span><span className="block text-sm font-semibold">HSC Command Center</span><span className="text-xs text-muted-foreground">2027 · private study space</span></span>
        </Link>
        <nav className="flex-1 space-y-1 p-3" aria-label="Main navigation">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => <NavLink key={href} href={href} label={label} icon={<Icon className="size-4" />} active={active === label} />)}
        </nav>
      </aside>
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2 md:hidden"><span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><GraduationCap className="size-4" /></span><span className="text-sm font-semibold">HSC 2027</span></div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite"><span className={cn('size-2 rounded-full', online ? 'bg-primary' : 'bg-muted-foreground')} aria-hidden="true" /><span>{online ? 'Online' : 'Offline · data is still on this device'}</span></div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-8">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background/95 px-1 pb-1 pt-1 backdrop-blur md:hidden" aria-label="Mobile navigation">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={cn('flex min-h-14 flex-col items-center justify-center gap-1 rounded-md text-xs no-underline', location === href ? 'text-primary' : 'text-muted-foreground')} aria-current={location === href ? 'page' : undefined} data-testid={`link-mobile-${label.toLowerCase()}`}><Icon className="size-4" /><span>{label}</span></Link>)}
        </nav>
      </div>
    </div>
  );
}

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: ReactNode; active: boolean }) {
  return <Link href={href} className={cn('flex items-center gap-3 rounded-md px-3 py-2.5 text-sm no-underline transition-colors', active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')} aria-current={active ? 'page' : undefined} data-testid={`link-nav-${label.toLowerCase()}`}>{icon}{label}</Link>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div>{eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>}<h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}</div>{action}</div>;
}

function LoadingOrError() {
  const { loading, error, reload } = useStudy();
  if (loading) return <div className="space-y-4" aria-label="Loading study data"><div className="h-8 w-48 animate-pulse rounded-md bg-muted" /><div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-muted" />)}</div><div className="h-48 animate-pulse rounded-xl bg-muted" /></div>;
  if (error) return <Card><CardContent className="flex flex-col items-start gap-3 p-6"><p className="font-medium">Your local study data couldn’t be opened.</p><p className="text-sm text-muted-foreground">{error}</p><Button variant="outline" onClick={() => void reload()} data-testid="button-retry-storage">Retry</Button></CardContent></Card>;
  return null;
}

function PageContent({ children }: { children: ReactNode }) {
  const { loading, error } = useStudy();
  if (loading || error) return <LoadingOrError />;
  return <>{children}</>;
}

function EmptyBlock({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <Empty className="min-h-48 rounded-xl border bg-card px-5 py-8"><EmptyHeader><EmptyMedia variant="icon">{icon ?? <BookOpen />}</EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>{action}</Empty>;
}

function MetricCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
  return <Card><CardContent className="flex items-start justify-between gap-3 p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span></CardContent></Card>;
}

function HomePage() {
  const { data } = useStudy();
  if (!data) return <PageContent><div /></PageContent>;
  const date = todayISO();
  const tasks = data.tasks.filter((task) => task.date === date).sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.title.localeCompare(b.title));
  const completedTasks = tasks.filter((task) => task.status === 'done').length;
  const todayMinutes = data.sessions.filter((session) => session.startedAt.slice(0, 10) === date).reduce((sum, session) => sum + session.durationMinutes, 0);
  const dueRevision = data.revisions.filter((revision) => (revision.status === 'due' || revision.dueDate <= date) && revision.status !== 'reviewed');
  const includedChapters = countableChapters(data);
  const coverage = includedChapters.length ? Math.round(includedChapters.filter((chapter) => chapter.status === 'complete').length / includedChapters.length * 100) : null;
  const planned = data.settings.dailyTargetMinutes;
  const nextExam = data.exams.filter((exam) => exam.date >= date).sort((a, b) => a.date.localeCompare(b.date))[0];
  const streak = currentStudyStreak(data.sessions);
  const editTask = (record?: EntityRecord) => window.dispatchEvent(new CustomEvent('open-editor', { detail: { kind: 'tasks', record } }));
  return <PageContent>
     <PageHeading eyebrow={todayLabel()} title="Today" action={<Button onClick={() => editTask()} data-testid="button-add-today-task"><Plus /> Add a task</Button>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Study logged" value={minutesLabel(todayMinutes)} detail={todayMinutes ? 'from your recorded sessions' : 'No study sessions logged today'} icon={<Clock3 className="size-4" />} />
      <MetricCard label="Revision due" value={`${dueRevision.length}`} detail={dueRevision.length ? 'items on your own schedule' : 'No items due right now'} icon={<RotateCcw className="size-4" />} />
      <MetricCard label="Next exam" value={nextExam ? countdownDays(nextExam.date) === 0 ? 'Today' : `${countdownDays(nextExam.date)} days` : '—'} detail={nextExam ? `${nextExam.title} · ${prettyDate(nextExam.date)} · ${nextExam.dateStatus === 'confirmed' ? 'confirmed by you' : 'provisional date'}` : 'Add a date you have verified'} icon={<CalendarDays className="size-4" />} />
      <MetricCard label="Study streak" value={`${streak} day${streak === 1 ? '' : 's'}`} detail={streak ? 'consecutive days with a saved session' : 'Start a streak with a study log'} icon={<Activity className="size-4" />} />
    </div>
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Today’s plan</CardTitle><CardDescription>Your tasks are yours to shape.</CardDescription></div><Button variant="outline" size="sm" asChild><Link href="/planner" data-testid="link-open-planner">Open planner <ChevronRight /></Link></Button></CardHeader>
        <CardContent>{tasks.length === 0 ? <EmptyBlock icon={<CalendarDays />} title="Nothing planned for today" description="Add a task when you’re ready. A quiet day is okay, too." action={<Button variant="outline" onClick={() => editTask()} data-testid="button-plan-first-task">Plan a task</Button>} /> : <div className="space-y-2">{tasks.map((task) => <TaskRow key={task.id} task={task} onEdit={() => editTask(task as unknown as EntityRecord)} />)}</div>}</CardContent>
      </Card>
      <div className="space-y-4">
        <Card><CardHeader><CardTitle>Progress</CardTitle><CardDescription>Based on what you’ve recorded.</CardDescription></CardHeader><CardContent className="space-y-4">
          <div><div className="mb-2 flex items-center justify-between text-sm"><span>Syllabus coverage</span><span className="text-muted-foreground">{coverage === null ? 'Not set up' : `${coverage}%`}</span></div>{coverage === null ? <p className="text-xs text-muted-foreground">Add included chapters to track coverage.</p> : <Progress value={coverage} />}</div>
          <div><div className="mb-2 flex items-center justify-between text-sm"><span>Study time today</span><span className="text-muted-foreground">{planned ? `${Math.min(100, Math.round(todayMinutes / planned * 100))}% of ${minutesLabel(planned)}` : 'No daily target set'}</span></div>{planned ? <Progress value={Math.min(100, todayMinutes / planned * 100)} /> : <p className="text-xs text-muted-foreground">Set a daily target in Settings to compare time.</p>}</div>
          <p className="border-t pt-3 text-xs text-muted-foreground">More detail is in Progress.</p>
        </CardContent></Card>
      </div>
    </div>
  </PageContent>;
}

function TaskRow({ task, onEdit }: { task: StudyData['tasks'][number]; onEdit: () => void }) {
  const { save, remove } = useStudy();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return <div className="flex items-center gap-3 rounded-lg border p-3" data-testid={`row-task-${task.id}`}>
    <Button size="icon" variant={task.status === 'done' ? 'secondary' : 'outline'} aria-label={task.status === 'done' ? 'Mark task planned' : 'Mark task done'} onClick={() => void save('tasks', { ...task, status: task.status === 'done' ? 'planned' : 'done' } as unknown as EntityRecord)} data-testid={`button-toggle-task-${task.id}`}>{task.status === 'done' ? <Check /> : <span className="size-3 rounded-full border" />}</Button>
     <div className="min-w-0 flex-1"><p className={cn('truncate text-sm font-medium', task.status === 'done' && 'text-muted-foreground line-through')}>{task.title}</p><p className="text-xs text-muted-foreground">{task.kind} · {task.durationMinutes} min</p></div><Badge variant={task.priority === 'high' ? 'secondary' : 'outline'}>{titleCase(task.priority)}</Badge>
    <Button size="icon" variant="ghost" aria-label="Edit task" onClick={onEdit} data-testid={`button-edit-task-${task.id}`}><Pencil /></Button>
    <Button size="icon" variant="ghost" aria-label="Delete task" onClick={() => setConfirmDelete(true)} data-testid={`button-delete-task-${task.id}`}><Trash2 /></Button>
    <ConfirmDialog open={confirmDelete} title="Delete this task?" description="This removes the task from your local planner." onCancel={() => setConfirmDelete(false)} onConfirm={() => { void remove('tasks', task.id); setConfirmDelete(false); }} />
  </div>;
}

function MarkReadControl({ chapter }: { chapter: StudyData['chapters'][number] }) {
  const { update } = useStudy();
  const [busy, setBusy] = useState(false);
  if (chapter.readAt) {
    return <span className="text-xs text-muted-foreground" data-testid={`text-read-${chapter.id}`}>Read {prettyDate(chapter.readAt)}{chapter.readDifficulty ? ` · ${titleCase(chapter.readDifficulty)}` : ''}</span>;
  }
  const markRead = async (difficulty: 'hard' | 'okay' | 'easy') => {
    const today = todayISO();
    const offsets = revisionOffsets(difficulty);
    setBusy(true);
    try {
      await update((current) => {
        const schedule: RevisionItem[] = offsets.map((days) => ({
          id: makeId(),
          title: `${chapter.title} · day ${days}`,
          subjectId: chapter.subjectId,
          chapterId: chapter.id,
          dueDate: addDhakaDays(today, days),
          intervalDays: days,
          lastReviewedAt: null,
          status: 'scheduled',
          reviewResult: null,
        }));
        return {
          ...current,
          chapters: current.chapters.map((item) => item.id === chapter.id ? { ...item, readAt: today, readDifficulty: difficulty } : item),
          revisions: [...current.revisions, ...schedule],
        };
      });
      toast({ title: 'Chapter marked read', description: `Reminders set for day ${offsets.join(', ')}.` });
    } catch (error) {
      toast({ title: 'Could not mark chapter', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setBusy(false);
    }
  };
  return <div className="flex items-center gap-1" aria-label={`Mark ${chapter.title} as read`}>
    {(['hard', 'okay', 'easy'] as const).map((difficulty) => <Button key={difficulty} size="sm" variant="outline" disabled={busy} onClick={() => void markRead(difficulty)} data-testid={`button-read-${difficulty}-${chapter.id}`}>{titleCase(difficulty)}</Button>)}
  </div>;
}

function SyllabusImportButton() {
  const { data, update } = useStudy();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [saving, setSaving] = useState(false);
  const readFile = async (file?: File) => {
    setResult(null);
    setFileName('');
    if (!file) return;
    if (file.size > 512 * 1024) {
      setResult({ rows: [], errors: ['This file is larger than 512 KB.'] });
      return;
    }
    setFileName(file.name);
    setResult(parseSyllabusFile(await file.text(), file.name));
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([SYLLABUS_TEMPLATE], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'syllabus-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };
  const importRows = async () => {
    if (!result?.rows.length) return;
    const rows = result.rows;
    setSaving(true);
    let added = 0;
    let skipped = 0;
    try {
      await update((current) => {
        const next: StudyData = { ...current, subjects: [...current.subjects], papers: [...current.papers], chapters: [...current.chapters] };
        added = 0;
        skipped = 0;
        for (const row of rows) {
          let subject = next.subjects.find((item) => item.name.toLowerCase() === row.subject.toLowerCase());
          if (!subject) {
            subject = { id: makeId(), name: row.subject, isProvisional: false, isArchived: false, targetPercent: null };
            next.subjects.push(subject);
          }
          const subjectId = subject.id;
          let paper = next.papers.find((item) => item.subjectId === subjectId && item.name.toLowerCase() === row.paper.toLowerCase());
          if (!paper) {
            paper = { id: makeId(), subjectId, name: row.paper || GENERAL_PAPER, isProvisional: false };
            next.papers.push(paper);
          }
          const paperId = paper.id;
          const exists = next.chapters.some((item) => item.subjectId === subjectId && item.title.toLowerCase() === row.chapter.toLowerCase());
          if (exists) {
            skipped += 1;
            continue;
          }
          next.chapters.push({
            id: makeId(), subjectId, paperId, title: row.chapter,
            sortOrder: next.chapters.filter((item) => item.subjectId === subjectId).length,
            status: 'not-started', confidence: null, isOptional: false, isExcluded: false, isArchived: false,
            isProvisional: true, source: `Imported from ${fileName}`, syllabusVersion: '', lastVerifiedAt: null,
            readAt: null, readDifficulty: null, notes: '',
          });
          added += 1;
        }
        return next;
      });
      toast({ title: 'Syllabus imported', description: `${added} chapter${added === 1 ? '' : 's'} added${skipped ? `, ${skipped} already existed` : ''}.` });
      setOpen(false);
      setResult(null);
    } catch (error) {
      toast({ title: 'Import failed', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };
  const subjectCount = result ? new Set(result.rows.map((row) => row.subject.toLowerCase())).size : 0;
  return <>
    <Button variant="outline" onClick={() => setOpen(true)} data-testid="button-import-syllabus"><ArrowDownToLine /> Import</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import syllabus</DialogTitle>
          <DialogDescription>Upload a CSV or TXT file with one chapter per line: subject, paper, chapter. Existing chapters with the same name are skipped.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => void readFile(event.target.files?.[0])} data-testid="input-syllabus-file" />
          <Button variant="ghost" size="sm" onClick={downloadTemplate}>Download a template</Button>
          {result && result.errors.length > 0 && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"><p className="font-medium">Some lines need fixing</p><ul className="mt-2 max-h-40 list-none space-y-1 overflow-y-auto text-xs">{result.errors.slice(0, 20).map((error) => <li key={error}>{error}</li>)}</ul></div>}
          {result && result.rows.length > 0 && <p className="text-sm text-muted-foreground" data-testid="text-import-preview"><span className="font-medium text-foreground">{result.rows.length} chapters</span> in {subjectCount} subject{subjectCount === 1 ? '' : 's'} from {fileName}.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void importRows()} disabled={!result?.rows.length || saving} data-testid="button-confirm-import">{saving ? 'Importing…' : `Import ${result?.rows.length ?? 0} chapters`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function StudyCharts({ data }: { data: StudyData }) {
  const today = todayISO();
  const days = Array.from({ length: 14 }, (_, index) => addDhakaDays(today, index - 13));
  const dailyMinutes = days.map((day) => ({
    day: day.slice(5),
    minutes: data.sessions.filter((session) => dateInDhaka(session.startedAt) === day).reduce((sum, session) => sum + session.durationMinutes, 0),
  }));
  const bySubject = data.subjects.filter((subject) => !subject.isArchived).map((subject) => {
    const included = data.chapters.filter((chapter) => chapter.subjectId === subject.id && !chapter.isOptional && !chapter.isExcluded && !chapter.isArchived);
    return { subject: subject.name, total: included.length, complete: included.filter((chapter) => chapter.status === 'complete').length };
  }).filter((row) => row.total > 0);
  return <div className="mt-6 grid gap-5 lg:grid-cols-2">
    <Card><CardHeader><CardTitle>Study minutes</CardTitle><CardDescription>Last 14 days, from sessions you logged or timed.</CardDescription></CardHeader><CardContent>
      <div className="h-56 w-full text-primary" data-testid="chart-study-minutes"><ResponsiveContainer width="100%" height="100%"><BarChart data={dailyMinutes} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="day" tick={{ fontSize: 11 }} interval={1} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} /><Tooltip /><Bar dataKey="minutes" name="Minutes" fill="currentColor" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Chapters by subject</CardTitle><CardDescription>Included chapters, and how many are complete.</CardDescription></CardHeader><CardContent>
      {bySubject.length ? <div className="h-56 w-full text-primary" data-testid="chart-chapters-by-subject"><ResponsiveContainer width="100%" height="100%"><BarChart data={bySubject} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="subject" tick={{ fontSize: 11 }} interval={0} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="total" name="Included" fill="currentColor" fillOpacity={0.25} radius={[4, 4, 0, 0]} /><Bar dataKey="complete" name="Complete" fill="currentColor" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Add chapters to see this chart.</p>}
    </CardContent></Card>
  </div>;
}

function SyllabusPage() {
  const { data } = useStudy();
  if (!data) return <PageContent><div /></PageContent>;
  const edit = (kind: EntityKind, record?: EntityRecord) => window.dispatchEvent(new CustomEvent('open-editor', { detail: { kind, record } }));
  const deleteRecord = (kind: EntityKind, record: EntityRecord) => window.dispatchEvent(new CustomEvent('request-delete', { detail: { kind, record } }));
  const includedChapters = countableChapters(data);
  const totalComplete = includedChapters.filter((chapter) => chapter.status === 'complete').length;
  return <PageContent>
    <PageHeading title="Syllabus" description="Your own outline of subjects, papers, and chapters." action={<div className="flex flex-wrap gap-2"><SyllabusImportButton /><Button onClick={() => edit('subjects')} data-testid="button-add-subject"><Plus /> Add subject</Button></div>} />
    {data.subjects.some((subject) => subject.isProvisional) && <div className="mb-5 flex gap-3 rounded-lg border border-secondary bg-secondary/50 p-4 text-sm"><CircleHelp className="mt-0.5 size-4 shrink-0 text-primary" /><p><strong>Suggested subjects are provisional.</strong> They are editable suggestions only—not an official subject list. Add, rename, or delete any subject.</p></div>}
    <p className="mb-5 text-sm text-muted-foreground"><span className="font-medium text-foreground">{data.subjects.length}</span> subjects · <span className="font-medium text-foreground">{totalComplete} / {includedChapters.length}</span> included chapters complete{includedChapters.length ? ` · ${Math.round(totalComplete / includedChapters.length * 100)}%` : ''}</p>
    {data.subjects.length === 0 ? <EmptyBlock icon={<BookOpen />} title="Start with your subjects" description="Create a subject, then add papers and chapters using the outline you trust." action={<Button onClick={() => edit('subjects')}><Plus /> Add your first subject</Button>} /> : <div className="space-y-4">{data.subjects.map((subject) => {
      const papers = data.papers.filter((paper) => paper.subjectId === subject.id);
      const chapters = data.chapters.filter((chapter) => chapter.subjectId === subject.id);
      const included = subject.isArchived ? [] : chapters.filter((chapter) => !chapter.isOptional && !chapter.isExcluded && !chapter.isArchived);
      const done = included.filter((chapter) => chapter.status === 'complete').length;
      return <Card key={subject.id} data-testid={`card-subject-${subject.id}`}><CardHeader className="flex-row items-start justify-between space-y-0"><div><div className="flex flex-wrap items-center gap-2"><CardTitle>{subject.name}</CardTitle>{subject.isProvisional && <Badge variant="outline">Provisional suggestion</Badge>}{subject.isArchived && <Badge variant="secondary">Archived · edit to restore</Badge>}</div><CardDescription className="mt-2">{chapters.length ? `${done} of ${included.length} included chapters complete` : 'No chapters added yet'}{subject.targetPercent != null ? ` · personal target ${subject.targetPercent}%` : ''}</CardDescription></div><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => edit('papers', { subjectId: subject.id } as unknown as EntityRecord)} data-testid={`button-add-paper-${subject.id}`}><Plus /> Paper</Button><Button size="sm" variant="outline" onClick={() => edit('chapters', { subjectId: subject.id } as unknown as EntityRecord)} data-testid={`button-add-chapter-${subject.id}`}><Plus /> Chapter</Button><Button size="icon" variant="ghost" aria-label="Edit subject" onClick={() => edit('subjects', subject as unknown as EntityRecord)} data-testid={`button-edit-subject-${subject.id}`}><Pencil /></Button><Button size="icon" variant="ghost" aria-label="Delete subject" onClick={() => deleteRecord('subjects', subject as unknown as EntityRecord)} data-testid={`button-delete-subject-${subject.id}`}><Trash2 /></Button></div></CardHeader>
         <CardContent>{chapters.length ? <div className="space-y-2">{chapters.map((chapter) => {
          const paper = papers.find((item) => item.id === chapter.paperId);
           return <div key={chapter.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3" data-testid={`row-chapter-${chapter.id}`}><div className="min-w-0 flex-1"><p className="font-medium">{chapter.title}</p><p className="text-xs text-muted-foreground">{paper?.name ?? 'No paper assigned'}{chapter.source ? ` · ${chapter.source}` : ''}{chapter.syllabusVersion ? ` · ${chapter.syllabusVersion}` : ''}{chapter.lastVerifiedAt ? ` · checked ${prettyDate(chapter.lastVerifiedAt)}` : ''}{chapter.notes && ` · ${chapter.notes}`}</p></div><MarkReadControl chapter={chapter} /><Badge variant={chapter.status === 'complete' ? 'default' : 'secondary'}>{titleCase(chapter.status)}</Badge>{chapter.isOptional && <Badge variant="outline">Optional</Badge>}{chapter.isExcluded && <Badge variant="outline">Excluded from progress</Badge>}{chapter.isArchived && <Badge variant="secondary">Archived · edit to restore</Badge>}<Badge variant="outline">{chapter.confidence == null ? 'Confidence not rated' : `Confidence ${chapter.confidence} / 5`}</Badge><Badge variant={chapter.isProvisional ? 'secondary' : 'outline'}>{chapter.isProvisional ? 'Provisional' : 'Verified by you'}</Badge><Button size="icon" variant="ghost" aria-label="Edit chapter" onClick={() => edit('chapters', chapter as unknown as EntityRecord)} data-testid={`button-edit-chapter-${chapter.id}`}><Pencil /></Button><Button size="icon" variant="ghost" aria-label="Delete chapter" onClick={() => deleteRecord('chapters', chapter as unknown as EntityRecord)} data-testid={`button-delete-chapter-${chapter.id}`}><Trash2 /></Button></div>;
        })}</div> : <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">No chapters yet. Add only the outline details you know.</p>}
          {papers.length > 0 && <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">{papers.map((paper) => <span key={paper.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">{paper.name}{paper.isProvisional && ' · provisional'}<Button size="icon" variant="ghost" aria-label={`Edit ${paper.name}`} onClick={() => edit('papers', paper as unknown as EntityRecord)} data-testid={`button-edit-paper-${paper.id}`}><Pencil /></Button><Button size="icon" variant="ghost" aria-label={`Delete ${paper.name}`} onClick={() => deleteRecord('papers', paper as unknown as EntityRecord)} data-testid={`button-delete-paper-${paper.id}`}><X /></Button></span>)}</div>}
        </CardContent></Card>;
    })}</div>}
  </PageContent>;
}

function PlannerPage() {
  const { data, update } = useStudy();
  if (!data) return <PageContent><div /></PageContent>;
  const edit = (kind: EntityKind, record?: EntityRecord) => window.dispatchEvent(new CustomEvent('open-editor', { detail: { kind, record } }));
  const upcoming = data.tasks.filter((task) => task.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date) || priorityRank[a.priority] - priorityRank[b.priority]);
  const pastTasks = data.tasks.filter((task) => task.date < todayISO()).sort((a, b) => b.date.localeCompare(a.date) || priorityRank[a.priority] - priorityRank[b.priority]);
  const sessions = [...data.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return <PageContent><PageHeading title="Study" description="Tasks are plans. Sessions are what you actually studied." action={<div className="flex gap-2"><Button variant="outline" onClick={() => edit('sessions')} data-testid="button-add-session"><Clock3 /> Log session</Button><Button onClick={() => edit('tasks')} data-testid="button-add-task"><Plus /> Add task</Button></div>} />
    <div className="mb-5 flex flex-wrap gap-2">{[['/syllabus', 'Syllabus', BookOpen], ['/revision', 'Revision', RotateCcw], ['/exams', 'Exams', CalendarDays], ['/results', 'Results', Trophy], ['/reminders', 'Reminders', Bell]].map(([href, label, Icon]) => <Button key={href as string} variant="outline" size="sm" asChild><Link href={href as string}><Icon className="size-4" /> {label as string}</Link></Button>)}</div>
    <div className="mb-5"><StudyTimerCard data={data} updateData={update} /></div>
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><MetricCard label="Upcoming tasks" value={`${upcoming.length}`} detail="planned by you" icon={<CalendarDays />} /><MetricCard label="Logged sessions" value={`${data.sessions.length}`} detail="actual entries, not estimates" icon={<Clock3 />} /><MetricCard label="Time logged" value={minutesLabel(data.sessions.reduce((sum, item) => sum + item.durationMinutes, 0))} detail="across all recorded sessions" icon={<Activity />} /></div>
    <div className="grid gap-5 lg:grid-cols-2"><section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Upcoming tasks</h2><Button size="sm" variant="ghost" onClick={() => edit('tasks')} data-testid="button-plan-task-inline"><Plus /> Add</Button></div>
       {upcoming.length ? <div className="space-y-3">{upcoming.map((task) => { const taskDate = new Date(`${task.date}T12:00:00+06:00`); return <Card key={task.id}><CardContent className="flex items-center gap-3 p-4"><div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary"><span className="text-xs uppercase">{taskDate.toLocaleDateString(undefined, { timeZone: 'Asia/Dhaka', month: 'short' })}</span><span className="text-sm font-semibold">{taskDate.toLocaleDateString(undefined, { timeZone: 'Asia/Dhaka', day: 'numeric' })}</span></div><div className="min-w-0 flex-1"><p className="truncate font-medium">{task.title}</p><p className="text-xs text-muted-foreground">{task.kind} · {task.durationMinutes} min · {titleCase(task.priority)} priority · {task.status}</p></div><Button size="icon" variant="ghost" aria-label="Edit task" onClick={() => edit('tasks', task as unknown as EntityRecord)} data-testid={`button-edit-planner-task-${task.id}`}><Pencil /></Button><Button size="icon" variant="ghost" aria-label="Delete task" onClick={() => window.dispatchEvent(new CustomEvent('request-delete', { detail: { kind: 'tasks', record: task } }))} data-testid={`button-delete-planner-task-${task.id}`}><Trash2 /></Button></CardContent></Card>; })}</div> : <EmptyBlock icon={<CalendarDays />} title="No upcoming tasks" description="Add a dated task whenever you’re ready to make a plan." action={<Button onClick={() => edit('tasks')}><Plus /> Add task</Button>} />}
      {pastTasks.length > 0 && <div className="mt-6"><h3 className="mb-3 text-sm font-semibold text-muted-foreground">Earlier tasks</h3><div className="space-y-3">{pastTasks.map((task) => <Card key={task.id}><CardContent className="flex items-center gap-3 p-4"><div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg bg-muted text-muted-foreground"><span className="text-xs">{prettyDate(task.date)}</span></div><div className="min-w-0 flex-1"><p className="truncate font-medium">{task.title}</p><p className="text-xs text-muted-foreground">{task.kind} · {task.durationMinutes} min · {task.status}</p></div><Button size="icon" variant="ghost" aria-label="Edit task" onClick={() => edit('tasks', task as unknown as EntityRecord)} data-testid={`button-edit-past-task-${task.id}`}><Pencil /></Button><Button size="icon" variant="ghost" aria-label="Delete task" onClick={() => window.dispatchEvent(new CustomEvent('request-delete', { detail: { kind: 'tasks', record: task } }))} data-testid={`button-delete-past-task-${task.id}`}><Trash2 /></Button></CardContent></Card>)}</div></div>}
    </section><section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Study sessions</h2><Button size="sm" variant="ghost" onClick={() => edit('sessions')} data-testid="button-log-session-inline"><Plus /> Log</Button></div>
      {sessions.length ? <div className="space-y-3">{sessions.map((session) => <Card key={session.id}><CardContent className="flex items-center gap-3 p-4"><span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary"><Clock3 /></span><div className="min-w-0 flex-1"><p className="font-medium">{session.subjectId ? data.subjects.find((s) => s.id === session.subjectId)?.name ?? 'Subject removed' : 'General study'} · {session.durationMinutes} min</p><p className="text-xs text-muted-foreground">{prettyDate(session.startedAt)}{session.notes ? ` · ${session.notes}` : ''}</p></div><Button size="icon" variant="ghost" aria-label="Edit session" onClick={() => edit('sessions', session as unknown as EntityRecord)} data-testid={`button-edit-session-${session.id}`}><Pencil /></Button><Button size="icon" variant="ghost" aria-label="Delete session" onClick={() => window.dispatchEvent(new CustomEvent('request-delete', { detail: { kind: 'sessions', record: session } }))} data-testid={`button-delete-session-${session.id}`}><Trash2 /></Button></CardContent></Card>)}</div> : <EmptyBlock icon={<Clock3 />} title="No study sessions logged" description="Record a session when you’ve studied. No activity is inferred or prefilled." action={<Button onClick={() => edit('sessions')}><Plus /> Log a session</Button>} />}
    </section></div>
  </PageContent>;
}

function AnalyticsPage() {
  const { data } = useStudy();
  if (!data) return <PageContent><div /></PageContent>;
  const practiceCount = data.practices.reduce((sum, item) => sum + item.questionCount, 0);
  const correctCount = data.practices.reduce((sum, item) => sum + item.correctCount, 0);
  const accuracy = practiceCount ? Math.round(correctCount / practiceCount * 100) : null;
  const practiceConfidence = data.practices.length ? (data.practices.reduce((sum, item) => sum + item.confidence, 0) / data.practices.length).toFixed(1) : null;
  const activeChapterIds = new Set(countableChapters(data).map((chapter) => chapter.id));
  const ratedChapters = data.chapters.filter((chapter) => activeChapterIds.has(chapter.id) && chapter.confidence != null);
  const chapterConfidence = ratedChapters.length
    ? (ratedChapters.reduce((sum, chapter) => sum + (chapter.confidence ?? 0), 0) / ratedChapters.length).toFixed(1)
    : null;
  const includedChapters = countableChapters(data);
  const chapterCount = includedChapters.length;
  const completed = includedChapters.filter((item) => item.status === 'complete').length;
  const coverage = chapterCount ? Math.round(completed / chapterCount * 100) : null;
  const chapterPractice = data.chapters.filter((chapter) => activeChapterIds.has(chapter.id)).map((chapter) => {
    const records = data.practices.filter((practice) => practice.chapterId === chapter.id);
    const questions = records.reduce((sum, practice) => sum + practice.questionCount, 0);
    const correct = records.reduce((sum, practice) => sum + practice.correctCount, 0);
    return { chapter, questions, correct, rate: questions ? Math.round(correct / questions * 100) : null };
  }).filter((item): item is typeof item & { rate: number } => item.rate !== null).sort((a, b) => a.rate - b.rate);
  const revisionReviewed = data.revisions.filter((item) => item.status === 'reviewed').length;
  const resultCount = data.results.length;
  const totalScore = data.results.reduce((sum, item) => sum + item.score, 0);
  const totalMax = data.results.reduce((sum, item) => sum + item.maxScore, 0);
  const resultPercent = totalMax ? Math.round(totalScore / totalMax * 100) : null;
  const recentResults = [...data.results].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const subjectTargets = data.subjects
    .filter((subject) => !subject.isArchived && subject.targetPercent != null)
    .map((subject) => {
      const records = data.results.filter((result) => result.subjectId === subject.id);
      const score = records.reduce((sum, result) => sum + result.score, 0);
      const maximum = records.reduce((sum, result) => sum + result.maxScore, 0);
      return {
        subject,
        actual: maximum ? Math.round(score / maximum * 100) : null,
        recordCount: records.length,
      };
    });
  const empty = !data.practices.length && !data.chapters.length && !data.revisions.length && !data.results.length && !data.sessions.length;
  const editPractice = (record?: EntityRecord) => window.dispatchEvent(new CustomEvent('open-editor', { detail: { kind: 'practices', record } }));
  return <PageContent><PageHeading title="Analytics" description="Calculated only from records you entered." action={<Button onClick={() => editPractice()} data-testid="button-add-practice"><Plus /> Log practice</Button>} />
    {empty && <div className="mb-5"><EmptyBlock icon={<ChartNoAxesCombined />} title="Your analytics start with your records" description="Add chapters, practice sessions, revision items, exam results, or study sessions. Each measure will appear separately." /></div>}
    <h2 className="mb-3 text-lg font-semibold">Coverage & study activity</h2>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Syllabus coverage" value={coverage === null ? '—' : `${coverage}%`} detail={chapterCount ? `${completed} of ${chapterCount} chapters marked complete` : 'No included chapters recorded'} icon={<BookOpen />} /><MetricCard label="Study logged" value={minutesLabel(data.sessions.reduce((sum, item) => sum + item.durationMinutes, 0))} detail={`${data.sessions.length} sessions logged`} icon={<Clock3 />} /><MetricCard label="Practice accuracy" value={accuracy === null ? '—' : `${accuracy}%`} detail={practiceCount ? `${correctCount} correct of ${practiceCount} questions` : data.practices.length ? 'No question counts entered' : 'No practice attempts recorded'} icon={<Check />} /><MetricCard label="Chapter confidence" value={chapterConfidence === null ? '—' : `${chapterConfidence} / 5`} detail={ratedChapters.length ? `self-rated across ${ratedChapters.length} chapters` : 'No chapter ratings recorded'} icon={<Activity />} /><MetricCard label="Practice self-rating" value={practiceConfidence === null ? '—' : `${practiceConfidence} / 5`} detail={data.practices.length ? `from ${data.practices.length} practice records` : 'No practice ratings recorded'} icon={<Activity />} /></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><MetricCard label="Revision reviewed" value={data.revisions.length ? `${revisionReviewed} / ${data.revisions.length}` : '—'} detail={data.revisions.length ? 'revision records marked reviewed' : 'No revision items recorded'} icon={<RotateCcw />} /><MetricCard label="Exam results" value={resultPercent === null ? '—' : `${resultPercent}%`} detail={resultCount ? `combined score from ${resultCount} results (${totalScore} / ${totalMax})` : 'No exam results recorded'} icon={<Trophy />} /><MetricCard label="Practice records" value={`${data.practices.length}`} detail={`${practiceCount} total questions attempted`} icon={<FileText />} /></div>
    <StudyCharts data={data} />
    <div className="mt-6 flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Practice log</h2><p className="text-sm text-muted-foreground">Accuracy and confidence are recorded independently for each attempt.</p></div><Button size="sm" variant="outline" onClick={() => editPractice()} data-testid="button-add-practice-inline"><Plus /> Add</Button></div>
    {data.practices.length === 0 ? <div className="mt-3"><EmptyBlock icon={<FileText />} title="No practice records" description="Record question counts and a separate confidence rating to start a meaningful practice summary." action={<Button onClick={() => editPractice()}><Plus /> Log practice</Button>} /></div> : <div className="mt-3 space-y-3">{[...data.practices].sort((a, b) => b.date.localeCompare(a.date)).map((practice) => {
      const subject = data.subjects.find((item) => item.id === practice.subjectId);
      const chapter = practice.chapterId ? data.chapters.find((item) => item.id === practice.chapterId) : null;
      const record = practice as unknown as EntityRecord;
      const percentage = practice.questionCount ? Math.round(practice.correctCount / practice.questionCount * 100) : null;
      return <Card key={practice.id} data-testid={`card-practice-${practice.id}`}><CardContent className="flex flex-wrap items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="font-medium">{subject?.name ?? 'Subject removed'}{chapter ? ` · ${chapter.title}` : ''}</p><p className="mt-1 text-xs text-muted-foreground">{prettyDate(practice.date)} · {practice.correctCount} / {practice.questionCount} correct{practice.durationMinutes ? ` · ${practice.durationMinutes} min` : ''}</p></div><Badge variant="outline">{percentage === null ? 'Accuracy unavailable' : `${percentage}% accuracy`}</Badge><Badge variant="secondary">Confidence {practice.confidence} / 5</Badge><Button size="icon" variant="ghost" aria-label="Edit practice record" onClick={() => editPractice(record)} data-testid={`button-edit-practice-${practice.id}`}><Pencil /></Button><Button size="icon" variant="ghost" aria-label="Delete practice record" onClick={() => window.dispatchEvent(new CustomEvent('request-delete', { detail: { kind: 'practices', record } }))} data-testid={`button-delete-practice-${practice.id}`}><Trash2 /></Button></CardContent></Card>;
    })}</div>}
    <div className="mt-6 grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Chapter practice overview</CardTitle><CardDescription>Only practice records linked to a chapter are compared. Lowest recorded accuracy appears first.</CardDescription></CardHeader><CardContent>{chapterPractice.length ? <div className="space-y-4">{chapterPractice.slice(0, 6).map(({ chapter, questions, correct, rate }) => <div key={chapter.id} data-testid={`chapter-practice-${chapter.id}`}><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium">{chapter.title}</span><span className="shrink-0 text-muted-foreground">{rate}%</span></div><Progress value={rate} /><p className="mt-1 text-xs text-muted-foreground">{correct} of {questions} questions correct · {chapter.confidence == null ? 'confidence not rated' : `confidence ${chapter.confidence}/5`}</p></div>)}</div> : <p className="text-sm text-muted-foreground">Link practice records to chapters to see chapter-level results. Subject-wide scores do not identify weak chapters.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Recent results</CardTitle><CardDescription>Scores and dates you entered; no target or trend is inferred.</CardDescription></CardHeader><CardContent>{recentResults.length ? <div className="space-y-3">{recentResults.map((result) => { const subject = result.subjectId ? data.subjects.find((item) => item.id === result.subjectId)?.name : null; return <div key={result.id} className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-medium">{result.title}</p><p className="text-xs text-muted-foreground">{prettyDate(result.date)}{subject ? ` · ${subject}` : ''}</p></div><Badge variant="outline">{result.score} / {result.maxScore} · {Math.round(result.score / result.maxScore * 100)}%</Badge></div>; })}</div> : <p className="text-sm text-muted-foreground">Add your first result to start a score history.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Personal score targets</CardTitle><CardDescription>Set a target on a subject; actual percentages use only results you entered for that subject.</CardDescription></CardHeader><CardContent>{subjectTargets.length ? <div className="space-y-4">{subjectTargets.map(({ subject, actual, recordCount }) => <div key={subject.id}><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium">{subject.name}</span><span className="shrink-0 text-muted-foreground">Target {subject.targetPercent}%</span></div>{actual === null ? <p className="text-xs text-muted-foreground">No results recorded yet.</p> : <><Progress value={actual} /><p className="mt-1 text-xs text-muted-foreground">Actual {actual}% across {recordCount} result{recordCount === 1 ? '' : 's'}{actual >= (subject.targetPercent ?? 0) ? ' · target reached' : ` · ${(subject.targetPercent ?? 0) - actual} points below target`}</p></>}</div>)}</div> : <p className="text-sm text-muted-foreground">Add a personal target when editing a subject to compare it with your recorded results.</p>}</CardContent></Card>
    </div>
  </PageContent>;
}

function MorePage() {
  return <PageContent><PageHeading title="More" description="Keep the rest of your study records and preferences close at hand." /><div className="grid gap-3 sm:grid-cols-2">{MORE_ITEMS.map(({ href, label, detail, icon: Icon }) => <Link key={href} href={href} className="no-underline" data-testid={`link-more-${label.toLowerCase().replaceAll(' ', '-')}`}><Card className="h-full transition-colors hover:bg-muted/40"><CardContent className="flex items-center gap-4 p-5"><span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span><span className="min-w-0 flex-1"><span className="block font-semibold text-foreground">{label}</span><span className="mt-1 block text-sm text-muted-foreground">{detail}</span></span><ChevronRight className="size-4 text-muted-foreground" /></CardContent></Card></Link>)}</div><div className="mt-5 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground"><ShieldCheck className="mr-2 inline size-4 text-primary" />Study data stays in this browser. The app uses the network only to load or update its public files; there is no account or cloud sync.</div></PageContent>;
}

function RemindersPage() {
  const { data } = useStudy();
  if (!data) return <PageContent><div /></PageContent>;
  const today = todayISO();
  const dueTasks = data.tasks
    .filter((task) => task.date <= today && task.status !== 'done')
    .sort((a, b) => a.date.localeCompare(b.date));
  const dueRevisions = data.revisions
    .filter((item) => (item.status === 'due' || item.dueDate <= today) && item.status !== 'reviewed')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const upcomingExams = data.exams
    .filter((exam) => exam.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const hasItems = dueTasks.length + dueRevisions.length + upcomingExams.length > 0;
  return <PageContent>
    <PageHeading title="Reminders" description="Shown inside the app. Phone notifications come later." />
    {!hasItems && <div className="mb-5"><EmptyBlock icon={<Bell />} title="Nothing needs attention" description="Due tasks, reviews, and upcoming exams you enter will appear here." /></div>}
    <div className="space-y-6">
      <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Due tasks</h2><Button size="sm" variant="outline" asChild><Link href="/planner">Open planner</Link></Button></div>{dueTasks.length ? <div className="space-y-2">{dueTasks.map((task) => <RecordCard key={task.id} title={task.title} detail={`${task.date < today ? `Overdue since ${prettyDate(task.date)}` : 'Due today'} · ${task.durationMinutes} min`} badge="Task" onEdit={() => window.dispatchEvent(new CustomEvent('open-editor', { detail: { kind: 'tasks', record: task } }))} kind="tasks" record={task as unknown as EntityRecord} />)}</div> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No unfinished tasks are due.</p>}</section>
      <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Due revisions</h2><Button size="sm" variant="outline" asChild><Link href="/revision">Open revision queue</Link></Button></div>{dueRevisions.length ? <div className="space-y-2">{dueRevisions.map((item) => <RecordCard key={item.id} title={item.title} detail={`${item.dueDate < today ? `Overdue since ${prettyDate(item.dueDate)}` : item.dueDate === today ? 'Due today' : 'Marked due'} · ${item.intervalDays}-day interval`} badge="Review" onEdit={() => window.dispatchEvent(new CustomEvent('open-editor', { detail: { kind: 'revisions', record: item } }))} kind="revisions" record={item as unknown as EntityRecord} />)}</div> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No revisions are due.</p>}</section>
      <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Upcoming exams</h2><Button size="sm" variant="outline" asChild><Link href="/exams">Open exams</Link></Button></div>{upcomingExams.length ? <div className="space-y-2">{upcomingExams.map((exam) => { const days = countdownDays(exam.date); return <RecordCard key={exam.id} title={exam.title} detail={`${examTypeLabels[exam.examType]} · ${prettyDate(exam.date)}${exam.startTime ? ` · ${exam.startTime}` : ''} · ${exam.dateStatus === 'confirmed' ? 'confirmed by you' : 'provisional — verify this date'}`} badge={days === 0 ? 'Today' : `${days} days`} onEdit={() => window.dispatchEvent(new CustomEvent('open-editor', { detail: { kind: 'exams', record: exam } }))} kind="exams" record={exam as unknown as EntityRecord} />; })}</div> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No future exam dates entered.</p>}</section>
    </div>
  </PageContent>;
}

function ExamsPage() {
  const { data } = useStudy();
  if (!data) return <PageContent><div /></PageContent>;
  const edit = (record?: EntityRecord) => window.dispatchEvent(new CustomEvent('open-editor', { detail: { kind: 'exams', record } }));
  return <PageContent><PageHeading title="Exams" description="Add only dates you have verified yourself." action={<Button onClick={() => edit()} data-testid="button-add-exam"><Plus /> Add exam</Button>} />
     {data.exams.length === 0 ? <EmptyBlock icon={<CalendarDays />} title="No exams added" description="Add an exam when you have a date and source. Dates can be marked confirmed or provisional." action={<Button onClick={() => edit()}><Plus /> Add an exam</Button>} /> : <div className="space-y-3">{data.exams.slice().sort((a, b) => a.date.localeCompare(b.date)).map((exam) => { const days = countdownDays(exam.date); const countdown = days < 0 ? `${Math.abs(days)} days ago` : days === 0 ? 'Today' : `${days} days left`; return <RecordCard key={exam.id} title={exam.title} detail={`${countdown} · ${examTypeLabels[exam.examType]} · ${prettyDate(exam.date)}${exam.startTime ? ` · ${exam.startTime}` : ''}${exam.venue ? ` · ${exam.venue}` : ''} · ${exam.subjectId ? data.subjects.find((s) => s.id === exam.subjectId)?.name ?? 'Subject removed' : 'All subjects'}${exam.source ? ` · ${exam.source}` : ''}`} badge={exam.dateStatus === 'confirmed' ? 'Confirmed by you' : 'Provisional date'} onEdit={() => edit(exam as unknown as EntityRecord)} kind="exams" record={exam as unknown as EntityRecord} />; })}</div>}
  </PageContent>;
}

function RevisionPage() {
  const { data, update } = useStudy();
  if (!data) return <PageContent><div /></PageContent>;
  const edit = (record?: EntityRecord) => window.dispatchEvent(new CustomEvent('open-editor', { detail: { kind: 'revisions', record } }));
  const today = todayISO();
  const items = [...data.revisions].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const markReviewed = async (item: RevisionItem, result: 'hard' | 'okay' | 'easy') => {
    try {
      await update((current) => {
        const currentItem = current.revisions.find((revision) => revision.id === item.id);
        if (!currentItem || currentItem.status === 'reviewed') return current;
        const reviewed = {
          ...currentItem,
          status: 'reviewed' as const,
          lastReviewedAt: today,
          reviewResult: result,
        };
        return {
          ...current,
          revisions: current.revisions.map((revision) => revision.id === item.id ? reviewed : revision),
        };
      });
      toast({ title: 'Revision saved', description: `Recorded as ${result}.` });
    } catch (error) {
      toast({ title: 'Could not save revision', description: error instanceof Error ? error.message : 'Please try again.' });
    }
  };
  return <PageContent><PageHeading title="Revision" description="Reviews are tracked separately from coverage and accuracy." action={<Button onClick={() => edit()} data-testid="button-add-revision"><Plus /> Add revision</Button>} />
    {items.length === 0 ? <EmptyBlock icon={<RotateCcw />} title="No revision items yet" description="Schedule a review for a topic or chapter when it suits your plan." action={<Button onClick={() => edit()}><Plus /> Schedule revision</Button>} /> : <div className="space-y-3">{items.map((item) => { const due = item.status === 'due' || (item.dueDate <= today && item.status !== 'reviewed'); const subject = item.subjectId ? data.subjects.find((s) => s.id === item.subjectId)?.name : null; const chapter = item.chapterId ? data.chapters.find((c) => c.id === item.chapterId)?.title : null; return <Card key={item.id}><CardContent className="flex flex-wrap items-center gap-3 p-4"><span className={cn('flex size-10 items-center justify-center rounded-lg', due ? 'bg-secondary text-primary' : 'bg-muted text-muted-foreground')}><RotateCcw /></span><div className="min-w-0 flex-1"><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.status === 'reviewed' && item.lastReviewedAt ? `Reviewed ${prettyDate(item.lastReviewedAt)} · ` : ''}{prettyDate(item.dueDate)} · every {item.intervalDays} days{subject ? ` · ${subject}` : ''}{chapter ? ` / ${chapter}` : ''}</p></div><Badge variant={item.status === 'reviewed' ? 'default' : due ? 'secondary' : 'outline'}>{item.status === 'reviewed' ? `Reviewed${item.reviewResult ? ` · ${titleCase(item.reviewResult)}` : ''}` : due ? 'Due' : 'Scheduled'}</Badge>{item.status !== 'reviewed' && due && <div className="flex flex-wrap gap-1" role="group" aria-label={`Record the result for ${item.title}`}><Button size="sm" variant="outline" onClick={() => void markReviewed(item, 'hard')} data-testid={`button-review-hard-${item.id}`}>Hard</Button><Button size="sm" variant="outline" onClick={() => void markReviewed(item, 'okay')} data-testid={`button-review-okay-${item.id}`}>Okay</Button><Button size="sm" variant="outline" onClick={() => void markReviewed(item, 'easy')} data-testid={`button-review-easy-${item.id}`}>Easy</Button></div>}<Button size="icon" variant="ghost" aria-label="Edit revision" onClick={() => edit(item as unknown as EntityRecord)} data-testid={`button-edit-revision-${item.id}`}><Pencil /></Button><Button size="icon" variant="ghost" aria-label="Delete revision" onClick={() => window.dispatchEvent(new CustomEvent('request-delete', { detail: { kind: 'revisions', record: item } }))} data-testid={`button-delete-revision-${item.id}`}><Trash2 /></Button></CardContent></Card>; })}</div>}
  </PageContent>;
}

function ResultsPage() {
  const { data } = useStudy();
  if (!data) return <PageContent><div /></PageContent>;
  const edit = (record?: EntityRecord) => window.dispatchEvent(new CustomEvent('open-editor', { detail: { kind: 'results', record } }));
  return <PageContent><PageHeading title="Results" description="Scores you enter. They don’t change accuracy or coverage." action={<Button onClick={() => edit()} data-testid="button-add-result"><Plus /> Add result</Button>} />
    {data.results.length === 0 ? <EmptyBlock icon={<Trophy />} title="No results recorded" description="Add a score after you receive it. Results are never prefilled or estimated." action={<Button onClick={() => edit()}><Plus /> Record a result</Button>} /> : <div className="space-y-3">{[...data.results].sort((a, b) => b.date.localeCompare(a.date)).map((result) => { const exam = result.examId ? data.exams.find((e) => e.id === result.examId) : null; const subject = result.subjectId ? data.subjects.find((s) => s.id === result.subjectId) : null; return <RecordCard key={result.id} title={result.title} detail={`${prettyDate(result.date)} · ${subject?.name ?? 'No subject'}${exam ? ` · ${exam.title}` : ''}`} badge={`${result.score} / ${result.maxScore} · ${Math.round(result.score / result.maxScore * 100)}%`} onEdit={() => edit(result as unknown as EntityRecord)} kind="results" record={result as unknown as EntityRecord} />; })}</div>}
  </PageContent>;
}

function SettingsPage() {
  const { data, reload } = useStudy();
  const [target, setTarget] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmExport, setConfirmExport] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState<StudyData | null>(null);
  const [restoreName, setRestoreName] = useState('');
  const [fileError, setFileError] = useState('');
  if (!data) return <PageContent><div /></PageContent>;
  const dailyTarget = target === null ? String(data.settings.dailyTargetMinutes) : target;
  const exportNow = () => {
    try {
      downloadBackup(data);
      setConfirmExport(false);
      toast({ title: 'Backup downloaded', description: 'Keep this file somewhere private; it contains your study records.' });
    } catch (error) {
      toast({ title: 'Could not export backup', description: error instanceof Error ? error.message : 'Please try again.' });
    }
  };
  const saveSettings = async (next: Partial<StudyData['settings']>) => {
    try {
      const updated = await updateStudyData((current) => ({ ...current, settings: { ...current.settings, ...next } }));
      void reload();
      setTarget(String(updated.settings.dailyTargetMinutes));
      toast({ title: 'Settings saved', description: 'Updated in this browser.' });
    } catch (error) { toast({ title: 'Could not save settings', description: error instanceof Error ? error.message : 'Please try again.' }); }
  };
  const handleRestoreFile = async (file?: File) => {
    setFileError('');
    setRestoreCandidate(null);
    if (!file) return;
    try {
      const parsed = parseBackupJson(await file.text());
      setRestoreCandidate(parsed);
      setRestoreName(file.name);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'This backup could not be validated.');
    }
  };
  const doRestore = async () => {
    if (!restoreCandidate) return;
    try {
      await replaceStudyData(restoreCandidate);
      await reload();
      setRestoreCandidate(null);
      toast({ title: 'Backup restored', description: 'Your local study data was replaced.' });
    } catch (error) { toast({ title: 'Restore failed', description: error instanceof Error ? error.message : 'Please try again.' }); }
  };
  return <PageContent><PageHeading title="Settings" description="Your data stays in this browser. Export a backup to keep a copy." />
    <div className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle>Study preferences</CardTitle><CardDescription>Small preferences for your local planning space.</CardDescription></CardHeader><CardContent className="space-y-5">
      <div><Label htmlFor="daily-target">Daily study target (minutes)</Label><div className="mt-2 flex gap-2"><Input id="daily-target" type="number" min="0" max="1440" value={dailyTarget} onChange={(event) => setTarget(event.target.value)} data-testid="input-daily-target" /><Button variant="outline" onClick={() => void saveSettings({ dailyTargetMinutes: Math.min(1440, Math.max(0, Number(dailyTarget) || 0)) })} data-testid="button-save-target">Save</Button></div><p className="mt-2 text-xs text-muted-foreground">This goal is only a reference for your daily plan.</p></div>
      <div><Label htmlFor="theme-setting">Theme preference</Label><Select value={data.settings.theme} onValueChange={(value: 'system' | 'light' | 'dark') => void saveSettings({ theme: value })}><SelectTrigger id="theme-setting" className="mt-2" data-testid="select-theme"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="system">System</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent></Select></div>
      
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Backup & restore</CardTitle><CardDescription>Export a copy or validate a file before replacing local data.</CardDescription></CardHeader><CardContent className="space-y-4">
       <Button className="w-full" variant="outline" onClick={() => setConfirmExport(true)} data-testid="button-export-backup"><ArrowDownToLine /> Export backup</Button>
      <div className="rounded-lg border border-dashed p-4"><Label htmlFor="restore-file">Choose a backup file</Label><Input id="restore-file" className="mt-2" type="file" accept="application/json,.json" onChange={(event) => void handleRestoreFile(event.currentTarget.files?.[0])} data-testid="input-restore-file" /><p className="mt-2 text-xs text-muted-foreground">A valid backup will be checked using the provided validator. Restoring replaces all current records.</p>{fileError && <p className="mt-2 text-sm text-destructive" role="alert" data-testid="text-restore-error">{fileError}</p>}</div>
      <Button variant="destructive" className="w-full" onClick={() => setConfirmReset(true)} data-testid="button-reset-data"><Trash2 /> Reset all local data</Button>
    </CardContent></Card></div>
     <AlertDialog open={confirmExport} onOpenChange={setConfirmExport}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Download a private copy?</AlertDialogTitle><AlertDialogDescription>This JSON file contains your study records and notes. It will download to this device; do not upload it to the public website repository. A running timer is paused in the backup copy only.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={exportNow}>Download backup</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
     <ConfirmDialog open={confirmReset} title="Reset all local study data?" description="This permanently replaces your current records with a clean starting state. Export a backup first if you may want these records later." onCancel={() => setConfirmReset(false)} onConfirm={() => { void resetStudyData().then(async () => { await reload(); toast({ title: 'Local data reset', description: 'Your study space is ready for a fresh start.' }); }).catch((error) => toast({ title: 'Reset failed', description: error instanceof Error ? error.message : 'Please try again.' })); setConfirmReset(false); }} />
    <AlertDialog open={!!restoreCandidate} onOpenChange={(open) => { if (!open) setRestoreCandidate(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Replace current data with this backup?</AlertDialogTitle><AlertDialogDescription>The file “{restoreName}” passed validation. Restoring replaces all current subjects, plans, and records on this device. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void doRestore()}>Replace local data</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </PageContent>;
}

function RecordCard({ title, detail, badge, onEdit, kind, record }: { title: string; detail: string; badge: string; onEdit: () => void; kind: EntityKind; record: EntityRecord }) {
  return <Card><CardContent className="flex flex-wrap items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><Badge variant="secondary">{badge}</Badge><Button size="icon" variant="ghost" aria-label="Edit record" onClick={onEdit} data-testid={`button-edit-${kind}-${record.id}`}><Pencil /></Button><Button size="icon" variant="ghost" aria-label="Delete record" onClick={() => window.dispatchEvent(new CustomEvent('request-delete', { detail: { kind, record } }))} data-testid={`button-delete-${kind}-${record.id}`}><Trash2 /></Button></CardContent></Card>;
}

function ConfirmDialog({ open, title, description, onCancel, onConfirm }: { open: boolean; title: string; description: string; onCancel: () => void; onConfirm: () => void }) {
  return <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel><AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

const FIELD_DEFS: Record<EntityKind, Field[]> = {
  subjects: [{ key: 'name', label: 'Subject name', required: true }, { key: 'targetPercent', label: 'Personal score target (%)', type: 'number', min: 0, max: 100, step: 'any', hint: 'Optional and chosen by you; it is not an official requirement.' }, { key: 'isArchived', label: 'Archive this subject', type: 'select', options: [{ value: 'false', label: 'No — keep active' }, { value: 'true', label: 'Yes — archive' }] }, { key: 'isProvisional', label: 'Status', type: 'select', options: [{ value: 'true', label: 'Provisional suggestion' }, { value: 'false', label: 'My own subject' }] }],
  papers: [{ key: 'subjectId', label: 'Subject', type: 'select', required: true }, { key: 'name', label: 'Paper name', required: true }, { key: 'isProvisional', label: 'Status', type: 'select', options: [{ value: 'true', label: 'Provisional' }, { value: 'false', label: 'My own paper' }] }],
  chapters: [{ key: 'subjectId', label: 'Subject', type: 'select', required: true }, { key: 'paperId', label: 'Paper', type: 'select' }, { key: 'title', label: 'Chapter title', required: true }, { key: 'status', label: 'Coverage status', type: 'select', options: [{ value: 'not-started', label: 'Not started' }, { value: 'in-progress', label: 'In progress' }, { value: 'complete', label: 'Complete' }] }, { key: 'confidence', label: 'Current confidence (1–5)', type: 'number', min: 1, max: 5, hint: 'Optional; this rating is independent of coverage and practice.' }, { key: 'isOptional', label: 'Optional topic', type: 'select', options: [{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }] }, { key: 'isExcluded', label: 'Exclude from progress', type: 'select', options: [{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }] }, { key: 'isArchived', label: 'Archive chapter', type: 'select', options: [{ value: 'false', label: 'No — keep active' }, { value: 'true', label: 'Yes — archive' }] }, { key: 'isProvisional', label: 'Syllabus status', type: 'select', options: [{ value: 'true', label: 'Provisional' }, { value: 'false', label: 'Verified by me' }] }, { key: 'source', label: 'Source used', hint: 'Add the book, curriculum, or notice you checked.' }, { key: 'syllabusVersion', label: 'Syllabus version' }, { key: 'lastVerifiedAt', label: 'Last verified date', type: 'date' }, { key: 'notes', label: 'Notes', type: 'textarea' }],
  tasks: [{ key: 'title', label: 'Task', required: true }, { key: 'date', label: 'Date', type: 'date', required: true }, { key: 'kind', label: 'Task type', type: 'select', options: [{ value: 'study', label: 'Study' }, { value: 'practice', label: 'Practice' }, { value: 'revision', label: 'Revision' }] }, { key: 'durationMinutes', label: 'Planned minutes', type: 'number', min: 0, max: 1440 }, { key: 'priority', label: 'Priority', type: 'select', options: [{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }] }, { key: 'subjectId', label: 'Subject', type: 'select' }, { key: 'chapterId', label: 'Chapter', type: 'select' }, { key: 'status', label: 'Status', type: 'select', options: [{ value: 'planned', label: 'Planned' }, { value: 'done', label: 'Done' }] }, { key: 'notes', label: 'Notes', type: 'textarea' }],
  sessions: [{ key: 'subjectId', label: 'Subject', type: 'select' }, { key: 'chapterId', label: 'Chapter', type: 'select' }, { key: 'startedAt', label: 'Session date', type: 'date', required: true, hint: 'Sessions are recorded at noon local time on the selected date.' }, { key: 'durationMinutes', label: 'Duration in minutes', type: 'number', min: 1, max: 1440, required: true }, { key: 'notes', label: 'Notes', type: 'textarea' }],
  practices: [{ key: 'date', label: 'Date', type: 'date', required: true }, { key: 'subjectId', label: 'Subject', type: 'select', required: true }, { key: 'chapterId', label: 'Chapter', type: 'select' }, { key: 'questionCount', label: 'Questions attempted', type: 'number', min: 0, required: true }, { key: 'correctCount', label: 'Correct answers', type: 'number', min: 0, required: true }, { key: 'confidence', label: 'Confidence after practice (1–5)', type: 'number', min: 1, max: 5, required: true }, { key: 'durationMinutes', label: 'Minutes spent', type: 'number', min: 0 }, { key: 'notes', label: 'Notes', type: 'textarea' }],
  revisions: [{ key: 'title', label: 'Revision item', required: true }, { key: 'subjectId', label: 'Subject', type: 'select' }, { key: 'chapterId', label: 'Chapter', type: 'select' }, { key: 'dueDate', label: 'Due date', type: 'date', required: true }, { key: 'intervalDays', label: 'Review interval in days', type: 'number', min: 1, max: 365, required: true }, { key: 'status', label: 'Status', type: 'select', options: [{ value: 'scheduled', label: 'Scheduled' }, { value: 'due', label: 'Due' }, { value: 'reviewed', label: 'Reviewed' }] }],
  exams: [{ key: 'title', label: 'Exam name', required: true }, { key: 'examType', label: 'Exam type', type: 'select', options: [{ value: 'pretest', label: 'Pre-test' }, { value: 'test', label: 'Test' }, { value: 'coaching', label: 'Coaching exam' }, { value: 'weekly', label: 'Weekly test' }, { value: 'chapter', label: 'Chapter test' }, { value: 'model', label: 'Model test' }, { value: 'custom', label: 'Custom' }] }, { key: 'subjectId', label: 'Subject', type: 'select' }, { key: 'date', label: 'Date', type: 'date', required: true }, { key: 'startTime', label: 'Start time', type: 'time' }, { key: 'venue', label: 'Venue (optional)' }, { key: 'dateStatus', label: 'Date status', type: 'select', options: [{ value: 'provisional', label: 'Provisional — verify date' }, { value: 'confirmed', label: 'Confirmed by me' }] }, { key: 'source', label: 'Date source', hint: 'Enter your source; the app does not supply exam dates.' }, { key: 'notes', label: 'Notes', type: 'textarea' }],
  results: [{ key: 'title', label: 'Result name', required: true }, { key: 'examId', label: 'Exam', type: 'select' }, { key: 'subjectId', label: 'Subject', type: 'select' }, { key: 'date', label: 'Result date', type: 'date', required: true }, { key: 'score', label: 'Score', type: 'number', min: 0, step: 'any', required: true }, { key: 'maxScore', label: 'Maximum score', type: 'number', min: 0.01, step: 'any', required: true }, { key: 'notes', label: 'Notes', type: 'textarea' }],
};

function initialForm(kind: EntityKind, record?: EntityRecord, data?: StudyData): Record<string, string> {
  const fields = FIELD_DEFS[kind];
  const result: Record<string, string> = {};
  for (const field of fields) {
    const value = record?.[field.key];
    if (value !== undefined && value !== null) result[field.key] = field.key === 'startedAt' ? String(value).slice(0, 10) : String(value);
    else if (field.key === 'date' || field.key === 'dueDate') result[field.key] = todayISO();
    else if (field.key === 'startedAt') result[field.key] = todayISO();
    else if (field.key === 'status') result[field.key] = kind === 'chapters' ? 'not-started' : kind === 'tasks' ? 'planned' : 'scheduled';
    else if (field.key === 'kind') result[field.key] = 'study';
    else if (field.key === 'durationMinutes') result[field.key] = kind === 'sessions' ? '30' : '0';
    else if (field.key === 'intervalDays') result[field.key] = '1';
    else if (field.key === 'confidence') result[field.key] = '';
    else if (field.key === 'dateStatus') result[field.key] = 'provisional';
    else if (field.key === 'isProvisional') result[field.key] = 'true';
    else if (field.key === 'isOptional' || field.key === 'isExcluded' || field.key === 'isArchived') result[field.key] = 'false';
    else if (field.key === 'priority') result[field.key] = 'normal';
    else if (field.key === 'examType') result[field.key] = 'custom';
    else if (field.key === 'subjectId') result[field.key] = String((record?.subjectId as string | undefined) ?? (kind === 'subjects' ? '' : data?.subjects[0]?.id ?? ''));
    else if (field.key === 'paperId' || field.key === 'chapterId' || field.key === 'examId') result[field.key] = String((record?.[field.key] as string | undefined) ?? '');
    else result[field.key] = '';
  }
  return result;
}

function choicesFor(field: Field, kind: EntityKind, form: Record<string, string>, data: StudyData): { value: string; label: string }[] {
  if (field.options) return field.options;
  if (field.key === 'subjectId') return data.subjects.map((subject) => ({ value: subject.id, label: subject.name }));
  if (field.key === 'paperId') return data.papers.filter((paper) => !form.subjectId || paper.subjectId === form.subjectId).map((paper) => ({ value: paper.id, label: paper.name }));
  if (field.key === 'chapterId') return data.chapters.filter((chapter) => !form.subjectId || chapter.subjectId === form.subjectId).map((chapter) => ({ value: chapter.id, label: chapter.title }));
  if (field.key === 'examId') return data.exams.map((exam) => ({ value: exam.id, label: exam.title }));
  return [];
}

function formToRecord(kind: EntityKind, form: Record<string, string>, existing?: EntityRecord): EntityRecord {
  const value: Record<string, unknown> = { ...(existing ?? {}), id: existing?.id ?? makeId() };
  for (const field of FIELD_DEFS[kind]) {
    const raw = form[field.key] ?? '';
    if (['isProvisional', 'isOptional', 'isExcluded', 'isArchived'].includes(field.key)) value[field.key] = raw === 'true';
    else if (field.key === 'confidence') value[field.key] = raw ? Number(raw) : null;
    else if (field.key === 'targetPercent') value[field.key] = raw ? Number(raw) : null;
    else if (['durationMinutes', 'intervalDays', 'questionCount', 'correctCount'].includes(field.key)) value[field.key] = Number(raw || 0);
    else if (['score', 'maxScore'].includes(field.key)) value[field.key] = Number(raw || 0);
    else if (['subjectId', 'paperId', 'chapterId', 'examId', 'startTime', 'lastVerifiedAt'].includes(field.key)) value[field.key] = raw || null;
    else if (field.key === 'startedAt') value[field.key] = new Date(`${raw || todayISO()}T12:00:00+06:00`).toISOString();
    else value[field.key] = raw;
  }
  if (kind === 'sessions' && !value.subjectId) value.chapterId = null;
  if (kind === 'practices') value.durationMinutes = Number(form.durationMinutes || 0);
  if (kind === 'revisions' && !existing) value.lastReviewedAt = null;
  if (kind === 'results' && !value.examId) value.examId = null;
  if (kind === 'papers' && !existing) value.isProvisional = form.isProvisional !== 'false';
  return value as EntityRecord;
}

function GlobalOverlays() {
  const { data, save, remove } = useStudy();
  const [editor, setEditor] = useState<EditorState>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<{ kind: EntityKind; record: EntityRecord } | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: EntityKind; record?: EntityRecord }>).detail;
      setEditor({ kind: detail.kind, record: detail.record });
      setForm(initialForm(detail.kind, detail.record, data ?? undefined));
      setFormError('');
    };
    const del = (event: Event) => setDeleting((event as CustomEvent<{ kind: EntityKind; record: EntityRecord }>).detail);
    window.addEventListener('open-editor', open);
    window.addEventListener('request-delete', del);
    return () => { window.removeEventListener('open-editor', open); window.removeEventListener('request-delete', del); };
  }, [data]);
  const fields = editor ? FIELD_DEFS[editor.kind] : [];
  const title = editor ? `${editor.record ? 'Edit' : 'Add'} ${editor.kind === 'subjects' ? 'subject' : editor.kind === 'papers' ? 'paper' : editor.kind === 'chapters' ? 'chapter' : editor.kind === 'tasks' ? 'task' : editor.kind === 'sessions' ? 'study session' : editor.kind === 'practices' ? 'practice record' : editor.kind === 'revisions' ? 'revision item' : editor.kind === 'exams' ? 'exam' : 'result'}` : '';
  const deleteDescription = deleting?.kind === 'subjects'
    ? 'This deletes the subject and its papers, chapters, tasks, sessions, practice, revisions, exams, and subject results. A running timer for it is also discarded. This cannot be undone.'
    : deleting?.kind === 'chapters'
      ? 'The chapter is removed from the outline. Linked tasks, sessions, practice, and revisions remain, but lose their chapter link.'
      : deleting?.kind === 'papers'
        ? 'The paper is removed. Its chapters remain in the outline without a paper assignment.'
        : deleting?.kind === 'exams'
          ? 'The exam is removed. Any saved result remains but loses its exam link.'
          : 'This action removes the record from your local study data.';
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    setFormError('');
    if (editor.kind === 'practices' && Number(form.correctCount) > Number(form.questionCount)) { setFormError('Correct answers cannot exceed the question count.'); return; }
    if (editor.kind === 'results' && Number(form.score) > Number(form.maxScore)) { setFormError('Score cannot exceed the maximum score.'); return; }
    if (editor.kind === 'chapters' && (!form.subjectId || !form.title.trim())) { setFormError('Choose a subject and enter a chapter title.'); return; }
    if (editor.kind === 'chapters' && form.isProvisional === 'false' && (!form.source.trim() || !form.lastVerifiedAt)) { setFormError('Add the source and last-verified date before marking this chapter verified.'); return; }
    if (editor.kind === 'exams' && form.dateStatus === 'confirmed' && !form.source.trim()) { setFormError('Add the source you checked before confirming this exam date.'); return; }
    if (['papers', 'practices'].includes(editor.kind) && !form.subjectId) { setFormError('Choose a subject first.'); return; }
    if (['tasks', 'sessions', 'practices', 'revisions'].includes(editor.kind) && form.chapterId && !data?.chapters.some((item) => item.id === form.chapterId && item.subjectId === form.subjectId)) { setFormError('Choose a chapter that belongs to the selected subject.'); return; }
    if (editor.kind === 'results' && form.examId && !data?.exams.some((item) => item.id === form.examId)) { setFormError('Choose an exam that still exists.'); return; }
    const record = formToRecord(editor.kind, form, editor.record);
    if (editor.kind === 'chapters' && !editor.record) record.sortOrder = data?.chapters.filter((item) => item.subjectId === form.subjectId).length ?? 0;
    if (editor.kind === 'tasks' && !editor.record) record.status = 'planned';
    try {
      await save(editor.kind, record);
      setEditor(null);
      toast({ title: editor.record ? 'Changes saved' : 'Record added', description: 'Saved locally on this device.' });
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Could not save this record.'); }
  };
  const doDelete = async () => {
    if (!deleting) return;
    const { kind, record } = deleting;
    try {
      await remove(kind, record.id);
      setDeleting(null);
      toast({ title: 'Record deleted', description: 'Removed from local study data.' });
    } catch (error) { toast({ title: 'Could not delete record', description: error instanceof Error ? error.message : 'Please try again.' }); }
  };
  return <>
    <Dialog open={!!editor} onOpenChange={(open) => { if (!open) setEditor(null); }}>
      <DialogContent className="max-h-screen overflow-y-auto"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Saved only in this browser. Fields marked required must be completed.</DialogDescription></DialogHeader>
        {editor && <form className="space-y-4" onSubmit={(event) => void submit(event)}>{fields.map((field) => {
          const fieldId = `field-${editor.kind}-${field.key}`;
          const currentValue = form[field.key] ?? '';
          return <div key={field.key} className="space-y-1.5"><Label htmlFor={fieldId}>{field.label}{field.required ? ' *' : ''}</Label>
            {field.type === 'select' ? <Select value={currentValue || 'none'} onValueChange={(value) => setForm((old) => ({ ...old, [field.key]: value === 'none' ? '' : value }))}><SelectTrigger id={fieldId} data-testid={`select-${editor.kind}-${field.key}`}><SelectValue placeholder={`Choose ${field.label.toLowerCase()}`} /></SelectTrigger><SelectContent>{!field.required && <SelectItem value="none">None selected</SelectItem>}{choicesFor(field, editor.kind, form, data!).map((choice) => <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>)}</SelectContent></Select> :
            field.type === 'textarea' ? <Textarea id={fieldId} value={currentValue} onChange={(event) => setForm((old) => ({ ...old, [field.key]: event.target.value }))} data-testid={`textarea-${editor.kind}-${field.key}`} /> :
            <Input id={fieldId} type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text'} value={currentValue} required={field.required} min={field.min} max={field.max} step={field.step} onChange={(event) => setForm((old) => ({ ...old, [field.key]: event.target.value }))} data-testid={`input-${editor.kind}-${field.key}`} />}
            {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
          </div>;
        })}{formError && <p className="text-sm text-destructive" role="alert" data-testid="text-form-error">{formError}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setEditor(null)} data-testid="button-cancel-editor">Cancel</Button><Button type="submit" data-testid="button-save-record"><Check /> Save record</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this record?</AlertDialogTitle><AlertDialogDescription>{deleteDescription} This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setDeleting(null)}>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void doDelete()}>Delete record</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}

export default App;
