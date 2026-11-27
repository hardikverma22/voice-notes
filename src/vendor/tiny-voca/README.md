# tiny-voca (vendored)

The plain-JavaScript text-to-speech model and phonemizer from
[n4ze3m/tiny-voca](https://github.com/n4ze3m/tiny-voca), folder `js/`, at commit
`61b258fd2f2aeaad27818fcc6f097674cd609108`. Apache License 2.0, see `LICENSE`.

- `tiny-voca.js`: the GGUF reader and the model. Unchanged.
- `dizione/`: the phonemizer. Unchanged.
- `*.d.ts`: types for the parts the app calls. Added here.

Upstream's `text.js` (sentence splitting, the limiter and WAV writing) is not copied: the app's
own version, with note-aware text preparation, is `src/features/speak/speechText.ts`.

The weights are downloaded at run time from
[huggingface.co/n4ze3m/tiny-voca](https://huggingface.co/n4ze3m/tiny-voca) (Apache 2.0), file
`gguf/tiny-voca-js.gguf`, pinned to a revision in `src/features/speak/config.ts`.

Only `src/workers/tts.worker.ts` imports this folder. To update, copy `js/tiny-voca.js` and
`js/dizione/*.js` from a newer commit, update the commit above, and run `npm run verify` and
`npx playwright test read-aloud`.
