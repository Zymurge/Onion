import { useState, type FormEvent } from 'react'
import { requestJson } from '../../shared/apiProtocol'
import type { WebRuntimeConfig } from './appBootstrap'

type AuthResponse = {
  username: string
  token: string
}

type RegistrationDraft = {
  apiBaseUrl: string
  username: string
  email: string
  password: string
}

type UseRegistrationGateOptions = {
  runtimeConfig?: WebRuntimeConfig
}

const PRINTABLE_ASCII_RE = /^[\x20-\x7E]+$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function useRegistrationGate({ runtimeConfig }: UseRegistrationGateOptions) {
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const [registeredUsername, setRegisteredUsername] = useState<string | null>(null)
  const [registrationDraft, setRegistrationDraft] = useState<RegistrationDraft>({
    apiBaseUrl: runtimeConfig?.apiBaseUrl ?? 'http://localhost:3000',
    username: '',
    email: '',
    password: '',
  })

  async function submitRegistrationDraft(draft: RegistrationDraft) {
    setRegistrationError(null)
    setRegisteredUsername(null)

    if (!draft.apiBaseUrl.trim() || !draft.username || !draft.email || !draft.password) {
      setRegistrationError('Username, email, and password are required.')
      return
    }

    if (draft.username.length < 4 || draft.username.length > 20) {
      setRegistrationError('Username must be 4 to 20 characters long.')
      return
    }
    if (!PRINTABLE_ASCII_RE.test(draft.username)) {
      setRegistrationError('Username must use printable ASCII characters only.')
      return
    }
    if (draft.username !== draft.username.trim()) {
      setRegistrationError('Username cannot start or end with spaces.')
      return
    }
    if (!EMAIL_RE.test(draft.email) || draft.email.length > 254) {
      setRegistrationError('Enter a valid email address.')
      return
    }
    if (draft.password.length < 8 || draft.password.length > 20) {
      setRegistrationError('Password must be 8 to 20 characters long.')
      return
    }
    if (!PRINTABLE_ASCII_RE.test(draft.password)) {
      setRegistrationError('Password must use printable ASCII characters only.')
      return
    }

    try {
      const registrationResult = await requestJson<AuthResponse>({
        baseUrl: draft.apiBaseUrl.trim(),
        path: 'auth/register',
        method: 'POST',
        body: {
          username: draft.username,
          email: draft.email,
          password: draft.password,
        },
      })

      if (!registrationResult.ok) {
        setRegistrationError(registrationResult.message)
        return
      }

      setRegisteredUsername(registrationResult.data.username)
    } catch {
      setRegistrationError('Unable to connect to the backend.')
    }
  }

  function handleRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitRegistrationDraft(registrationDraft)
  }

  return {
    registrationDraft,
    registrationError,
    registeredUsername,
    handleRegistration,
    setRegistrationDraft,
    setRegistrationError,
    submitRegistrationDraft,
  }
}