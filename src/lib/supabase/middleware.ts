import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

async function isAdmin(userId: string): Promise<boolean> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.error('[middleware] SUPABASE_SERVICE_ROLE_KEY is not set')
    return false
  }
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data, error } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single()
  if (error) {
    console.error('[middleware] isAdmin check failed:', error.message)
    return false
  }
  return data?.is_admin === true
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // Allow API routes and auth callback
  if (path.startsWith('/api/') || path.startsWith('/auth/')) {
    return response
  }

  // Not logged in - redirect to login (unless already there)
  if (!user && path !== '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Logged in user on login page or root - redirect based on role
  if (user && (path === '/login' || path === '/')) {
    const admin = await isAdmin(user.id)
    const url = request.nextUrl.clone()
    url.pathname = admin ? '/admin' : '/dashboard'
    return NextResponse.redirect(url)
  }

  // Admin route protection
  if (user && path.startsWith('/admin')) {
    const admin = await isAdmin(user.id)
    if (!admin) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return response
}
