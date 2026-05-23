import { markInputRule, markPasteRule, Extension } from "@tiptap/core";

/**
 * Auto-detect [[wiki links]] and #tags while typing.
 * Runs as InputRules on top of existing Mark extensions.
 */
export const PkmInputRules = Extension.create({
  name: "pkmInputRules",

  addInputRules() {
    return [
      markInputRule({
        find: /(?:^|\s)\[\[([^\]]+)\]\]$/,
        type: this.editor.schema.marks.wikiLink,
        getAttributes: (match) => ({ target: match[1].trim() }),
      }),
      markInputRule({
        find: /(?:^|\s)#([\p{L}_][\p{L}\p{N}_/-]*)$/u,
        type: this.editor.schema.marks.hashtag,
        getAttributes: (match) => ({ tag: match[1] }),
      }),
    ];
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: /\[\[([^\]]+)\]\]/g,
        type: this.editor.schema.marks.wikiLink,
        getAttributes: (match) => ({ target: match[1].trim() }),
      }),
      markPasteRule({
        find: /(?:^|\s)#([\p{L}_][\p{L}\p{N}_/-]*)/gu,
        type: this.editor.schema.marks.hashtag,
        getAttributes: (match) => ({ tag: match[1] }),
      }),
    ];
  },
});
