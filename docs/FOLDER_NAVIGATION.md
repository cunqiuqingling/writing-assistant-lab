# Collapsible folder navigation — M3

Every sidebar folder with children now has a dedicated disclosure arrow.

- Click the arrow to expand or collapse only.
- Click the folder name to open that folder.
- Leaf folders reserve the same alignment space but do not show an arrow.
- “All Materials” controls visibility of the entire tree below it.
- Opening a folder through breadcrumbs, child tiles or an import automatically reveals its ancestor path.
- Expanded/collapsed state is stored in `state.library.collapsedFolderIds`, so it is included in the ordinary local JSON backup.
- Folder selection and folder expansion are independent: collapsing a branch does not change the currently displayed material collection.
