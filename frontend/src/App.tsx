import { RouterProvider } from 'react-router'
import { Toaster } from 'react-hot-toast'
import { router } from '@/routes/router'
import { AuthProvider } from '@/features/auth/AuthContext'

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster position="top-right" />
    </AuthProvider>
  )
}

export default App
