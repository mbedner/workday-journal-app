import { RiStarFill, RiStarLine } from '@remixicon/react'

interface Props {
  value: number | null
  onChange?: (value: number) => void
  readonly?: boolean
}

export function StarRating({ value, onChange, readonly = false }: Props) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(star)}
          className={`transition ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} ${
            star <= (value ?? 0) ? 'text-amber-400' : 'text-gray-300'
          }`}
        >
          {star <= (value ?? 0)
            ? <RiStarFill size={18} />
            : <RiStarLine size={18} />
          }
        </button>
      ))}
    </div>
  )
}
