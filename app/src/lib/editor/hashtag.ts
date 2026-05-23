import { Mark, mergeAttributes } from "@tiptap/core";

export const Hashtag = Mark.create({
  name: "hashtag",
  inclusive: false,

  addOptions() {
    return { HTMLAttributes: { class: "hashtag" } };
  },

  addAttributes() {
    return {
      tag: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-tag"),
        renderHTML: (attrs) => ({ "data-tag": attrs.tag }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="hashtag"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-type": "hashtag" }, this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },
});
