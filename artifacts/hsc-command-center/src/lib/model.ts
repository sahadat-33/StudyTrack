import { z } from 'zod';

const Id = z.string().min(1).max(100);
const DateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, 'Enter a real calendar date.');
const Note = z.string().max(2000);

export const SubjectSchema = z.object({
  id: Id,
  name: z.string().trim().min(1).max(100),
  isProvisional: z.boolean(),
  isArchived: z.boolean().default(false),
  targetPercent: z.number().min(0).max(100).nullable().default(null),
});

export const PaperSchema = z.object({
  id: Id,
  subjectId: Id,
  name: z.string().trim().min(1).max(100),
  isProvisional: z.boolean(),
});

export const ChapterSchema = z.object({
  id: Id,
  subjectId: Id,
  paperId: Id.nullable(),
  title: z.string().trim().min(1).max(160),
  sortOrder: z.number().int().min(0),
  status: z.enum(['not-started', 'in-progress', 'complete']),
  confidence: z.number().int().min(1).max(5).nullable().optional(),
  isOptional: z.boolean().default(false),
  isExcluded: z.boolean().default(false),
  isArchived: z.boolean().default(false),
  isProvisional: z.boolean().default(true),
  source: z.string().max(240).default(''),
  syllabusVersion: z.string().max(80).default(''),
  lastVerifiedAt: DateOnly.nullable().default(null),
  readAt: DateOnly.nullable().default(null),
  readDifficulty: z.enum(['hard', 'okay', 'easy']).nullable().default(null),
  notes: Note,
});

export const TaskSchema = z.object({
  id: Id,
  title: z.string().trim().min(1).max(160),
  date: DateOnly,
  kind: z.enum(['study', 'practice', 'revision']),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  durationMinutes: z.number().int().min(0).max(1440),
  subjectId: Id.nullable(),
  chapterId: Id.nullable(),
  status: z.enum(['planned', 'done']),
  notes: Note,
});

export const SessionSchema = z.object({
  id: Id,
  subjectId: Id.nullable(),
  chapterId: Id.nullable(),
  startedAt: z.string().datetime(),
  durationMinutes: z.number().int().min(1).max(1440),
  notes: Note,
});

export const PracticeSchema = z.object({
  id: Id,
  date: DateOnly,
  subjectId: Id,
  chapterId: Id.nullable(),
  questionCount: z.number().int().min(0).max(100_000),
  correctCount: z.number().int().min(0).max(100_000),
  confidence: z.number().int().min(1).max(5),
  durationMinutes: z.number().int().min(0).max(1440),
  notes: Note,
});

export const RevisionSchema = z.object({
  id: Id,
  title: z.string().trim().min(1).max(160),
  subjectId: Id.nullable(),
  chapterId: Id.nullable(),
  dueDate: DateOnly,
  intervalDays: z.number().int().min(1).max(365),
  lastReviewedAt: DateOnly.nullable(),
  status: z.enum(['scheduled', 'due', 'reviewed']),
  reviewResult: z.enum(['hard', 'okay', 'easy']).nullable().default(null),
});

export const ActiveTimerSchema = z.object({
  id: Id,
  subjectId: Id.nullable(),
  chapterId: Id.nullable(),
  startedAt: z.string().datetime(),
  elapsedSeconds: z.number().int().min(0).max(31_536_000),
  resumedAt: z.string().datetime().nullable(),
  isPaused: z.boolean(),
  mode: z.enum(['stopwatch', 'pomodoro']).default('stopwatch'),
  targetSeconds: z.number().int().min(60).max(31_536_000).nullable().default(null),
});

// Revision reminders, counted from the day a chapter is marked read.
// Hard and Okay: day 7, 15 and 30. Easy: day 7 and 30.
export const revisionOffsets = (difficulty: 'hard' | 'okay' | 'easy'): number[] =>
  difficulty === 'easy' ? [7, 30] : [7, 15, 30];

export const ExamSchema = z.object({
  id: Id,
  title: z.string().trim().min(1).max(160),
  examType: z.enum(['pretest', 'test', 'coaching', 'weekly', 'chapter', 'model', 'custom']).default('custom'),
  subjectId: Id.nullable(),
  date: DateOnly,
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  dateStatus: z.enum(['confirmed', 'provisional']),
  source: z.string().max(240),
  venue: z.string().max(160).default(''),
  notes: Note,
});

export const ResultSchema = z.object({
  id: Id,
  title: z.string().trim().min(1).max(160),
  examId: Id.nullable(),
  subjectId: Id.nullable(),
  date: DateOnly,
  score: z.number().min(0).max(1_000_000),
  maxScore: z.number().positive().max(1_000_000),
  notes: Note,
});

