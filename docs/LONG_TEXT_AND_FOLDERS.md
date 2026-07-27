# Practice-library folders and long-text progress

Writing Assistant 0.7.0 adds a local folder browser and a chapter-based long-text workspace. It does not add network resource downloads or EPUB, DOCX and PDF parsing; those remain separate later work.

## Virtual folders

The folder tree is part of Writing Assistant, not the computer's Finder file system.

Built-in top-level areas include:

- IELTS Writing;
- Academic Writing;
- Pharmacy & Biomedicine;
- Literature;
- My Library.

Visitors can create, rename and delete their own folders under the library, and can move locally imported materials between folders. Built-in folders and built-in materials are protected from deletion.

Custom folder records and material locations are stored in IndexedDB in the current browser. They are included in Writing Assistant JSON backups.

## Document model

A practice material is treated as a document:

```text
Document
└── Chapter
    └── Batch (up to 45 practice units)
        └── Unit
```

A chapter can be detected from:

- Markdown headings such as `# Chapter One`;
- headings beginning with Chapter, Part, Book or Section;
- an explicit `chapters` array in an imported library JSON;
- automatic splitting of a very long unheaded text.

The import dialog also allows the visitor to keep a document as one chapter.

## Batches

Each chapter is divided into batches of at most 45 practice units. A unit is:

- a sentence, paragraph or smart short passage in Sentence Lab;
- a paragraph in Paragraph Lab.

The chapter and batch navigator lets the visitor move freely among earlier and later sections. Reaching the end of a batch opens a choice to continue to the next batch, move to the next chapter, or stay where they are.

## Progress persistence

Each chapter keeps separate progress for Sentence Lab and Paragraph Lab. Before changing chapter or document, the current fields are committed and the chapter snapshot is written to IndexedDB.

The active chapter is also represented in the ordinary application state so reopening the same site can resume the current location. JSON backups include:

- application state;
- custom library materials;
- custom folders;
- per-chapter progress records.

## Migration from 0.6.0

An existing active Sentence Lab or Paragraph Lab practice is migrated into a one-chapter document without deleting answers or notes. The existing `writing-assistant-v4` storage key is intentionally retained for backward compatibility.

## Current format boundary

0.7.0 continues to accept text, TXT, Markdown and practice-library JSON. Online Wikipedia/Wikisource resources and EPUB, DOCX or PDF parsing are not part of this release.
