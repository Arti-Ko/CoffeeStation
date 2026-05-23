import { Mark, mergeAttributes } from "@tiptap/core";

export interface WikiLinkOptions {
  HTMLAttributes: Record<string, unknown>;
  onClickTarget?: (title: string) => void;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiLink: {
      setWikiLink: (title: string) => ReturnType;
    };
  }
}

export const WikiLink = Mark.create<WikiLinkOptions>({
  name: "wikiLink",
  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: { class: "wiki-link" },
    };
  },

  addAttributes() {
    return {
      target: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-target"),
        renderHTML: (attrs) => ({ "data-target": attrs.target }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="wiki-link"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-type": "wiki-link" }, this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      setWikiLink:
        (target: string) =>
        ({ commands }) => commands.setMark(this.name, { target }),
    };
  },
});
