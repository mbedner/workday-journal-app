export interface PageContext {
  url: string
  title: string
}

export interface Settings {
  token: string
  appUrl: string
}

export interface Metadata {
  projects: string[]
  tags: string[]
  attendees: string[]
}
