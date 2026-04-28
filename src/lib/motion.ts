import type { Transition, Variants } from 'framer-motion'

// Page-level fade + subtle slide
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0 },
}
export const pageTransition: Transition = { duration: 0.2, ease: 'easeOut' }

// Staggered list container
export const listVariants: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.045 } },
}

// Individual list item
export const itemVariants: Variants = {
  hidden:  { opacity: 0, y: 7 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } },
}

// Simple opacity fade (stat cards, misc)
export const fadeVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.22 } },
}
