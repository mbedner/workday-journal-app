import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  content: string
  className?: string
}

export function MarkdownContent({ content, className = '' }: Props) {
  return (
    <div className={`prose prose-sm max-w-none prose-gray
      prose-headings:font-semibold prose-headings:text-gray-800
      prose-h1:text-xl prose-h2:text-base prose-h3:text-sm
      prose-p:text-gray-700 prose-p:leading-relaxed
      prose-a:text-indigo-600 prose-a:no-underline hover:prose-a:underline
      prose-strong:text-gray-900
      prose-ul:text-gray-700 prose-ol:text-gray-700
      prose-li:marker:text-gray-400
      prose-blockquote:border-indigo-200 prose-blockquote:text-gray-600
      prose-code:text-indigo-700 prose-code:bg-indigo-50 prose-code:px-1 prose-code:rounded prose-code:text-xs prose-code:font-mono
      prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200
      prose-hr:border-gray-200
      ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
