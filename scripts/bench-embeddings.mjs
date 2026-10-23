// Benchmarks small embedding models for on-device note search. Synthetic voice-note passages
// and reworded queries (written for this test, not real user data).
// Usage: node scripts/bench-embeddings.mjs [cacheDir]   (downloads about 80 MB of models)
import { pipeline, env } from '@huggingface/transformers';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const cacheDir = process.argv[2] ?? join(tmpdir(), 'voice-notes-embed-bench');
env.cacheDir = cacheDir;

const passages = [
  'I should try running a smaller speech model in the browser this weekend and see if load time drops.',
  'Ask Rahul about the project timeline, I think the launch date slipped again.',
  'Groceries: oat milk, eggs, spinach, and the good coffee beans from the corner shop.',
  'The WebGPU path was about four times faster than WASM on my laptop, but the phone fell back to CPU.',
  'Meeting with the design team: we agreed the record button stays the hero on every screen.',
  'Idea for a short story about a lighthouse keeper who records the sea every night.',
  'Dentist appointment moved to Thursday at four, need to leave work early.',
  'Budget check: rent is fine, but subscriptions crept up to almost sixty a month, cancel two.',
  'The interview candidate was strong on systems design but vague about testing.',
  'Run felt heavy today, knee hurt after five kilometres, maybe rest until Sunday.',
  'Book recommendation from Priya: Four Thousand Weeks, about time and accepting limits.',
  'Bug: the transcript sometimes repeats the last sentence when the recording is paused.',
  'Plan for mum’s birthday: dinner at the Italian place, order the cake by Friday.',
  'Thinking about learning Spanish again, maybe twenty minutes every morning with the app.',
  'Customer call: they want offline export to Word, not just markdown.',
  'The landlord said the boiler will be serviced next week, someone needs to be home.',
  'Reflection: I work best in the morning, afternoons should be for meetings and email.',
  'Garden: tomatoes need more sun, move the pots to the south wall.',
  'Car insurance renews next month, compare quotes before it auto-renews.',
  'Podcast notes: the guest argued that small teams ship faster because decisions are cheaper.',
  'Decided to drop the cloud sync idea for now, privacy promise matters more.',
  'Recipe tweak: less salt in the dal, add lemon at the end.',
  'Flight to Delhi on the twelfth, need a visa photo and travel insurance.',
  'Started reading about vector search, cosine similarity on normalised embeddings is enough.',
];

// Each query is reworded to avoid the passage's key words where possible.
const queries = [
  ['which experiment did I want to do with the speech model on the weekend', 0],
  ['who do I need to check the schedule with', 1],
  ['shopping list', 2],
  ['how much quicker was the graphics card version', 3],
  ['what did we decide about the main microphone control', 4],
  ['fiction idea about the ocean', 5],
  ['when is my teeth check-up', 6],
  ['monthly spending on services I subscribe to', 7],
  ['feedback on the person we hired or interviewed', 8],
  ['injury while jogging', 9],
  ['what book did someone suggest', 10],
  ['problem with duplicated text after pausing', 11],
  ['celebration for my mother', 12],
  ['language learning plan', 13],
  ['client asked for a different export format', 14],
  ['heating repair visit', 15],
  ['when am I most productive', 16],
  ['plants not getting enough light', 17],
  ['vehicle policy renewal', 18],
  ['why small groups move faster', 19],
  ['did I give up on syncing across devices', 20],
  ['cooking change for lentils', 21],
  ['travel documents for India trip', 22],
  ['how to compare embeddings', 23],
];

/** The app's current keyword search: every query word must appear. */
function keywordHits(query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return passages
    .map((p, i) => [i, words.every((w) => p.toLowerCase().includes(w))])
    .filter(([, ok]) => ok)
    .map(([i]) => i);
}

function dirSize(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    total += stat.isDirectory() ? dirSize(path) : stat.size;
  }
  return total;
}

const models = [
  { id: 'Xenova/all-MiniLM-L6-v2', pooling: 'mean', queryPrefix: '' },
  {
    id: 'Xenova/bge-small-en-v1.5',
    pooling: 'cls',
    queryPrefix: 'Represent this sentence for searching relevant passages: ',
  },
  {
    id: 'Snowflake/snowflake-arctic-embed-xs',
    pooling: 'cls',
    queryPrefix: 'Represent this sentence for searching relevant passages: ',
  },
];

const kw = queries.filter(([q, i]) => keywordHits(q).includes(i)).length;
console.log(`keyword search (current app): ${kw}/${queries.length} queries find their note`);

for (const model of models) {
  try {
    const t0 = performance.now();
    const extract = await pipeline('feature-extraction', model.id, { dtype: 'q8' });
    const loadMs = performance.now() - t0;
    const t1 = performance.now();
    const docs = await extract(passages, { pooling: model.pooling, normalize: true });
    const perPassageMs = (performance.now() - t1) / passages.length;
    const docVecs = docs.tolist();
    const qVecs = (
      await extract(
        queries.map(([q]) => model.queryPrefix + q),
        { pooling: model.pooling, normalize: true },
      )
    ).tolist();
    let top1 = 0;
    let top3 = 0;
    let rr = 0;
    queries.forEach(([, target], qi) => {
      const ranked = docVecs
        .map((d, di) => [di, d.reduce((s, v, k) => s + v * qVecs[qi][k], 0)])
        .sort((a, b) => b[1] - a[1])
        .map(([di]) => di);
      const rank = ranked.indexOf(target);
      if (rank === 0) top1++;
      if (rank < 3) top3++;
      rr += 1 / (rank + 1);
    });
    const sizeMB = dirSize(join(cacheDir, ...model.id.split('/'))) / 1e6;
    console.log(
      `${model.id}: top1 ${top1}/${queries.length}, top3 ${top3}/${queries.length}, MRR ${(rr / queries.length).toFixed(2)}, ` +
        `dims ${docVecs[0].length}, download ${sizeMB.toFixed(1)} MB, load ${Math.round(loadMs)} ms, ` +
        `${perPassageMs.toFixed(1)} ms/passage (Node CPU)`,
    );
  } catch (error) {
    console.log(`${model.id}: failed (${error.message})`);
  }
}
