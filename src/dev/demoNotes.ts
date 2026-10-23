import { db, type Note } from '../storage/db';
import { transcriptToDoc } from '../features/notes/transcriptToDoc';

/**
 * Sample notes for trying the app during development (Settings › Developer, dev builds only).
 * Written so search by meaning has something to find: try "when is my teeth check-up",
 * "injury while jogging", "what did we decide about sync" or "gift ideas for mum".
 * Every demo note is tagged "demo" and has an id starting with "demo-", so they can be removed.
 */

const DAY = 86_400_000;

interface DemoNote {
  title: string;
  text: string;
  tags: string[];
  daysAgo: number;
  pinned?: boolean;
  /** Checklist items, [text, done]; they show on the Tasks page. */
  tasks?: [string, boolean][];
}

const NOTES: DemoNote[] = [
  {
    title: 'Weekly planning with Priya',
    text: 'We agreed to ship the offline backup first, then look at search. Priya will draft the onboarding copy by Thursday. I need to send her the screenshots from the new library screen before Wednesday.',
    tags: ['work', 'planning'],
    daysAgo: 0,
    pinned: true,
    tasks: [
      ['Send Priya the library screenshots', false],
      ['Review the onboarding copy draft', false],
      ['Write release notes for the backup feature', true],
    ],
  },
  {
    title: 'Dentist moved',
    text: 'Dentist appointment moved to Thursday at four. Need to leave work a bit early and remember to ask about the sensitive tooth on the left side.',
    tags: ['health'],
    daysAgo: 0,
  },
  {
    title: 'Morning run',
    text: 'Run felt heavy today. Knee started hurting after about five kilometres so I walked the last bit. Maybe rest until Sunday and try a shorter loop.',
    tags: ['running', 'health'],
    daysAgo: 1,
  },
  {
    title: 'Physio advice',
    text: 'Physio said the knee pain probably comes from weak hips, not the knee itself. Clamshells, bridges and side planks three times a week. Ice after long runs.',
    tags: ['health'],
    daysAgo: 3,
  },
  {
    title: 'Groceries',
    text: 'Oat milk, eggs, spinach, lemons, the good coffee beans from the corner shop, and something for dinner on Friday when the neighbours come over.',
    tags: ['home'],
    daysAgo: 1,
  },
  {
    title: 'Sync decision',
    text: 'Decided to drop cloud sync for now. The privacy promise matters more than convenience. If people need their notes on two devices, the zip backup covers it until we can do end to end encryption properly.',
    tags: ['work', 'decision'],
    daysAgo: 2,
  },
  {
    title: 'Speech model experiment',
    text: 'Try a smaller speech model in the browser this weekend and measure first load time. WebGPU was about four times faster than WASM on the laptop, but the phone fell back to the CPU.',
    tags: ['work', 'idea'],
    daysAgo: 4,
  },
  {
    title: 'Mum’s birthday',
    text: 'Dinner at the Italian place on the twentieth, book a table for six. Order the lemon cake by Friday. Gift idea: the gardening book she mentioned, or a nice set of pruning shears.',
    tags: ['family'],
    daysAgo: 5,
    tasks: [
      ['Book a table for six', true],
      ['Order the lemon cake', false],
      ['Buy the gardening book', false],
    ],
  },
  {
    title: 'Car insurance',
    text: 'The car insurance renews next month. Compare at least three quotes before it rolls over automatically, last year it went up by almost a third without anyone asking.',
    tags: ['money'],
    daysAgo: 6,
    tasks: [['Get three insurance quotes', false]],
  },
  {
    title: 'Monthly subscriptions',
    text: 'Went through the bank statement. Subscriptions crept up to almost sixty a month. Cancel the second streaming service and the photo app I never open.',
    tags: ['money'],
    daysAgo: 8,
  },
  {
    title: 'Story idea',
    text: 'A lighthouse keeper who records the sound of the sea every night, and one night the recording has a voice in it that answers back.',
    tags: ['idea', 'writing'],
    daysAgo: 12,
  },
  {
    title: 'Interview notes',
    text: 'The candidate was strong on systems design and explained trade-offs clearly, but was vague about how they test things. Ask the team for a second conversation focused on testing.',
    tags: ['work', 'hiring'],
    daysAgo: 15,
  },
  {
    title: 'Boiler service',
    text: 'The landlord says the boiler gets serviced next Tuesday between eight and twelve. Someone has to be home to let the engineer in.',
    tags: ['home'],
    daysAgo: 20,
  },
  {
    title: 'Learning Spanish again',
    text: 'Twenty minutes every morning before work. Start with the podcast for listening and do flashcards on the bus. Goal: hold a simple conversation by summer.',
    tags: ['learning'],
    daysAgo: 35,
  },
  {
    title: 'Podcast takeaway',
    text: 'The guest argued that small teams ship faster because every decision is cheaper. Fewer people to convince, fewer meetings, and the person who builds it also talks to users.',
    tags: ['work', 'idea'],
    daysAgo: 40,
  },
];

function demoDoc(demo: DemoNote): { contentJson: string; plainText: string } {
  const doc = transcriptToDoc(demo.text);
  const tasks = demo.tasks ?? [];
  const content: unknown[] = [...doc.content];
  if (tasks.length) {
    content.push({
      type: 'taskList',
      content: tasks.map(([text, checked]) => ({
        type: 'taskItem',
        attrs: { checked },
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      })),
    });
  }
  return {
    contentJson: JSON.stringify({ type: 'doc', content }),
    plainText: [demo.text, ...tasks.map(([text]) => text)].join('\n'),
  };
}

export async function addDemoNotes(): Promise<number> {
  const now = Date.now();
  const notes: Note[] = NOTES.map((demo, index) => {
    const createdAt = now - demo.daysAgo * DAY - index * 60_000;
    return {
      id: `demo-${index}`,
      title: demo.title,
      ...demoDoc(demo),
      segments: [],
      audioId: null,
      durationMs: 0,
      language: 'english',
      modelId: 'demo',
      device: 'wasm',
      createdAt,
      updatedAt: createdAt,
      pinned: demo.pinned ?? false,
      status: 'ready',
      autoTitle: false,
      tags: [...demo.tags, 'demo'],
      bookmarks: [],
      pendingAppend: null,
    };
  });
  await db.notes.bulkPut(notes);
  return notes.length;
}

export async function removeDemoNotes(): Promise<number> {
  const ids = (await db.notes.toCollection().primaryKeys()).filter((id) =>
    String(id).startsWith('demo-'),
  );
  await db.transaction('rw', [db.notes, db.audio, db.searchChunks, db.searchIndex], async () => {
    await db.notes.bulkDelete(ids);
    await db.audio.where('noteId').anyOf(ids).delete();
    await db.searchChunks.where('noteId').anyOf(ids).delete();
    await db.searchIndex.bulkDelete(ids);
  });
  return ids.length;
}
