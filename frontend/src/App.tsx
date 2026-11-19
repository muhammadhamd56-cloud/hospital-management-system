import { RouterProvider } from 'react-router'
import { Toaster } from 'react-hot-toast'
import { router } from '@/routes/router'
import { AuthProvider } from '@/features/auth/AuthContext'
import { ThemeTransitionLayer } from '@/features/theme/ThemeTransitionLayer'

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster position="top-right" />
      <ThemeTransitionLayer />
    </AuthProvider>
  )
}

export default App
