import { SelectHTMLAttributes, forwardRef } from 'react'
import { RiArrowDownSLine } from '@remixicon/react'

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, Props>(
  ({ label, error, className = '', id, children, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <div className={`relative ${className}`}>
          <select
            ref={ref}
            id={inputId}
            className={`w-full appearance-none rounded-lg border px-3 py-2 pr-8 text-base sm:text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition bg-white ${
              error ? 'border-red-400' : 'border-gray-300'
            }`}
            {...props}
          >
            {children}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
            <RiArrowDownSLine size={15} className="text-gray-400" />
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    )
  }
)
Select.displayName = 'Select'