export const SettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  dailyTargetMinutes: z.number().int().min(0).max(1440),
  timezone: z.literal('Asia/Dhaka'),
});

// Daily screen time and study time, imported from a file you prepare (not logged in-app).
export const DailyLogSchema = z.object({
  date: DateOnly,
  screenMinutes: z.number().int().min(0).max(1440).nullable(),
  studyMinutes: z.number().int().min(0).max(1440).nullable(),
});

export const StudyDataSchema = z
  .object({
    schemaVersion: z.literal(2),
    settings: SettingsSchema,
    subjects: z.array(SubjectSchema).max(100),
    papers: z.array(PaperSchema).max(300),
    chapters: z.array(ChapterSchema).max(3000),
    tasks: z.array(TaskSchema).max(10000),
    sessions: z.array(SessionSchema).max(100000),
    practices: z.array(PracticeSchema).max(100000),
    revisions: z.array(RevisionSchema).max(10000),
    exams: z.array(ExamSchema).max(5000),
    results: z.array(ResultSchema).max(10000),
    activeTimer: ActiveTimerSchema.nullable().default(null),
    dailyLogs: z.array(DailyLogSchema).max(5000).default([]),
    lastUpdatedAt: z.string().datetime(),
  })
  .superRefine((data, context) => {
    const subjects = new Map(data.subjects.map((subject) => [subject.id, subject]));
    const papers = new Map(data.papers.map((paper) => [paper.id, paper]));
    const chapters = new Map(data.chapters.map((chapter) => [chapter.id, chapter]));
    const exams = new Map(data.exams.map((exam) => [exam.id, exam]));

    const checkUniqueIds = (items: { id: string }[], path: string) => {
      const ids = new Set<string>();
      for (const [index, item] of items.entries()) {
        if (ids.has(item.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [path, index, 'id'],
            message: 'IDs must be unique.',
          });
        }
        ids.add(item.id);
      }
    };

    for (const key of [
      'subjects',
      'papers',
      'chapters',
      'tasks',
      'sessions',
      'practices',
      'revisions',
      'exams',
      'results',
    ] as const) {
      checkUniqueIds(data[key], key);
    }

    data.papers.forEach((paper, index) => {
      if (!subjects.has(paper.subjectId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['papers', index, 'subjectId'],
          message: 'Paper refers to a subject that does not exist.',
        });
      }
    });

    data.chapters.forEach((chapter, index) => {
      if (!subjects.has(chapter.subjectId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['chapters', index, 'subjectId'],
          message: 'Chapter refers to a subject that does not exist.',
        });
      }
      if (
        chapter.paperId &&
        papers.get(chapter.paperId)?.subjectId !== chapter.subjectId
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['chapters', index, 'paperId'],
          message: 'Chapter paper must belong to the selected subject.',
        });
      }
    });

    data.tasks.forEach((task, index) => {
      if (task.subjectId && !subjects.has(task.subjectId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tasks', index, 'subjectId'],
          message: 'Task refers to a subject that does not exist.',
        });
      }
      if (
        task.chapterId &&
        chapters.get(task.chapterId)?.subjectId !== task.subjectId
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tasks', index, 'chapterId'],
          message: 'Task chapter must belong to the selected subject.',
        });
      }
    });

    data.sessions.forEach((session, index) => {
      if (session.subjectId && !subjects.has(session.subjectId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sessions', index, 'subjectId'],
          message: 'Session refers to a subject that does not exist.',
        });
      }
      if (
        session.chapterId &&
        chapters.get(session.chapterId)?.subjectId !== session.subjectId
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sessions', index, 'chapterId'],
          message: 'Session chapter must belong to the selected subject.',
        });
      }
    });

    data.practices.forEach((practice, index) => {
      if (practice.correctCount > practice.questionCount) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['practices', index, 'correctCount'],
          message: 'Correct answers cannot exceed the question count.',
        });
      }
      if (!subjects.has(practice.subjectId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['practices', index, 'subjectId'],
          message: 'Practice record refers to a subject that does not exist.',
        });
      }
      if (
        practice.chapterId &&
        chapters.get(practice.chapterId)?.subjectId !== practice.subjectId
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['practices', index, 'chapterId'],
          message: 'Practice chapter must belong to the selected subject.',
        });
      }
    });

    data.revisions.forEach((revision, index) => {
      if (revision.subjectId && !subjects.has(revision.subjectId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['revisions', index, 'subjectId'],
          message: 'Revision refers to a subject that does not exist.',
        });
      }
      if (
        revision.chapterId &&
        chapters.get(revision.chapterId)?.subjectId !== revision.subjectId
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['revisions', index, 'chapterId'],
          message: 'Revision chapter must belong to the selected subject.',
        });
      }
    });

    data.exams.forEach((exam, index) => {
      if (exam.subjectId && !subjects.has(exam.subjectId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['exams', index, 'subjectId'],
          message: 'Exam refers to a subject that does not exist.',
        });
      }
    });

    data.results.forEach((result, index) => {
      if (result.score > result.maxScore) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['results', index, 'score'],
          message: 'Score cannot exceed the maximum score.',
        });
      }
      if (result.examId && !exams.has(result.examId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['results', index, 'examId'],
          message: 'Result refers to an exam that does not exist.',
        });
      }
      if (result.subjectId && !subjects.has(result.subjectId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['results', index, 'subjectId'],
          message: 'Result refers to a subject that does not exist.',
        });
      }
    });

    if (data.activeTimer) {
      if (
        data.activeTimer.subjectId &&
        !subjects.has(data.activeTimer.subjectId)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['activeTimer', 'subjectId'],
          message: 'Timer refers to a subject that does not exist.',
        });
      }
      if (
        data.activeTimer.chapterId &&
        chapters.get(data.activeTimer.chapterId)?.subjectId !==
          data.activeTimer.subjectId
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['activeTimer', 'chapterId'],
          message: 'Timer chapter must belong to the selected subject.',
        });
      }
      if (data.activeTimer.isPaused !== (data.activeTimer.resumedAt === null)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['activeTimer', 'resumedAt'],
          message: 'Paused timers cannot have an active resume time.',
        });
      }
    }
  });

