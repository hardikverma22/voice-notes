export interface TextNode {
  type: 'text';
  text: string;
}
export interface ParagraphNode {
  type: 'paragraph';
  content?: TextNode[];
}
export interface DocJson {
  type: 'doc';
  content: ParagraphNode[];
}

const SENTENCES_PER_PARAGRAPH = 3;

/** Splits a transcript into Tiptap doc JSON: a new paragraph about every three sentences. */
export function transcriptToDoc(text: string): DocJson {
  const sentences =
    text
      .trim()
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((s) => s.trim()) ?? [];
  const content: ParagraphNode[] = [];
  for (let i = 0; i < sentences.length; i += SENTENCES_PER_PARAGRAPH) {
    const joined = sentences.slice(i, i + SENTENCES_PER_PARAGRAPH).join(' ');
    content.push({ type: 'paragraph', content: [{ type: 'text', text: joined }] });
  }
  if (content.length === 0) content.push({ type: 'paragraph' });
  return { type: 'doc', content };
}
