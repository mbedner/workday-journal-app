import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { MfaVerifyPage } from './pages/MfaVerifyPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { PageLoading } from './components/ui/PageLoading'

// Everything behind the auth wall is code-split per route — these pages make
// up the bulk of the app's JS, and most sessions only visit a few of them.
const DashboardPage        = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const JournalListPage      = lazy(() => import('./pages/JournalListPage').then(m => ({ default: m.JournalListPage })))
const JournalDetailPage    = lazy(() => import('./pages/JournalDetailPage').then(m => ({ default: m.JournalDetailPage })))
const TasksPage            = lazy(() => import('./pages/TasksPage').then(m => ({ default: m.TasksPage })))
const TaskDetailPage       = lazy(() => import('./pages/TaskDetailPage').then(m => ({ default: m.TaskDetailPage })))
const TranscriptsListPage  = lazy(() => import('./pages/TranscriptsListPage').then(m => ({ default: m.TranscriptsListPage })))
const TranscriptDetailPage = lazy(() => import('./pages/TranscriptDetailPage').then(m => ({ default: m.TranscriptDetailPage })))
const SearchPage           = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })))
const ProjectsPage         = lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })))
const ProjectDetailPage    = lazy(() => import('./pages/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })))
const PeoplePage           = lazy(() => import('./pages/PeoplePage').then(m => ({ default: m.PeoplePage })))
const PersonDetailPage     = lazy(() => import('./pages/PersonDetailPage').then(m => ({ default: m.PersonDetailPage })))
const SettingsPage         = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const ArchivePage          = lazy(() => import('./pages/ArchivePage').then(m => ({ default: m.ArchivePage })))

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/mfa" element={<MfaVerifyPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Suspense fallback={<PageLoading />}><DashboardPage /></Suspense>} />
            <Route path="/journal" element={<Suspense fallback={<PageLoading />}><JournalListPage /></Suspense>} />
            <Route path="/journal/:date" element={<Suspense fallback={<PageLoading />}><JournalDetailPage /></Suspense>} />
            <Route path="/tasks" element={<Suspense fallback={<PageLoading />}><TasksPage /></Suspense>} />
            <Route path="/tasks/:id" element={<Suspense fallback={<PageLoading />}><TaskDetailPage /></Suspense>} />
            <Route path="/transcripts" element={<Suspense fallback={<PageLoading />}><TranscriptsListPage /></Suspense>} />
            <Route path="/transcripts/:id" element={<Suspense fallback={<PageLoading />}><TranscriptDetailPage /></Suspense>} />
            <Route path="/search" element={<Suspense fallback={<PageLoading />}><SearchPage /></Suspense>} />
            <Route path="/projects" element={<Suspense fallback={<PageLoading />}><ProjectsPage /></Suspense>} />
            <Route path="/projects/:id" element={<Suspense fallback={<PageLoading />}><ProjectDetailPage /></Suspense>} />
            <Route path="/people" element={<Suspense fallback={<PageLoading />}><PeoplePage /></Suspense>} />
            <Route path="/people/:id" element={<Suspense fallback={<PageLoading />}><PersonDetailPage /></Suspense>} />
            <Route path="/settings" element={<Suspense fallback={<PageLoading />}><SettingsPage /></Suspense>} />
            <Route path="/archive" element={<Suspense fallback={<PageLoading />}><ArchivePage /></Suspense>} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