export type Subject = z.infer<typeof SubjectSchema>;
export type Paper = z.infer<typeof PaperSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type StudySession = z.infer<typeof SessionSchema>;
export type PracticeRecord = z.infer<typeof PracticeSchema>;
export type RevisionItem = z.infer<typeof RevisionSchema>;
export type StudyTimer = z.infer<typeof ActiveTimerSchema>;
export type Exam = z.infer<typeof ExamSchema>;
export type Result = z.infer<typeof ResultSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type StudyData = z.infer<typeof StudyDataSchema>;

const STARTING_SUBJECTS = [
  'Bangla',
  'English',
  'ICT',
  'Physics',
  'Chemistry',
  'Biology',
  'Higher Math',
];

export function createInitialStudyData(): StudyData {
  return StudyDataSchema.parse({
    schemaVersion: 2,
    settings: {
      theme: 'system',
      dailyTargetMinutes: 120,
      timezone: 'Asia/Dhaka',
    },
    subjects: STARTING_SUBJECTS.map((name, index) => ({
      id: `suggested-subject-${index + 1}`,
      name,
      isProvisional: true,
    })),
    papers: [],
    chapters: [],
    tasks: [],
    sessions: [],
    practices: [],
    revisions: [],
    exams: [],
    results: [],
    activeTimer: null,
    dailyLogs: [],
    lastUpdatedAt: new Date().toISOString(),
  });
}

export function validateStudyData(value: unknown): StudyData {
  return StudyDataSchema.parse(migrateStudyData(value));
}

function migrateStudyData(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  if (source.schemaVersion !== 1) return value;

  const addDefaults = (item: unknown, defaults: Record<string, unknown>) =>
    typeof item === 'object' && item !== null && !Array.isArray(item)
      ? { ...defaults, ...(item as Record<string, unknown>) }
      : item;
  const mapRecords = (
    records: unknown,
    defaults: Record<string, unknown>,
  ) => Array.isArray(records) ? records.map((record) => addDefaults(record, defaults)) : records;

  return {
    ...source,
    schemaVersion: 2,
    subjects: mapRecords(source.subjects, { isArchived: false, targetPercent: null }),
    chapters: mapRecords(source.chapters, {
      confidence: null,
      isOptional: false,
      isExcluded: false,
      isArchived: false,
      isProvisional: true,
      source: '',
      syllabusVersion: '',
      lastVerifiedAt: null,
    }),
    tasks: mapRecords(source.tasks, { priority: 'normal' }),
    revisions: mapRecords(source.revisions, { reviewResult: null }),
    exams: mapRecords(source.exams, {
      examType: 'custom',
      startTime: null,
      venue: '',
    }),
    activeTimer: null,
    dailyLogs: [],
  };
}
