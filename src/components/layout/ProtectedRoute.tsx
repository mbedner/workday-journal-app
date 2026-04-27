import { Navigate, Outlet } from 'react-router-dom'
import { RiLoaderLine } from '@remixicon/react'
import { useAuth } from '../../hooks/useAuth'

export function ProtectedRoute() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RiLoaderLine size={32} className="animate-spin text-indigo-600" />
      </div>
    )
  }

  return session ? <Outlet /> : <Navigate to="/login" replace />
}
