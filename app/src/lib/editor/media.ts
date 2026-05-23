import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Media block — renders video / audio / iframe (PDF) from a data URL or file URL.
 *
 * Stored as a single block-level node with attributes:
 *   kind:  "video" | "audio" | "pdf"
 *   src:   data: or asset: or http: URL
 *   name:  optional filename for display
 *
 * The schema explicitly allows raw HTML media tags (video/audio/iframe) at the
 * inline+block level so ProseMirror doesn't strip them on insert.
 */
export const Media = Node.create({
  name: "media",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      kind: { default: "video" as "video" | "audio" | "pdf" },
      src: { default: "" },
      name: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="media"]',
        getAttrs: (el) => {
          const root = el as HTMLElement;
          const kind = (root.getAttribute("data-kind") as "video" | "audio" | "pdf") || "video";
          const video = root.querySelector("video");
          const audio = root.querySelector("audio");
          const iframe = root.querySelector("iframe");
          const link = root.querySelector("a[download]");
          const src =
            video?.getAttribute("src") ||
            audio?.getAttribute("src") ||
            iframe?.getAttribute("src") ||
            (link as HTMLAnchorElement | null)?.getAttribute("href") ||
            "";
          const name = link?.getAttribute("download") || root.getAttribute("data-name") || "";
          return { kind, src, name };
        },
      },
      {
        tag: "video[src]",
        getAttrs: (el) => ({
          kind: "video" as const,
          src: (el as HTMLElement).getAttribute("src") || "",
        }),
      },
      {
        tag: "audio[src]",
        getAttrs: (el) => ({
          kind: "audio" as const,
          src: (el as HTMLElement).getAttribute("src") || "",
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const kind = (HTMLAttributes.kind as string) || "video";
    const src = (HTMLAttributes.src as string) || "";
    const name = (HTMLAttributes.name as string) || "";

    const wrapper = mergeAttributes(
      { "data-type": "media", "data-kind": kind, "data-name": name, class: "media-block" },
    );

    if (kind === "video") {
      return [
        "div",
        wrapper,
        ["video", { src, controls: "true", playsinline: "true", style: "max-width:100%;border-radius:10px;display:block" }],
      ];
    }
    if (kind === "audio") {
      return [
        "div",
        wrapper,
        ["audio", { src, controls: "true", style: "width:100%" }],
      ];
    }
    if (kind === "pdf") {
      return [
        "div",
        wrapper,
        [
          "iframe",
          {
            src,
            class: "media-pdf",
            style:
              "width:100%;height:600px;border:1px solid var(--border);border-radius:10px;display:block",
          },
        ],
        [
          "a",
          { href: src, download: name || "file.pdf", class: "media-download" },
          `📎 ${name || "PDF"}`,
        ],
      ];
    }
    return ["div", wrapper, ["a", { href: src, download: name }, `📎 ${name || src}`]];
  },
});
