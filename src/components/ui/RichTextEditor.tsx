import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { marked } from 'marked'
import {
  RiBold,
  RiItalic,
  RiUnderline,
  RiH2,
  RiH3,
  RiListUnordered,
  RiListOrdered,
  RiDoubleQuotesL,
  RiArrowGoBackLine,
  RiArrowGoForwardLine,
  RiSeparator,
} from '@remixicon/react'

interface Props {
  label?: string
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  children,
  title,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => {
        e.preventDefault()
        onClick()
      }}
      disabled={disabled}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-indigo-100 text-indigo-700'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
}

// Convert existing plain text / markdown to HTML for Tiptap
function toHtml(content: string): string {
  if (!content) return ''
  // Already HTML
  if (content.trim().startsWith('<')) return content
  // Parse markdown → HTML
  return marked.parse(content) as string
}

export function RichTextEditor({ label, value, onChange, placeholder, minHeight = 160 }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder ?? 'Start writing…' }),
    ],
    content: toHtml(value),
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: [
          'outline-none px-3 py-3',
          'prose prose-sm max-w-none',
          'prose-headings:font-semibold prose-headings:text-gray-800',
          'prose-h2:text-base prose-h2:mt-3 prose-h2:mb-1',
          'prose-h3:text-sm prose-h3:mt-2 prose-h3:mb-1',
          'prose-p:text-gray-700 prose-p:leading-relaxed prose-p:my-1',
          'prose-ul:my-1 prose-ol:my-1 prose-li:my-0',
          'prose-li:marker:text-gray-400 prose-li:text-gray-700',
          'prose-blockquote:border-indigo-200 prose-blockquote:text-gray-500 prose-blockquote:my-2',
          'prose-strong:text-gray-900',
          'prose-code:text-indigo-700 prose-code:bg-indigo-50 prose-code:px-1 prose-code:rounded prose-code:text-xs',
        ].join(' '),
      },
    },
  })

  // Sync external value changes (e.g. form reset)
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    const incoming = toHtml(value)
    if (current !== incoming && incoming !== '<p></p>') {
      editor.commands.setContent(incoming)
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null

  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-sm font-medium text-gray-700">{label}</span>}

      <div className="rounded-lg border border-gray-300 bg-white shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50/60 flex-wrap">
          <ToolbarButton title="Bold" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}>
            <RiBold size={14} />
          </ToolbarButton>
          <ToolbarButton title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}>
            <RiItalic size={14} />
          </ToolbarButton>
          <ToolbarButton title="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')}>
            <RiUnderline size={14} />
          </ToolbarButton>

          <div className="w-px h-4 bg-gray-200 mx-1" />

          <ToolbarButton title="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}>
            <RiH2 size={14} />
          </ToolbarButton>
          <ToolbarButton title="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })}>
            <RiH3 size={14} />
          </ToolbarButton>

          <div className="w-px h-4 bg-gray-200 mx-1" />

          <ToolbarButton title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}>
            <RiListUnordered size={14} />
          </ToolbarButton>
          <ToolbarButton title="Ordered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}>
            <RiListOrdered size={14} />
          </ToolbarButton>
          <ToolbarButton title="Blockquote" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')}>
            <RiDoubleQuotesL size={14} />
          </ToolbarButton>
          <ToolbarButton title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <RiSeparator size={14} />
          </ToolbarButton>

          <div className="w-px h-4 bg-gray-200 mx-1" />

          <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
            <RiArrowGoBackLine size={14} />
          </ToolbarButton>
          <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
            <RiArrowGoForwardLine size={14} />
          </ToolbarButton>
        </div>

        {/* Editor content */}
        <EditorContent
          editor={editor}
          style={{ minHeight }}
        />
      </div>
    </div>
  )
}
