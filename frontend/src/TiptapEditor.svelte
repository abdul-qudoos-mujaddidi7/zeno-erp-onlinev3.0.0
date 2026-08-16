<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';

  import { Table } from '@tiptap/extension-table';
  import { TableRow } from '@tiptap/extension-table-row';
  import { TableHeader } from '@tiptap/extension-table-header';
  import { TableCell } from '@tiptap/extension-table-cell';

  let editorElement: HTMLDivElement;
  let editor: Editor;

  let showCode = $state(false);

  let { value = $bindable('') } = $props();

  onMount(() => {
    editor = new Editor({
      element: editorElement,
      extensions: [
        StarterKit,

        Table.configure({
          resizable: true,
        }),

        TableRow,
        TableHeader,
        TableCell,
      ],
      content: value,
      onUpdate({ editor }) {
        value = editor.getHTML();
      },
    });
  });

  onDestroy(() => {
    editor?.destroy();
  });

  function insertTable() {
    editor
      .chain()
      .focus()
      .insertTable({
        rows: 3,
        cols: 2,
        withHeaderRow: true,
      })
      .run();
  }
  function formatHtml(html: string) {
    return html.replace(/></g, '>\n<').replace(/<(\/?(table|tbody|tr))/g, '\n<$1');
  }
</script>

<div class="toolbar">
  <button class="btn btn-sm btn-light" onclick={() => editor.chain().focus().toggleBold().run()}>
    <i class="bi bi-type-bold"></i>
  </button>
  <button class="btn btn-sm btn-light" onclick={() => editor.chain().focus().toggleItalic().run()}>
    <i class="bi bi-type-italic"></i>
  </button>
  <button class="btn btn-sm btn-light" onclick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
    <i class="bi bi-type-h1"></i>
  </button>
  <button class="btn btn-sm btn-light" onclick={() => editor.chain().focus().toggleBulletList().run()}>
    <i class="bi bi-list-ul"></i>
  </button>
  <button class="btn btn-sm btn-light" onclick={() => editor.chain().focus().toggleOrderedList().run()}>
    <i class="bi bi-list-ol"></i>
  </button>
  <button class="btn btn-sm btn-light" onclick={insertTable}>
    <i class="bi bi-table"></i>
  </button>
  <button class="btn btn-sm btn-light" onclick={() => editor.chain().focus().addRowAfter().run()}>
    <i class="bi bi-plus-square"></i>
  </button>
  <button class="btn btn-sm btn-light" onclick={() => editor.chain().focus().deleteRow().run()}>
    <i class="bi bi-dash-square"></i>
  </button>
  <button class="btn btn-sm btn-light" onclick={() => editor.chain().focus().addColumnAfter().run()}>
    <i class="bi bi-layout-sidebar-inset"></i>
  </button>
  <button class="btn btn-sm btn-light" onclick={() => editor.chain().focus().deleteColumn().run()}>
    <i class="bi bi-layout-sidebar"></i>
  </button>
  <button class="btn btn-sm btn-light" onclick={() => editor.chain().focus().deleteTable().run()}>
    <i class="bi bi-trash3"></i>
  </button>
  <button
    class={`btn btn-sm btn-${showCode ? 'success' : 'light'}`}
    onclick={() => {
      showCode = !showCode;
    }}>
    <i class="bi bi-code-slash"></i>
  </button>
</div>

<div class="row">
  <div class="col-md-{showCode ? 9 : 12}">
    <div bind:this={editorElement} class="editor"></div>
  </div>
  <div class="col-md-3">
    {#if showCode}
      <pre dir="ltr" class="border p-2">{formatHtml(value)}</pre>
    {/if}
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px;
    border: 1px solid #ddd;
    border-bottom: none;
  }
  .toolbar button {
    padding: 6px 10px;
    cursor: pointer;
  }
  .editor {
    min-height: 200px;
    border: 1px solid #ddd;
    padding: 15px;
    background: white;
  }
  :global(.ProseMirror) {
    outline: none;
    min-height: 150px;
  }
  :global(.ProseMirror table) {
    border-collapse: collapse;
    width: 100%;
    margin: 1rem 0;
  }
  :global(.ProseMirror th),
  :global(.ProseMirror td) {
    border: 1px solid #ccc;
    padding: 4px;
  }
  :global(.ProseMirror th) {
    background: #f5f5f5;
  }
  :global(.ProseMirror td p),
  :global(.ProseMirror th p) {
    margin: 0;
  }

  :global([data-mdb-theme='dark']) :global(.settings-page) .toolbar {
    border-color: var(--settings-input-border, #303b50);
    background: var(--settings-surface-elevated, #151c2b);
  }

  :global([data-mdb-theme='dark']) :global(.settings-page) .toolbar :global(.btn-light) {
    border-color: var(--settings-input-border, #303b50);
    background: var(--settings-input-bg, #151c2b);
    color: var(--settings-input-text, #e7edf7);
  }

  :global([data-mdb-theme='dark']) :global(.settings-page) .toolbar :global(.btn-light:hover) {
    background: rgba(111, 156, 255, 0.1);
    color: var(--settings-heading, #f4f7fb);
  }

  :global([data-mdb-theme='dark']) :global(.settings-page) .toolbar :global(.btn-success) {
    border-color: var(--settings-success, #43d69b);
    background: var(--settings-success, #43d69b);
    color: #08101f;
  }

  :global([data-mdb-theme='dark']) :global(.settings-page) .editor {
    border-color: var(--settings-input-border, #303b50);
    background: var(--settings-input-bg, #151c2b);
    color: var(--settings-input-text, #e7edf7);
  }

  :global([data-mdb-theme='dark']) :global(.settings-page) :global(.ProseMirror) {
    color: var(--settings-input-text, #e7edf7);
    caret-color: var(--settings-input-text, #e7edf7);
  }

  :global([data-mdb-theme='dark']) :global(.settings-page) :global(.ProseMirror th),
  :global([data-mdb-theme='dark']) :global(.settings-page) :global(.ProseMirror td) {
    border-color: var(--settings-input-border, #303b50);
  }

  :global([data-mdb-theme='dark']) :global(.settings-page) :global(.ProseMirror th) {
    background: var(--settings-surface-elevated, #151c2b);
  }

  :global([data-mdb-theme='dark']) :global(.settings-page) :global(pre.border) {
    border-color: var(--settings-input-border, #303b50) !important;
    background: var(--settings-surface, #111827);
    color: var(--settings-input-text, #e7edf7);
  }
</style>
