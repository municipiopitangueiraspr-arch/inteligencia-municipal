import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type MunicipalAssignment = {
  id: string
  orgUnitId: string
  orgUnitName: string
  roleId: string
  roleLabel: string
  moduleIds: string[]
  scopes: { type: string; key: string }[]
}

export type MunicipalFoundationContext = {
  status: 'ready' | 'pending-assignment'
  municipality: { id: string; code: string; name: string; stateCode: string; active: boolean } | null
  professional: { id: string; userId: number; municipalityId: string; fullName: string; cns: string | null; cbo: string | null; professionalCategory: string; active: boolean } | null
  assignments: { id: string; roleId: string; municipalityId: string; establishmentId: string | null; teamId: string | null; microareaId: string | null; validFrom: string; validUntil: string | null }[]
}

export type MunicipalAccessContextValue = {
  status: 'ready' | 'inactive' | 'pending-assignment' | 'error'
  user: { id: number; authUserId: string; name: string; email: string; avatarUrl: string | null; firstAccessPending: boolean } | null
  isAdministrator: boolean
  assignments: MunicipalAssignment[]
  moduleIds: string[]
  permissionIds: string[]
  acs: { id: string; fullName: string; active: boolean } | null
  foundation: MunicipalFoundationContext | null
  error: string | null
  hasModule: (moduleId: string) => boolean
  hasPermission: (permissionId: string) => boolean
  hasRole: (roleId: string) => boolean
  reload: () => Promise<void>
}

type ProviderProps = { user: User | null; children: ReactNode; initialContext?: MunicipalAccessContextValue | null }

const AccessContext = createContext<MunicipalAccessContextValue | null>(null)

export async function resolveMunicipalAccess(): Promise<MunicipalAccessContextValue> {
  if (!supabase) throw new Error('O serviço municipal não está configurado.')
  const [{ data, error }, foundationResponse] = await Promise.all([
    supabase.rpc('municipal_governance_get_my_context'),
    supabase.rpc('municipal_foundation_get_my_context'),
  ])
  if (error) throw new Error(error.message)
  if (foundationResponse.error) throw new Error(foundationResponse.error.message)
  const raw = (data || {}) as Record<string, unknown>
  const foundationRaw = (foundationResponse.data || {}) as Record<string, unknown>
  const user = raw.user as Record<string, unknown> | null
  const assignments = Array.isArray(raw.assignments) ? raw.assignments as Record<string, unknown>[] : []
  const normalizedAssignments = assignments.map((assignment) => ({
    id: String(assignment.id || ''),
    orgUnitId: String(assignment.org_unit_id || ''),
    orgUnitName: String(assignment.org_unit_name || ''),
    roleId: String(assignment.role_id || ''),
    roleLabel: String(assignment.role_label || ''),
    moduleIds: Array.isArray(assignment.module_ids) ? assignment.module_ids.map(String) : [],
    scopes: Array.isArray(assignment.scopes) ? assignment.scopes.map((scope) => ({ type: String((scope as Record<string, unknown>).type || ''), key: String((scope as Record<string, unknown>).key || '') })) : [],
  }))
  const moduleIds = Array.isArray(raw.module_ids) ? raw.module_ids.map(String) : []
  const permissionIds = Array.isArray(raw.permission_ids) ? raw.permission_ids.map(String) : []
  const acs = raw.acs && typeof raw.acs === 'object' ? raw.acs as Record<string, unknown> : null
  const foundationMunicipality = foundationRaw.municipality && typeof foundationRaw.municipality === 'object' ? foundationRaw.municipality as Record<string, unknown> : null
  const foundationProfessional = foundationRaw.professional && typeof foundationRaw.professional === 'object' ? foundationRaw.professional as Record<string, unknown> : null
  const foundationAssignments = Array.isArray(foundationRaw.assignments) ? foundationRaw.assignments as Record<string, unknown>[] : []
  const foundation: MunicipalFoundationContext = {
    status: foundationRaw.status === 'ready' ? 'ready' : 'pending-assignment',
    municipality: foundationMunicipality ? {
      id: String(foundationMunicipality.id || ''), code: String(foundationMunicipality.code || ''), name: String(foundationMunicipality.name || ''), stateCode: String(foundationMunicipality.state_code || ''), active: foundationMunicipality.active !== false,
    } : null,
    professional: foundationProfessional ? {
      id: String(foundationProfessional.id || ''), userId: Number(foundationProfessional.user_id || 0), municipalityId: String(foundationProfessional.municipality_id || ''), fullName: String(foundationProfessional.full_name || ''), cns: foundationProfessional.cns ? String(foundationProfessional.cns) : null, cbo: foundationProfessional.cbo ? String(foundationProfessional.cbo) : null, professionalCategory: String(foundationProfessional.professional_category || ''), active: foundationProfessional.active !== false,
    } : null,
    assignments: foundationAssignments.map((assignment) => ({
      id: String(assignment.id || ''), roleId: String(assignment.role_id || ''), municipalityId: String(assignment.municipality_id || ''), establishmentId: assignment.establishment_id ? String(assignment.establishment_id) : null, teamId: assignment.team_id ? String(assignment.team_id) : null, microareaId: assignment.microarea_id ? String(assignment.microarea_id) : null, validFrom: String(assignment.valid_from || ''), validUntil: assignment.valid_until ? String(assignment.valid_until) : null,
    })),
  }
  const status = raw.status === 'inactive' || raw.status === 'pending-assignment' ? raw.status : user ? 'ready' : 'pending-assignment'
  return {
    status,
    user: user ? { id: Number(user.id), authUserId: String(user.auth_user_id || ''), name: String(user.name || ''), email: String(user.email || ''), avatarUrl: user.avatar_url ? String(user.avatar_url) : null, firstAccessPending: user.first_access_pending === true } : null,
    isAdministrator: raw.is_administrator === true,
    assignments: normalizedAssignments,
    moduleIds,
    permissionIds,
    acs: acs ? { id: String(acs.id || ''), fullName: String(acs.full_name || ''), active: acs.active !== false } : null,
    foundation,
    error: null,
    hasModule: (moduleId) => moduleIds.includes(moduleId),
    hasPermission: (permissionId) => permissionIds.includes(permissionId),
    hasRole: (roleId) => normalizedAssignments.some((assignment) => assignment.roleId === roleId),
    reload: async () => undefined,
  }
}

export function MunicipalAccessProvider({ user, children, initialContext }: ProviderProps) {
  const [context, setContext] = useState<MunicipalAccessContextValue | null>(initialContext || null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    if (!user) { setContext(null); return }
    try {
      setError(null)
      const next = await resolveMunicipalAccess()
      setContext(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível validar o acesso municipal.')
    }
  }, [user])
  useEffect(() => { if (user) void reload(); else if (initialContext) setContext(initialContext) }, [initialContext, reload, user])
  const value = useMemo<MunicipalAccessContextValue>(() => context ? { ...context, error, reload } : {
    status: 'error', user: null, isAdministrator: false, assignments: [], moduleIds: [], permissionIds: [], acs: null, foundation: null, error, hasModule: () => false, hasPermission: () => false, hasRole: () => false, reload,
  }, [context, error, reload])
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
}

export function useMunicipalAccess() {
  const value = useContext(AccessContext)
  if (!value) throw new Error('useMunicipalAccess deve ser usado dentro de MunicipalAccessProvider.')
  return value
}
